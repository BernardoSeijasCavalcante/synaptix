import { useState, useRef, useEffect, useMemo, type MouseEvent } from 'react';
import { Document, Page, pdfjs } from 'react-pdf';
import { useNotesStore } from '../store/useNotesStore';
import { usePromptStore } from '../store/usePromptStore';
import { useCommentsStore } from '../store/useCommentsStore';
import { ChevronLeft, ChevronRight, ZoomIn, ZoomOut, PanelRight, FileText, X, FolderInput, Trash2, Lock, Unlock, Key, Loader2, AlertCircle } from 'lucide-react';
import 'react-pdf/dist/Page/AnnotationLayer.css';
import 'react-pdf/dist/Page/TextLayer.css';
import { PasswordModal, type PasswordModalMode } from './PasswordModal';


// Set up the local worker for react-pdf bundled by Vite
pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url
).toString();

export const DocumentViewer = ({ 
  hoveredCommentId, 
  pageNumber, 
  setPageNumber,
  isSidebarOpen,
  onToggleSidebar,
  onScroll,
  editingCommentRectId,
  setEditingCommentRectId
}: { 
  hoveredCommentId: number | null, 
  pageNumber: number, 
  setPageNumber: (page: number | ((p: number) => number)) => void,
  isSidebarOpen?: boolean,
  onToggleSidebar?: () => void,
  onScroll?: () => void,
  editingCommentRectId?: number | null,
  setEditingCommentRectId?: (id: number | null) => void
}) => {
  const { 
    notes, activeNoteId, openTransferModal, deleteNote, setActiveNote,
    lockNote, setNotePassword, removeNotePassword 
  } = useNotesStore();
  const { comments, createComment, updateCommentRect } = useCommentsStore();
  const activeNote = notes.find(n => n.id === activeNoteId);

  const [passwordModalOpen, setPasswordModalOpen] = useState(false);
  const [passwordModalMode, setPasswordModalMode] = useState<PasswordModalMode>('set');
  const [showSecurityMenu, setShowSecurityMenu] = useState(false);


  const [numPages, setNumPages] = useState<number>();
  const [scale, setScale] = useState(1.0);
  const [pdfData, setPdfData] = useState<Uint8Array | null>(null);
  const [isLoadingPdf, setIsLoadingPdf] = useState(false);
  const [loadPdfError, setLoadPdfError] = useState<string | null>(null);

  const fileProp = useMemo(() => {
    if (!pdfData) return null;
    return { data: pdfData };
  }, [pdfData]);

  const [isSelecting, setIsSelecting] = useState(false);
  const [selectionBox, setSelectionBox] = useState<{ x: number, y: number, w: number, h: number } | null>(null);
  const [startPoint, setStartPoint] = useState<{ x: number, y: number } | null>(null);

  const pageRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadEncryptedPdf() {
      if (!activeNote?.file_url) {
        setPdfData(null);
        setIsLoadingPdf(false);
        setLoadPdfError(null);
        return;
      }

      setIsLoadingPdf(true);
      setLoadPdfError(null);
      setPdfData(null);

      try {
        let cleanPath = activeNote.file_url;
        try {
          const parsed = new URL(cleanPath, window.location.origin);
          cleanPath = parsed.pathname;
        } catch {
          cleanPath = cleanPath.replace(/^https?:\/\/[^/]+/, '');
        }
        const res = await fetch(cleanPath);
        if (!res.ok) {
          throw new Error(`Erro ao baixar arquivo PDF (Status ${res.status})`);
        }
        const arrayBuffer = await res.arrayBuffer();
        if (cancelled) return;
        setPdfData(new Uint8Array(arrayBuffer));
      } catch (e: any) {
        if (!cancelled) {
          console.error('Erro ao carregar PDF:', e);
          setLoadPdfError(e?.message || 'Falha ao carregar o arquivo PDF.');
          setPdfData(null);
        }
      } finally {
        if (!cancelled) {
          setIsLoadingPdf(false);
        }
      }
    }

    setNumPages(undefined);
    setPageNumber((prev) => (prev && prev > 1 ? prev : 1));
    loadEncryptedPdf();

    return () => {
      cancelled = true;
    };
  }, [activeNote?.id, activeNote?.file_url]);

  if (!activeNote || !activeNote.file_url) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-slate-400 p-8">
        <div className="glass-card p-8 rounded-2xl text-center border border-white/10">
          <FileText size={32} className="mx-auto mb-2 text-slate-500" />
          <span>Nenhum documento PDF carregado nesta nota.</span>
        </div>
      </div>
    );
  }

  const onDocumentLoadSuccess = ({ numPages }: { numPages: number }) => {
    setNumPages(numPages);
    setPageNumber((prev) => {
      const current = typeof prev === 'function' ? 1 : prev;
      return Math.min(Math.max(1, current), numPages);
    });
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
      
      const rect = pageRef.current.getBoundingClientRect();
      const rect_x1 = Math.round((selectionBox.x / rect.width) * 10000);
      const rect_y1 = Math.round((selectionBox.y / rect.height) * 10000);
      const rect_x2 = Math.round(((selectionBox.x + selectionBox.w) / rect.width) * 10000);
      const rect_y2 = Math.round(((selectionBox.y + selectionBox.h) / rect.height) * 10000);

      if (editingCommentRectId) {
        await updateCommentRect(editingCommentRectId, rect_x1, rect_y1, rect_x2, rect_y2, pageNumber);
        setEditingCommentRectId?.(null);
      } else {
        const content = await usePromptStore.getState().openPrompt("Digite seu comentário para a área selecionada:");
        if (!content) {
          setSelectionBox(null);
          return;
        }
        await createComment(activeNote.id, content, '', pageNumber, rect_x1, rect_y1, rect_x2, rect_y2);
      }
      setSelectionBox(null);
    } else {
      setSelectionBox(null);
    }
  };

  const pageComments = comments.filter(c => c.page_number === pageNumber);

  return (
    <div className="flex-1 flex flex-col h-full bg-transparent text-slate-100 overflow-hidden">
      {/* Top Glass Control Toolbar */}
      <div className="glass-panel-subtle px-6 py-3.5 border-b border-white/10 flex flex-wrap justify-between items-center gap-4 shrink-0">
        <div className="flex items-center gap-3 truncate max-w-lg">
          <h2 className="text-lg font-bold text-white truncate">{activeNote.title}</h2>
          <div className="flex items-center gap-1.5 shrink-0">
            {/* Controle de Proteção por Senha da Nota PDF */}
            <div className="relative">
              {activeNote.is_password_protected ? (
                <>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setShowSecurityMenu(!showSecurityMenu);
                    }}
                    className="glass-btn-ghost hover:bg-amber-500/15 hover:border-amber-500/30 text-amber-300 flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-xs transition-all border border-amber-500/30"
                    title="Gerenciar Proteção por Senha"
                  >
                    <Lock size={14} className="text-amber-400" />
                    <span className="hidden sm:inline">Protegida</span>
                  </button>
                  {showSecurityMenu && (
                    <div 
                      className="absolute left-0 top-full mt-1.5 w-44 bg-slate-900 border border-white/15 rounded-xl shadow-2xl py-1 z-50 text-xs"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <button
                        onClick={() => {
                          setShowSecurityMenu(false);
                          lockNote(activeNote.id);
                        }}
                        className="w-full text-left px-3.5 py-2 hover:bg-white/10 text-slate-200 flex items-center gap-2"
                      >
                        <Lock size={13} className="text-amber-400" />
                        <span>Bloquear Agora</span>
                      </button>
                      <button
                        onClick={() => {
                          setShowSecurityMenu(false);
                          setPasswordModalMode('change');
                          setPasswordModalOpen(true);
                        }}
                        className="w-full text-left px-3.5 py-2 hover:bg-white/10 text-slate-200 flex items-center gap-2"
                      >
                        <Key size={13} className="text-amber-400" />
                        <span>Alterar Senha</span>
                      </button>
                      <button
                        onClick={() => {
                          setShowSecurityMenu(false);
                          setPasswordModalMode('remove');
                          setPasswordModalOpen(true);
                        }}
                        className="w-full text-left px-3.5 py-2 hover:bg-rose-500/20 text-rose-300 flex items-center gap-2"
                      >
                        <Unlock size={13} className="text-rose-400" />
                        <span>Remover Senha</span>
                      </button>
                    </div>
                  )}
                </>
              ) : (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setPasswordModalMode('set');
                    setPasswordModalOpen(true);
                  }}
                  className="glass-btn-ghost hover:bg-amber-500/15 hover:border-amber-500/30 hover:text-amber-300 text-slate-300 flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-xs transition-all"
                  title="Adicionar Senha a este Documento"
                >
                  <Key size={14} className="text-slate-400" />
                  <span className="hidden sm:inline">Proteger</span>
                </button>
              )}
            </div>

            <button
              onClick={() => openTransferModal(activeNote)}
              className="glass-btn-ghost hover:bg-amber-500/15 hover:border-amber-500/30 hover:text-amber-300 text-slate-300 flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-xs transition-all"
              title="Transferir arquivo para outro Caderno ou Workspace"
            >
              <FolderInput size={14} />
              <span>Mover</span>
            </button>
            <button
              onClick={() => {
                if (confirm(`Deseja excluir "${activeNote.title}"?`)) {
                  deleteNote(activeNote.id);
                  setActiveNote(null);
                }
              }}
              className="glass-btn-ghost hover:bg-rose-500/15 hover:border-rose-500/30 hover:text-rose-300 text-slate-400 p-1.5 rounded-xl text-xs transition-all"
              title="Excluir arquivo"
            >
              <Trash2 size={14} />
            </button>
          </div>

        </div>
        
        <div className="flex items-center gap-2 glass-panel p-1 rounded-xl border border-white/10">
          <button 
            disabled={pageNumber <= 1} 
            onClick={() => setPageNumber(p => p - 1)}
            className="p-1.5 hover:text-amber-400 hover:bg-white/10 rounded-lg disabled:opacity-40 transition"
            title="Página Anterior"
          >
            <ChevronLeft size={16} />
          </button>
          <span className="text-xs font-mono font-medium px-2 text-slate-300">
            {pageNumber} / {numPages || '--'}
          </span>
          <button 
            disabled={pageNumber >= (numPages || 1)} 
            onClick={() => setPageNumber(p => p + 1)}
            className="p-1.5 hover:text-amber-400 hover:bg-white/10 rounded-lg disabled:opacity-40 transition"
            title="Próxima Página"
          >
            <ChevronRight size={16} />
          </button>
          
          <div className="w-px h-4 bg-white/10 mx-1"></div>
          
          <button 
            onClick={() => setScale(s => Math.max(0.5, s - 0.2))} 
            className="p-1.5 hover:text-amber-400 hover:bg-white/10 rounded-lg transition"
            title="Diminuir Zoom"
          >
            <ZoomOut size={15} />
          </button>
          <span className="text-xs font-mono w-10 text-center text-slate-300">{Math.round(scale * 100)}%</span>
          <button 
            onClick={() => setScale(s => Math.min(3, s + 0.2))} 
            className="p-1.5 hover:text-amber-400 hover:bg-white/10 rounded-lg transition"
            title="Aumentar Zoom"
          >
            <ZoomIn size={15} />
          </button>
          
          {onToggleSidebar && (
            <>
              <div className="w-px h-4 bg-white/10 mx-1"></div>
              <button 
                onClick={onToggleSidebar} 
                className={`p-1.5 rounded-lg transition-colors ${isSidebarOpen ? 'text-amber-400 bg-amber-500/15' : 'text-slate-400 hover:text-amber-400 hover:bg-white/10'}`}
                title="Alternar Sidebar de Comentários"
              >
                <PanelRight size={15} />
              </button>
            </>
          )}
        </div>
      </div>

      {editingCommentRectId && (
        <div className="absolute top-16 left-1/2 -translate-x-1/2 z-50 glass-btn-gold px-4 py-2 rounded-full font-semibold shadow-2xl flex items-center gap-2 text-xs">
          <span>Selecione a nova área no documento para atualizar o comentário</span>
          <button 
            onClick={() => setEditingCommentRectId?.(null)}
            className="p-1 hover:bg-white/20 rounded-full transition-colors ml-1"
          >
            <X size={14} />
          </button>
        </div>
      )}

      {/* Document View Area with Glass Stage */}
      <div className="flex-1 overflow-auto p-8 flex justify-center items-start relative select-none" onScroll={onScroll}>
        <div 
          className={`relative inline-block w-fit h-fit shadow-2xl rounded-xl overflow-hidden border border-white/10 ${editingCommentRectId ? 'cursor-crosshair ring-4 ring-amber-400/60' : ''}`} 
          ref={pageRef}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
        >
          {isLoadingPdf && (
            <div className="flex flex-col items-center justify-center p-12 text-amber-300 gap-3 min-w-[360px] min-h-[480px] glass-card rounded-2xl border border-white/10">
              <Loader2 className="animate-spin text-amber-400" size={36} />
              <span className="text-sm font-medium">Carregando documento PDF...</span>
            </div>
          )}

          {loadPdfError && !isLoadingPdf && (
            <div className="flex flex-col items-center justify-center p-12 text-rose-300 gap-3 min-w-[360px] min-h-[480px] glass-card rounded-2xl border border-rose-500/20">
              <AlertCircle className="text-rose-400" size={36} />
              <span className="text-sm font-medium">{loadPdfError}</span>
            </div>
          )}

          {fileProp && !isLoadingPdf && !loadPdfError && (
            <Document
              file={fileProp}
              onLoadSuccess={onDocumentLoadSuccess}
              onLoadError={(err) => {
                console.error('Falha ao renderizar PDF no react-pdf:', err);
                setLoadPdfError('Falha ao renderizar as páginas do PDF.');
              }}
              loading={
                <div className="flex flex-col items-center justify-center p-12 text-amber-300 gap-3 min-w-[360px] min-h-[480px] glass-card rounded-2xl border border-white/10">
                  <Loader2 className="animate-spin text-amber-400" size={36} />
                  <span className="text-sm font-medium">Renderizando páginas do documento...</span>
                </div>
              }
              error={
                <div className="flex flex-col items-center justify-center p-12 text-rose-300 gap-3 min-w-[360px] min-h-[480px] glass-card rounded-2xl border border-rose-500/20">
                  <AlertCircle className="text-rose-400" size={36} />
                  <span className="text-sm font-medium">Não foi possível carregar as páginas do PDF.</span>
                </div>
              }
              className="rounded"
            >
              <Page 
                pageNumber={pageNumber} 
                scale={scale} 
                renderTextLayer={true}
                renderAnnotationLayer={true}
              />
            </Document>
          )}

          {/* Selection overlay */}
          {selectionBox && (
            <div 
              className="absolute bg-amber-500/25 border-2 border-amber-400 rounded-md pointer-events-none shadow-[0_0_15px_rgba(234,179,8,0.3)]"
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
              
              const isCommentHovered = hoveredCommentId === comment.id;

              return (
                <div 
                  key={comment.id}
                  data-pdf-comment-id={comment.id}
                  className={`absolute border-2 rounded cursor-pointer group transition-all ${
                    isCommentHovered 
                      ? 'border-amber-400 bg-amber-500/40 z-10 shadow-[0_0_15px_rgba(234,179,8,0.35)]' 
                      : 'border-amber-500/70 bg-amber-500/15 hover:bg-amber-500/30'
                  }`}
                  style={{
                    left: `${x1 * 100}%`,
                    top: `${y1 * 100}%`,
                    width: `${(x2 - x1) * 100}%`,
                    height: `${(y2 - y1) * 100}%`,
                  }}
                  title={comment.content}
                >
                  <div className="absolute -top-2.5 -right-2.5 bg-amber-400 text-slate-950 font-bold rounded-full w-5 h-5 flex items-center justify-center text-[10px] shadow-md opacity-0 group-hover:opacity-100 transition-opacity">
                    #
                  </div>
                </div>
              );
            }
            return null;
          })}
        </div>
      </div>

      <PasswordModal
        isOpen={passwordModalOpen}
        onClose={() => setPasswordModalOpen(false)}
        mode={passwordModalMode}
        itemType="Nota"
        itemName={activeNote?.title || ''}
        onSubmit={async (data) => {
          if (!activeNoteId) return;
          if (passwordModalMode === 'set') {
            await setNotePassword(activeNoteId, data.password);
          } else if (passwordModalMode === 'change') {
            await setNotePassword(activeNoteId, data.password, data.currentPassword);
          } else if (passwordModalMode === 'remove') {
            await removeNotePassword(activeNoteId, data.password);
          }
        }}
      />
    </div>
  );
};

