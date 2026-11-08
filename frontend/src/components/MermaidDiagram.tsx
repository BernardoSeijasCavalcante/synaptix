import React, { useEffect, useRef, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import mermaid from 'mermaid';
import { 
  Copy, 
  Check, 
  Maximize2, 
  AlertCircle, 
  FileDown, 
  ZoomIn, 
  ZoomOut, 
  RotateCcw, 
  X, 
  Move,
  Sparkles
} from 'lucide-react';

interface MermaidDiagramProps {
  chart: string;
  title?: string;
  onInsertIntoNote?: (code: string) => void;
}

// Configura o tema do Mermaid uma única vez com isolamento de erros
mermaid.initialize({
  startOnLoad: false,
  suppressErrorRendering: true,
  theme: 'dark',
  securityLevel: 'loose',
  themeVariables: {
    darkMode: true,
    background: 'transparent',
    primaryColor: '#8b5cf6',
    primaryTextColor: '#f8fafc',
    primaryBorderColor: '#a78bfa',
    lineColor: '#eab308',
    secondaryColor: '#3b82f6',
    tertiaryColor: '#1e293b',
    edgeLabelBackground: '#0f172a',
    nodeBorder: '#a78bfa',
    clusterBkg: '#0f172a80',
    clusterBorder: '#64748b',
    defaultLinkColor: '#eab308',
    fontFamily: 'ui-sans-serif, system-ui, sans-serif',
  },
});

export function sanitizeMermaidCode(raw: string): string {
  let code = raw.trim().replace(/^```mermaid\s*/i, '').replace(/\s*```$/i, '').trim();
  if (!code) return '';

  // 1. Decodifica entidades HTML que possam ter sido injetadas (&gt; -> >, &lt; -> <, &amp; -> &, &quot; -> ", &#39; -> ')
  code = code
    .replace(/&gt;/g, '>')
    .replace(/&lt;/g, '<')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&');

  const lines = code.split('\n');
  const sanitizedLines = lines.map((line) => {
    let l = line;
    // 2. Aspas automáticas em nós retangulares com caracteres matemáticos/especiais: A[Σ = {a, b}] -> A["Σ = {a, b}"]
    l = l.replace(
      /([a-zA-Z0-9_-]+)\[([^"\]\n]*?[{}()=;,|<>εΣλ∅→*+\\₁₂₃₄₅₆₇₈₉₀][^"\]\n]*?)\]/g,
      (_match, id, text) => {
        const cleanText = text.replace(/"/g, "'");
        return `${id}["${cleanText}"]`;
      }
    );

    // 3. Aspas automáticas em nós arredondados: A(q0: {a}) -> A("q0: {a}")
    l = l.replace(
      /([a-zA-Z0-9_-]+)\((?!\[|\()([^"\)\n]*?[{}[\]=;,|<>εΣλ∅→*+\\₁₂₃₄₅₆₇₈₉₀][^"\)\n]*?)\)(?!\]|\))/g,
      (_match, id, text) => {
        const cleanText = text.replace(/"/g, "'");
        return `${id}("${cleanText}")`;
      }
    );

    return l;
  });

  return sanitizedLines.join('\n');
}

export const MermaidDiagram: React.FC<MermaidDiagramProps> = ({ chart, title, onInsertIntoNote }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const modalCanvasRef = useRef<HTMLDivElement>(null);

  const [svgContent, setSvgContent] = useState<string>('');
  const [renderError, setRenderError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // Estados do Modal Centralizado de Tela Cheia com Pan & Zoom
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const dragStartRef = useRef({ x: 0, y: 0 });

  const cleanChart = sanitizeMermaidCode(chart);

  useEffect(() => {
    let isMounted = true;

    if (!cleanChart) {
      setSvgContent('');
      setRenderError(null);
      return;
    }

    const uniqueId = `mermaid-${Math.random().toString(36).substring(2, 9)}`;

    mermaid
      .render(uniqueId, cleanChart)
      .then(({ svg }) => {
        if (isMounted) {
          setSvgContent(svg);
          setRenderError(null);
        }
      })
      .catch((err) => {
        if (isMounted) {
          console.warn('Erro ao renderizar diagrama Mermaid:', err);
          document.getElementById(uniqueId)?.remove();
          document.getElementById(`d${uniqueId}`)?.remove();
          setRenderError(err?.message || 'Diagrama conceitual simplificado.');
          setSvgContent('');
        }
      });

    return () => {
      isMounted = false;
      document.getElementById(uniqueId)?.remove();
      document.getElementById(`d${uniqueId}`)?.remove();
    };
  }, [cleanChart]);

  const handleCopy = () => {
    navigator.clipboard.writeText(`\`\`\`mermaid\n${cleanChart}\n\`\`\``);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleOpenModal = () => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
    setIsModalOpen(true);
  };

  const handleCloseModal = useCallback(() => {
    setIsModalOpen(false);
    setIsDragging(false);
  }, []);

  const handleResetView = () => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  };

  // Trava scroll da página quando modal está aberto
  useEffect(() => {
    if (isModalOpen) {
      const prevOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = prevOverflow;
      };
    }
  }, [isModalOpen]);

  // Teclado: ESC para fechar, +/- para zoom, 0 ou R para resetar
  useEffect(() => {
    if (!isModalOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        handleCloseModal();
      } else if (e.key === '+' || e.key === '=') {
        setZoom((prev) => Math.min(Number((prev * 1.2).toFixed(2)), 5.0));
      } else if (e.key === '-' || e.key === '_') {
        setZoom((prev) => Math.max(Number((prev * 0.8).toFixed(2)), 0.25));
      } else if (e.key === '0' || e.key.toLowerCase() === 'r') {
        handleResetView();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isModalOpen, handleCloseModal]);

  // Zoom suave com a roda do mouse (Wheel)
  useEffect(() => {
    if (!isModalOpen) return;
    const canvas = modalCanvasRef.current;
    if (!canvas) return;

    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
      const zoomFactor = e.deltaY < 0 ? 1.15 : 0.85;
      setZoom((prev) => Math.min(Math.max(Number((prev * zoomFactor).toFixed(2)), 0.25), 5.0));
    };

    canvas.addEventListener('wheel', handleWheel, { passive: false });
    return () => {
      canvas.removeEventListener('wheel', handleWheel);
    };
  }, [isModalOpen]);

  // Pan / Arrastar com o mouse
  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return; // Apenas clique com botão esquerdo
    setIsDragging(true);
    dragStartRef.current = {
      x: e.clientX - pan.x,
      y: e.clientY - pan.y,
    };
  };

  useEffect(() => {
    if (!isDragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      setPan({
        x: e.clientX - dragStartRef.current.x,
        y: e.clientY - dragStartRef.current.y,
      });
    };

    const handleMouseUp = () => {
      setIsDragging(false);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging]);

  return (
    <>
      <div className="my-2.5 rounded-xl bg-slate-950/80 border border-white/10 overflow-hidden shadow-xl text-xs">
        {/* Header toolbar */}
        <div className="px-3 py-1.5 bg-slate-900/90 border-b border-white/10 flex items-center justify-between text-[11px] text-slate-400">
          <span className="font-semibold text-slate-300 flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
            {title || 'Diagrama / Autômato Formal'}
          </span>
          <div className="flex items-center gap-1">
            {onInsertIntoNote && (
              <button
                onClick={() => onInsertIntoNote(`\`\`\`mermaid\n${cleanChart}\n\`\`\`\n`)}
                className="p-1 hover:text-slate-200 hover:bg-white/10 rounded transition"
                title="Inserir diagrama na nota"
              >
                <FileDown size={12} className="text-amber-400" />
              </button>
            )}
            <button
              onClick={handleCopy}
              className="p-1 hover:text-slate-200 hover:bg-white/10 rounded transition"
              title="Copiar código Mermaid"
            >
              {copied ? <Check size={12} className="text-emerald-400" /> : <Copy size={12} />}
            </button>
            <button
              onClick={handleOpenModal}
              className="p-1 hover:text-slate-200 hover:bg-white/10 rounded transition"
              title="Expandir diagrama em tela cheia com zoom e navegação"
            >
              <Maximize2 size={12} />
            </button>
          </div>
        </div>

        {/* Diagram Viewport no Sidebar Card */}
        <div 
          onClick={handleOpenModal}
          className="p-4 flex items-center justify-center overflow-x-auto min-h-[120px] cursor-pointer group/card relative"
          title="Clique para abrir e explorar em tela cheia interativa"
        >
          {renderError ? (
            <div className="text-rose-400 flex items-center gap-2 p-2 bg-rose-500/10 rounded-lg text-xs font-mono">
              <AlertCircle size={14} className="shrink-0" />
              <span>Código visual simplificado:</span>
              <pre className="text-[10px] text-slate-300 overflow-x-auto">{chart}</pre>
            </div>
          ) : svgContent ? (
            <>
              <div
                ref={containerRef}
                className="mermaid-svg-container max-w-full flex justify-center [&>svg]:max-w-full [&>svg]:h-auto transition-transform duration-200 group-hover/card:scale-[1.02]"
                dangerouslySetInnerHTML={{ __html: svgContent }}
              />
              <div className="absolute inset-0 bg-amber-500/0 group-hover/card:bg-amber-500/[0.04] flex items-end justify-center pb-2 opacity-0 group-hover/card:opacity-100 transition-opacity pointer-events-none">
                <span className="px-2.5 py-1 rounded-full bg-slate-900/90 border border-amber-400/30 text-[10px] text-amber-300 font-medium shadow-lg flex items-center gap-1.5">
                  <Maximize2 size={10} /> Clique para explorar com Zoom e Pan
                </span>
              </div>
            </>
          ) : (
            <span className="text-slate-500 text-[11px]">Gerando representação visual...</span>
          )}
        </div>
      </div>

      {/* Modal Centralizado via React Portal no document.body (Completamente Desvinculado do Sidebar) */}
      {isModalOpen && typeof document !== 'undefined' && createPortal(
        <div 
          className="fixed inset-0 z-[99999] bg-black/80 backdrop-blur-md flex items-center justify-center p-3 sm:p-5 md:p-8 animate-in fade-in duration-200"
          onClick={handleCloseModal}
        >
          <div 
            className="w-full max-w-6xl h-[88vh] bg-slate-950/95 border border-white/15 rounded-2xl shadow-2xl flex flex-col overflow-hidden animate-in zoom-in-95 duration-200 relative"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header Toolbar do Modal */}
            <div className="px-5 py-3.5 bg-slate-900/95 border-b border-white/10 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2.5">
                <span className="w-2.5 h-2.5 rounded-full bg-amber-400 animate-pulse" />
                <h2 className="text-sm font-bold text-slate-100 flex items-center gap-2">
                  <span>{title || 'Diagrama / Modelo Formal'}</span>
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded-md bg-purple-500/20 text-purple-300 border border-purple-500/30 flex items-center gap-1">
                    <Sparkles size={11} className="text-amber-400" />
                    Interativo
                  </span>
                </h2>
              </div>

              {/* Controles de Zoom, Navegação e Ações */}
              <div className="flex items-center gap-1.5 bg-slate-950/70 p-1 rounded-xl border border-white/10">
                <button
                  onClick={() => setZoom((prev) => Math.max(Number((prev * 0.8).toFixed(2)), 0.25))}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-slate-100 hover:bg-white/10 transition"
                  title="Diminuir Zoom (-)"
                >
                  <ZoomOut size={16} />
                </button>
                <button
                  onClick={handleResetView}
                  className="px-2.5 py-1 rounded-md text-xs font-mono font-bold text-amber-300 hover:bg-amber-400/10 transition"
                  title="Resetar Zoom (100%)"
                >
                  {Math.round(zoom * 100)}%
                </button>
                <button
                  onClick={() => setZoom((prev) => Math.min(Number((prev * 1.2).toFixed(2)), 5.0))}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-slate-100 hover:bg-white/10 transition"
                  title="Aumentar Zoom (+)"
                >
                  <ZoomIn size={16} />
                </button>
                <button
                  onClick={handleResetView}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-slate-100 hover:bg-white/10 transition"
                  title="Centralizar e Resetar Visão (R / 0)"
                >
                  <RotateCcw size={16} />
                </button>
                
                <div className="w-[1px] h-4 bg-white/10 mx-1" />

                {onInsertIntoNote && (
                  <button
                    onClick={() => onInsertIntoNote(`\`\`\`mermaid\n${cleanChart}\n\`\`\`\n`)}
                    className="p-1.5 rounded-lg text-amber-400 hover:text-amber-300 hover:bg-amber-400/10 transition"
                    title="Inserir diagrama na nota"
                  >
                    <FileDown size={16} />
                  </button>
                )}

                <button
                  onClick={handleCopy}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-slate-100 hover:bg-white/10 transition"
                  title="Copiar código Mermaid"
                >
                  {copied ? <Check size={16} className="text-emerald-400" /> : <Copy size={16} />}
                </button>

                <div className="w-[1px] h-4 bg-white/10 mx-1" />

                <button
                  onClick={handleCloseModal}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 transition"
                  title="Fechar modal (Esc)"
                >
                  <X size={18} />
                </button>
              </div>
            </div>

            {/* Canvas Interativo com suporte a Pan e Zoom */}
            <div 
              ref={modalCanvasRef}
              onMouseDown={handleMouseDown}
              onDoubleClick={handleResetView}
              className={`flex-1 relative overflow-hidden bg-slate-950/60 select-none flex items-center justify-center ${
                isDragging ? 'cursor-grabbing' : 'cursor-grab'
              }`}
              style={{
                backgroundImage: 'radial-gradient(rgba(255, 255, 255, 0.08) 1px, transparent 1px)',
                backgroundSize: '24px 24px',
              }}
            >
              {svgContent ? (
                <div
                  style={{
                    transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
                    transformOrigin: 'center center',
                    transition: isDragging ? 'none' : 'transform 0.08s ease-out',
                  }}
                  className="mermaid-modal-svg flex items-center justify-center p-8 [&>svg]:!max-w-none [&>svg]:w-auto [&>svg]:h-auto [&>svg]:max-h-[72vh] [&>svg]:min-w-[320px] [&>svg]:drop-shadow-2xl [&>svg]:overflow-visible pointer-events-none"
                  dangerouslySetInnerHTML={{ __html: svgContent }}
                />
              ) : (
                <div className="text-slate-400 text-sm">Carregando diagrama...</div>
              )}

              {/* Barra Flutuante de Ajuda / Controles no rodapé do canvas */}
              <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-10 px-4 py-2 rounded-full bg-slate-900/90 border border-white/10 backdrop-blur-md shadow-2xl flex items-center gap-3 text-xs text-slate-400 pointer-events-auto">
                <span className="flex items-center gap-1.5 font-medium text-slate-200">
                  <Move size={13} className="text-amber-400" />
                  Clique e arraste para navegar
                </span>
                <span className="w-1 h-1 rounded-full bg-slate-600" />
                <span>Role o mouse para zoom ({Math.round(zoom * 100)}%)</span>
                <span className="w-1 h-1 rounded-full bg-slate-600" />
                <button
                  onClick={handleResetView}
                  className="text-amber-400 hover:text-amber-300 hover:underline font-semibold"
                >
                  Resetar visão
                </button>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}
    </>
  );
};
