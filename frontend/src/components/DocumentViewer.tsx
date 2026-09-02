import { useState, useRef, MouseEvent } from 'react';
import { Document, Page, pdfjs } from 'react-pdf';
import { useNotesStore } from '../store/useNotesStore';
import { useCommentsStore } from '../store/useCommentsStore';
import { ChevronLeft, ChevronRight, ZoomIn, ZoomOut } from 'lucide-react';
import 'react-pdf/dist/Page/AnnotationLayer.css';
import 'react-pdf/dist/Page/TextLayer.css';

// Set up the worker for react-pdf
pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

export const DocumentViewer = ({ hoveredCommentId }: { hoveredCommentId: number | null }) => {
  const { notes, activeNoteId } = useNotesStore();
  const { comments, createComment } = useCommentsStore();
  const activeNote = notes.find(n => n.id === activeNoteId);

  const [numPages, setNumPages] = useState<number>();
  const [pageNumber, setPageNumber] = useState<number>(1);
  const [scale, setScale] = useState(1.0);

  const [isSelecting, setIsSelecting] = useState(false);
  const [selectionBox, setSelectionBox] = useState<{ x: number, y: number, w: number, h: number } | null>(null);
  const [startPoint, setStartPoint] = useState<{ x: number, y: number } | null>(null);

  const pageRef = useRef<HTMLDivElement>(null);

  if (!activeNote || !activeNote.file_url) {
    return <div className="text-white p-8">Nenhum arquivo encontrado.</div>;
  }

  const onDocumentLoadSuccess = ({ numPages }: { numPages: number }) => {
    setNumPages(numPages);
  };

  const handleMouseDown = (e: MouseEvent<HTMLDivElement>) => {
    if (!pageRef.current) return;
    const rect = pageRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    
    setStartPoint({ x, y });
    setSelectionBox(null);
    setIsSelecting(true);
  };

  const handleMouseMove = (e: MouseEvent<HTMLDivElement>) => {
    if (!isSelecting || !startPoint || !pageRef.current) return;
    const rect = pageRef.current.getBoundingClientRect();
    const currentX = e.clientX - rect.left;
    const currentY = e.clientY - rect.top;

    const x = Math.min(startPoint.x, currentX);
    const y = Math.min(startPoint.y, currentY);
    const w = Math.abs(currentX - startPoint.x);
    const h = Math.abs(currentY - startPoint.y);

    setSelectionBox({ x, y, w, h });
  };

  const handleMouseUp = async () => {
    setIsSelecting(false);
    if (selectionBox && selectionBox.w > 10 && selectionBox.h > 10) {
      if (!pageRef.current || !activeNote) return;
      
      const content = prompt("Digite seu comentário para a área selecionada:");
      if (!content) {
        setSelectionBox(null);
        return;
      }
      
      const rect = pageRef.current.getBoundingClientRect();
      // Store as percentages * 10000 for integer precision
      const rect_x1 = Math.round((selectionBox.x / rect.width) * 10000);
      const rect_y1 = Math.round((selectionBox.y / rect.height) * 10000);
      const rect_x2 = Math.round(((selectionBox.x + selectionBox.w) / rect.width) * 10000);
      const rect_y2 = Math.round(((selectionBox.y + selectionBox.h) / rect.height) * 10000);

      await createComment(activeNote.id, content, '', pageNumber, rect_x1, rect_y1, rect_x2, rect_y2);
      setSelectionBox(null);
    } else {
      setSelectionBox(null);
    }
  };

  const pageComments = comments.filter(c => c.page_number === pageNumber);

  return (
    <div className="flex-1 flex flex-col h-full bg-[#0a1128] text-gray-100 overflow-hidden">
      <div className="flex flex-col p-4 border-b border-slate-800 gap-4 shrink-0 bg-[#0a1128]">
        <div className="flex justify-between items-center">
          <h2 className="text-xl font-bold text-white truncate">{activeNote.title}</h2>
          
          <div className="flex items-center gap-4 bg-slate-900 rounded p-1">
            <button 
              disabled={pageNumber <= 1} 
              onClick={() => setPageNumber(p => p - 1)}
              className="p-1 hover:text-yellow-400 disabled:opacity-50"
            >
              <ChevronLeft size={20} />
            </button>
            <span className="text-sm">
              Página {pageNumber} de {numPages || '--'}
            </span>
            <button 
              disabled={pageNumber >= (numPages || 1)} 
              onClick={() => setPageNumber(p => p + 1)}
              className="p-1 hover:text-yellow-400 disabled:opacity-50"
            >
              <ChevronRight size={20} />
            </button>
            
            <div className="w-px h-4 bg-slate-700 mx-2"></div>
            
            <button onClick={() => setScale(s => Math.max(0.5, s - 0.2))} className="p-1 hover:text-yellow-400">
              <ZoomOut size={18} />
            </button>
            <span className="text-sm w-12 text-center">{Math.round(scale * 100)}%</span>
            <button onClick={() => setScale(s => Math.min(3, s + 0.2))} className="p-1 hover:text-yellow-400">
              <ZoomIn size={18} />
            </button>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-auto bg-slate-950 p-8 flex justify-center relative select-none">
        <div 
          className="relative inline-block shadow-2xl" 
          ref={pageRef}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
        >
          <Document
            file={activeNote.file_url}
            onLoadSuccess={onDocumentLoadSuccess}
            className="rounded"
          >
            <Page 
              pageNumber={pageNumber} 
              scale={scale} 
              renderTextLayer={true}
              renderAnnotationLayer={true}
            />
          </Document>

          {/* Selection overlay */}
          {selectionBox && (
            <div 
              className="absolute bg-yellow-500/30 border-2 border-yellow-500 rounded pointer-events-none"
              style={{
                left: selectionBox.x,
                top: selectionBox.y,
                width: selectionBox.w,
                height: selectionBox.h,
              }}
            />
          )}

          {/* Render comments as boxes overlaying the document */}
          {pageComments.map(comment => {
            if (comment.rect_x1 != null && comment.rect_y1 != null && comment.rect_x2 != null && comment.rect_y2 != null) {
              const x1 = (comment.rect_x1 / 10000);
              const y1 = (comment.rect_y1 / 10000);
              const x2 = (comment.rect_x2 / 10000);
              const y2 = (comment.rect_y2 / 10000);
              
              return (
                <div 
                  key={comment.id}
                  className={`absolute border-2 rounded cursor-pointer group hover:bg-yellow-500/40 transition-colors ${hoveredCommentId === comment.id ? 'border-yellow-400 bg-yellow-500/40 z-10' : 'border-yellow-500/80 bg-yellow-500/20'}`}
                  style={{
                    left: `${x1 * 100}%`,
                    top: `${y1 * 100}%`,
                    width: `${(x2 - x1) * 100}%`,
                    height: `${(y2 - y1) * 100}%`,
                  }}
                  title={comment.content}
                >
                  <div className="absolute -top-3 -right-3 bg-yellow-500 text-slate-900 rounded-full w-6 h-6 flex items-center justify-center font-bold text-xs opacity-0 group-hover:opacity-100 transition-opacity">
                    #
                  </div>
                </div>
              );
            }
            return null;
          })}
        </div>
      </div>
    </div>
  );
};
