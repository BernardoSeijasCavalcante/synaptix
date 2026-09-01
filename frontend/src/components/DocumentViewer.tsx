import { useState, useRef, useEffect } from 'react';
import { Document, Page, pdfjs } from 'react-pdf';
import { useCommentsStore } from '../store/useCommentsStore';
import 'react-pdf/dist/esm/Page/AnnotationLayer.css';
import 'react-pdf/dist/esm/Page/TextLayer.css';
import { ChevronLeft, ChevronRight, ZoomIn, ZoomOut } from 'lucide-react';

pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url,
).toString();

interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

export const DocumentViewer = ({ noteId, fileUrl }: { noteId: number, fileUrl: string }) => {
  const [numPages, setNumPages] = useState<number>();
  const [pageNumber, setPageNumber] = useState<number>(1);
  const [scale, setScale] = useState(1.0);
  
  const [isDrawing, setIsDrawing] = useState(false);
  const [startPos, setStartPos] = useState({ x: 0, y: 0 });
  const [currentBox, setCurrentBox] = useState<Box | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);
  const { createComment, comments, fetchComments } = useCommentsStore();

  useEffect(() => {
    fetchComments(noteId);
  }, [noteId, fetchComments]);

  const onDocumentLoadSuccess = ({ numPages }: { numPages: number }) => {
    setNumPages(numPages);
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const x = (e.clientX - rect.left) / scale;
    const y = (e.clientY - rect.top) / scale;
    setIsDrawing(true);
    setStartPos({ x, y });
    setCurrentBox({ x, y, width: 0, height: 0 });
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDrawing || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const currentX = (e.clientX - rect.left) / scale;
    const currentY = (e.clientY - rect.top) / scale;
    
    setCurrentBox({
      x: Math.min(startPos.x, currentX),
      y: Math.min(startPos.y, currentY),
      width: Math.abs(currentX - startPos.x),
      height: Math.abs(currentY - startPos.y)
    });
  };

  const handleMouseUp = async () => {
    if (!isDrawing) return;
    setIsDrawing(false);
    
    if (currentBox && currentBox.width > 5 && currentBox.height > 5) {
      const content = prompt("Digite seu comentário para esta área:");
      if (content) {
        await createComment(
          noteId, 
          content, 
          "", 
          Math.round(currentBox.x), 
          Math.round(currentBox.y), 
          Math.round(currentBox.width), 
          Math.round(currentBox.height), 
          pageNumber
        );
      }
    }
    setCurrentBox(null);
  };

  const pageComments = comments.filter(c => c.page_number === pageNumber);

  return (
    <div className="flex-1 flex flex-col items-center bg-slate-900 overflow-y-auto p-4 relative">
      <div className="flex gap-4 items-center mb-4 bg-slate-800 p-2 rounded shadow-md sticky top-0 z-50">
        <button onClick={() => setPageNumber(p => Math.max(1, p - 1))} disabled={pageNumber <= 1} className="p-1 hover:bg-slate-700 rounded text-gray-300 disabled:opacity-50">
          <ChevronLeft size={20} />
        </button>
        <span className="text-gray-300 text-sm">
          Página {pageNumber} de {numPages || '--'}
        </span>
        <button onClick={() => setPageNumber(p => Math.min(numPages || p, p + 1))} disabled={pageNumber >= (numPages || 1)} className="p-1 hover:bg-slate-700 rounded text-gray-300 disabled:opacity-50">
          <ChevronRight size={20} />
        </button>
        
        <div className="w-px h-6 bg-slate-700 mx-2"></div>
        
        <button onClick={() => setScale(s => s - 0.1)} className="p-1 hover:bg-slate-700 rounded text-gray-300">
          <ZoomOut size={20} />
        </button>
        <span className="text-gray-300 text-sm w-12 text-center">{Math.round(scale * 100)}%</span>
        <button onClick={() => setScale(s => s + 0.1)} className="p-1 hover:bg-slate-700 rounded text-gray-300">
          <ZoomIn size={20} />
        </button>
      </div>

      <div className="relative shadow-xl" style={{ transformOrigin: 'top center' }}>
        <Document
          file={fileUrl}
          onLoadSuccess={onDocumentLoadSuccess}
          className="border border-slate-700"
        >
          <Page 
            pageNumber={pageNumber} 
            scale={scale}
            renderTextLayer={false}
            renderAnnotationLayer={false}
          />
        </Document>

        <div 
          ref={containerRef}
          className="absolute inset-0 z-10 cursor-crosshair"
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
          style={{ width: '100%', height: '100%' }}
        >
          {currentBox && (
            <div 
              className="absolute border-2 border-yellow-500 bg-yellow-500/20"
              style={{
                left: `${currentBox.x * scale}px`,
                top: `${currentBox.y * scale}px`,
                width: `${currentBox.width * scale}px`,
                height: `${currentBox.height * scale}px`
              }}
            />
          )}

          {pageComments.map(comment => (
            comment.x_position != null && comment.y_position != null && (
              <div 
                key={comment.id}
                className="absolute border-2 border-blue-500 bg-blue-500/20 group hover:bg-blue-500/40 hover:border-yellow-400 transition-colors cursor-pointer"
                style={{
                  left: `${comment.x_position * scale}px`,
                  top: `${comment.y_position * scale}px`,
                  width: `${(comment.width || 50) * scale}px`,
                  height: `${(comment.height || 50) * scale}px`
                }}
              >
                <div className="absolute -top-8 left-0 bg-blue-900 text-white text-xs p-1 rounded hidden group-hover:block whitespace-nowrap z-50">
                  {comment.content.substring(0, 30)}...
                </div>
              </div>
            )
          ))}
        </div>
      </div>
      <p className="text-gray-500 text-xs mt-4">Clique e arraste sobre o documento para criar um comentário com área de seleção.</p>
    </div>
  );
};
