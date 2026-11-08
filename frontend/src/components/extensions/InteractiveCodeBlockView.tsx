import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { NodeViewWrapper, NodeViewContent, type NodeViewProps } from '@tiptap/react';
import { 
  Eye, 
  Code2, 
  Columns, 
  Copy, 
  Check, 
  Sparkles, 
  Terminal,
  RefreshCw,
  Maximize2,
  ZoomIn,
  ZoomOut,
  GripHorizontal
} from 'lucide-react';
import { MermaidDiagram, type MermaidDiagramHandle } from '../MermaidDiagram';

/**
 * Detecta se o bloco de código é uma especificação Mermaid válida
 */
export function isMermaidCode(text: string, language?: string): boolean {
  if (language && language.toLowerCase() === 'mermaid') return true;
  if (!text) return false;
  
  // Limpa diretivas iniciais do Synaptix para verificar o primeiro comando Mermaid
  const lines = text.trim().split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('%%'));
  if (lines.length === 0) return false;
  
  const firstLine = lines[0].toLowerCase();
  return (
    firstLine.startsWith('flowchart') ||
    firstLine.startsWith('graph') ||
    firstLine.startsWith('statediagram') ||
    firstLine.startsWith('sequencediagram') ||
    firstLine.startsWith('classdiagram') ||
    firstLine.startsWith('erdiagram') ||
    firstLine.startsWith('gantt') ||
    firstLine.startsWith('pie') ||
    firstLine.startsWith('gitgraph') ||
    firstLine.startsWith('journey') ||
    firstLine.startsWith('mindmap') ||
    firstLine.startsWith('timeline') ||
    firstLine.startsWith('quadrantchart') ||
    firstLine.startsWith('sankey') ||
    firstLine.startsWith('xychart') ||
    firstLine.startsWith('block-beta')
  );
}

export interface DiagramConfig {
  height?: number;
  zoom?: number;
}

/**
 * Extrai as configurações persistidas no comentário/diretiva do diagrama
 */
export function parseDiagramConfig(text: string): DiagramConfig {
  const config: DiagramConfig = {};
  if (!text) return config;

  // Auto height
  if (/%%\s*(?:synaptix-)?height:\s*auto/i.test(text)) {
    config.height = 0;
  } else {
    // Formato: %% synaptix-height: 480px (ou %% height: 480px)
    const heightMatch = text.match(/%%\s*(?:synaptix-)?height:\s*(\d+)px?/i);
    if (heightMatch && heightMatch[1]) {
      config.height = parseInt(heightMatch[1], 10);
    }
  }

  // Formato: %% synaptix-zoom: 120% (ou %% zoom: 120%)
  const zoomMatch = text.match(/%%\s*(?:synaptix-)?zoom:\s*(\d+)%?/i);
  if (zoomMatch && zoomMatch[1]) {
    config.zoom = parseInt(zoomMatch[1], 10) / 100;
  }

  // Formato combinado: %% synaptix: height=480 zoom=120
  const genericMatch = text.match(/%%\s*synaptix:\s*([^\n]+)/i);
  if (genericMatch && genericMatch[1]) {
    const rawParams = genericMatch[1];
    if (/height=auto/i.test(rawParams)) {
      config.height = 0;
    } else {
      const hMatch = rawParams.match(/height=(\d+)/i);
      if (hMatch) config.height = parseInt(hMatch[1], 10);
    }
    const zMatch = rawParams.match(/zoom=(\d+)/i);
    if (zMatch) config.zoom = parseInt(zMatch[1], 10) / 100;
  }

  return config;
}

const PRESET_HEIGHTS = [
  { label: 'P', value: 280, title: 'Compacto (280px)' },
  { label: 'M', value: 440, title: 'Médio / Confortável (440px)' },
  { label: 'G', value: 620, title: 'Grande (620px)' },
  { label: 'GG', value: 840, title: 'Extra Grande (840px)' },
  { label: 'Auto', value: 0, title: 'Automático (Ajustar ao Conteúdo)' },
];

export const InteractiveCodeBlockView: React.FC<NodeViewProps> = ({
  editor,
  node,
  getPos,
  updateAttributes,
  selected,
}) => {
  const language = node.attrs.language || '';
  const codeText = node.textContent || '';
  
  const mermaidRef = useRef<MermaidDiagramHandle>(null);

  const isMermaid = useMemo(() => {
    return isMermaidCode(codeText, language);
  }, [codeText, language]);

  // Se for Mermaid, o padrão é exibir visualmente o resultado ('preview'), mas permitindo alternar para código ou split
  const [mode, setMode] = useState<'preview' | 'code' | 'split'>('preview');
  const [copied, setCopied] = useState(false);

  // Extração da configuração persistida no corpo do diagrama
  const config = useMemo(() => {
    return parseDiagramConfig(codeText);
  }, [codeText]);

  // Estado de altura: prioriza a diretiva persistida no texto da nota, ou o cache local, ou 460px (visível e generoso)
  const [height, setHeight] = useState<number>(() => {
    if (config.height !== undefined) return config.height;
    try {
      const cached = localStorage.getItem('synaptix_diagram_default_height');
      if (cached) return parseInt(cached, 10);
    } catch (_) {}
    return 460;
  });

  // Estado de Zoom/Escala
  const [zoom, setZoom] = useState<number>(() => {
    return config.zoom || 1;
  });

  // Sincroniza estado caso o texto da nota mude externamente (ex: troca de nota ou undo/redo)
  useEffect(() => {
    if (config.height !== undefined && config.height !== height) {
      setHeight(config.height);
    }
  }, [config.height]);

  useEffect(() => {
    if (config.zoom !== undefined && config.zoom !== zoom) {
      setZoom(config.zoom);
    }
  }, [config.zoom]);

  // Auto-ajusta o atributo language caso detectado como Mermaid
  useEffect(() => {
    if (isMermaid && language !== 'mermaid') {
      updateAttributes({ language: 'mermaid' });
    }
  }, [isMermaid, language, updateAttributes]);

  /**
   * Persiste a altura e zoom escolhidos diretamente no corpo do bloco de notas como comentário Mermaid oficial.
   * Desta forma, a dimensão é salva no banco de dados da nota, resiste a qualquer recarregamento
   * e é 100% retrocompatível com qualquer exportador Markdown / Mermaid.
   */
  const persistConfig = useCallback((newHeight: number, newZoom: number = zoom) => {
    if (!isMermaid) return;
    const currentText = node.textContent || '';

    // Remove diretivas anteriores
    const rawLines = currentText.split('\n');
    const filteredLines = rawLines.filter((l) => !/^%%\s*(?:synaptix|height|zoom)/i.test(l.trim()));

    // Cria a diretiva elegante e padronizada
    const heightStr = newHeight === 0 ? 'auto' : `${newHeight}px`;
    const zoomStr = newZoom && newZoom !== 1 ? ` zoom: ${Math.round(newZoom * 100)}%` : '';
    const directive = `%% synaptix-height: ${heightStr}${zoomStr}`;

    const newCode = `${directive}\n${filteredLines.join('\n')}`;

    if (typeof getPos === 'function') {
      const pos = getPos();
      if (typeof pos === 'number') {
        const from = pos + 1;
        const to = pos + node.nodeSize - 1;
        const tr = editor.state.tr.replaceWith(
          from,
          to,
          editor.state.schema.text(newCode)
        );
        editor.view.dispatch(tr);
      }
    }

    try {
      if (newHeight > 0) {
        localStorage.setItem('synaptix_diagram_default_height', String(newHeight));
      }
    } catch (_) {}
  }, [editor, getPos, isMermaid, node.nodeSize, node.textContent, zoom]);

  // Redimensionamento interativo por arrasto (Drag-to-resize)
  const [isResizing, setIsResizing] = useState(false);
  const dragStartYRef = useRef(0);
  const dragStartHeightRef = useRef(0);
  const currentHeightRef = useRef(height);
  currentHeightRef.current = height;

  const handleResizeMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsResizing(true);
    dragStartYRef.current = e.clientY;
    dragStartHeightRef.current = height === 0 ? 460 : height;

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const deltaY = moveEvent.clientY - dragStartYRef.current;
      const nextHeight = Math.max(200, Math.min(1400, Math.round(dragStartHeightRef.current + deltaY)));
      setHeight(nextHeight);
      currentHeightRef.current = nextHeight;
    };

    const handleMouseUp = () => {
      setIsResizing(false);
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      persistConfig(currentHeightRef.current, zoom);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  };

  const handleSelectPreset = (val: number) => {
    setHeight(val);
    persistConfig(val, zoom);
  };

  const handleZoomIn = () => {
    const nextZoom = Math.min(Number((zoom + 0.15).toFixed(2)), 2.5);
    setZoom(nextZoom);
    persistConfig(height, nextZoom);
  };

  const handleZoomOut = () => {
    const nextZoom = Math.max(Number((zoom - 0.15).toFixed(2)), 0.5);
    setZoom(nextZoom);
    persistConfig(height, nextZoom);
  };

  const handleResetZoom = () => {
    setZoom(1);
    persistConfig(height, 1);
  };

  const handleOpenModal = () => {
    mermaidRef.current?.openModal();
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(codeText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <NodeViewWrapper 
      className={`my-4 rounded-2xl overflow-hidden border transition-all duration-200 ${
        selected ? 'border-amber-400 ring-2 ring-amber-400/20' : 'border-white/10 hover:border-white/20'
      } bg-slate-950/90 shadow-2xl`}
    >
      {/* Header Toolbar Único e Integrado (Elimina Cabeçalhos Duplos Redundantes) */}
      <div className="px-3.5 py-2 bg-slate-900/95 border-b border-white/10 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-400 select-none">
        
        {/* Lado Esquerdo: Identificador + Presets de Altura e Zoom */}
        <div className="flex items-center gap-2 flex-wrap">
          {isMermaid ? (
            <>
              <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-purple-500/20 text-purple-200 border border-purple-500/30 font-mono text-[11px] font-semibold shadow-sm">
                <Sparkles size={12} className="text-amber-400" />
                Diagrama Mermaid
              </span>

              {/* Presets Rápidos de Altura: P | M | G | GG | Auto */}
              {mode !== 'code' && (
                <div className="flex items-center bg-slate-950/80 p-0.5 rounded-lg border border-white/10 text-[11px] font-mono">
                  <span className="px-1.5 text-[10px] text-slate-500 font-sans uppercase font-bold">Tam:</span>
                  {PRESET_HEIGHTS.map((preset) => {
                    const isActive = preset.value === 0 
                      ? height === 0 
                      : height !== 0 && Math.abs(height - preset.value) < 30;
                    return (
                      <button
                        key={preset.label}
                        type="button"
                        onClick={() => handleSelectPreset(preset.value)}
                        className={`px-2 py-0.5 rounded-md transition font-semibold cursor-pointer ${
                          isActive
                            ? 'bg-amber-500/25 text-amber-300 border border-amber-500/40 shadow-sm'
                            : 'text-slate-400 hover:text-slate-200 hover:bg-white/5'
                        }`}
                        title={preset.title}
                      >
                        {preset.label}
                      </button>
                    );
                  })}
                </div>
              )}

              {/* Controles de Zoom/Escala */}
              {mode !== 'code' && (
                <div className="flex items-center bg-slate-950/80 p-0.5 rounded-lg border border-white/10 text-[11px] font-mono">
                  <button
                    type="button"
                    onClick={handleZoomOut}
                    disabled={zoom <= 0.5}
                    className="p-1 rounded text-slate-400 hover:text-slate-100 hover:bg-white/10 disabled:opacity-30 disabled:hover:bg-transparent transition cursor-pointer"
                    title="Diminuir Zoom"
                  >
                    <ZoomOut size={12} />
                  </button>
                  <button
                    type="button"
                    onClick={handleResetZoom}
                    className="px-1.5 text-[10px] font-bold text-amber-300 hover:underline cursor-pointer"
                    title="Resetar Zoom para 100%"
                  >
                    {Math.round(zoom * 100)}%
                  </button>
                  <button
                    type="button"
                    onClick={handleZoomIn}
                    disabled={zoom >= 2.5}
                    className="p-1 rounded text-slate-400 hover:text-slate-100 hover:bg-white/10 disabled:opacity-30 disabled:hover:bg-transparent transition cursor-pointer"
                    title="Aumentar Zoom"
                  >
                    <ZoomIn size={12} />
                  </button>
                </div>
              )}
            </>
          ) : (
            <span className="flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-slate-800 text-slate-300 border border-white/10 font-mono text-[11px]">
              <Terminal size={11} className="text-slate-400" />
              {language || 'code'}
            </span>
          )}
        </div>

        {/* Lado Direito: Modos de Visualização + Tela Cheia + Copiar */}
        <div className="flex items-center gap-1.5">
          {isMermaid ? (
            <>
              <div className="flex items-center bg-slate-950/80 p-0.5 rounded-lg border border-white/10 text-[11px]">
                <button
                  type="button"
                  onClick={() => setMode('preview')}
                  className={`flex items-center gap-1 px-2.5 py-1 rounded-md transition font-medium cursor-pointer ${
                    mode === 'preview' 
                      ? 'bg-amber-500/20 text-amber-300 font-semibold shadow-sm' 
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                  title="Visualizar apenas o resultado do diagrama"
                >
                  <Eye size={12} />
                  <span>Visual</span>
                </button>

                <button
                  type="button"
                  onClick={() => setMode('code')}
                  className={`flex items-center gap-1 px-2.5 py-1 rounded-md transition font-medium cursor-pointer ${
                    mode === 'code' 
                      ? 'bg-amber-500/20 text-amber-300 font-semibold shadow-sm' 
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                  title="Editar o código do diagrama"
                >
                  <Code2 size={12} />
                  <span>Código</span>
                </button>

                <button
                  type="button"
                  onClick={() => setMode('split')}
                  className={`flex items-center gap-1 px-2.5 py-1 rounded-md transition font-medium cursor-pointer ${
                    mode === 'split' 
                      ? 'bg-amber-500/20 text-amber-300 font-semibold shadow-sm' 
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                  title="Visualização dividida: edite o código e veja o resultado em tempo real"
                >
                  <Columns size={12} />
                  <span>Dividido</span>
                </button>
              </div>

              {/* Botão de Tela Cheia Interativo com Pan & Zoom */}
              <button
                type="button"
                onClick={handleOpenModal}
                className="p-1.5 rounded-lg hover:text-slate-200 hover:bg-white/10 transition text-slate-400 cursor-pointer"
                title="Expandir diagrama em tela cheia interativa (Pan & Zoom)"
              >
                <Maximize2 size={13} />
              </button>

              <button
                type="button"
                onClick={handleCopy}
                className="p-1.5 rounded-lg hover:text-slate-200 hover:bg-white/10 transition text-slate-400 cursor-pointer"
                title="Copiar código Mermaid"
              >
                {copied ? <Check size={13} className="text-emerald-400" /> : <Copy size={13} />}
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={handleCopy}
              className="flex items-center gap-1 px-2 py-1 rounded-md hover:text-slate-200 hover:bg-white/10 transition text-slate-400 text-[11px] cursor-pointer"
              title="Copiar código"
            >
              {copied ? <Check size={12} className="text-emerald-400" /> : <Copy size={12} />}
              <span>{copied ? 'Copiado' : 'Copiar'}</span>
            </button>
          )}
        </div>
      </div>

      {/* Conteúdo Principal do Bloco */}
      <div className="relative">
        {/* MODO MERMAID: APENAS VISUAL (PREVIEW) */}
        {isMermaid && mode === 'preview' && (
          <div className="flex flex-col bg-slate-950/40">
            {/* Visualizador Mermaid Integrado (Sem cabeçalho redundante interno) */}
            <MermaidDiagram 
              ref={mermaidRef}
              chart={codeText} 
              variant="embedded"
              height={height === 0 ? undefined : height}
              zoom={zoom}
            />

            {/* Barra Inferior de Redimensionamento Interativo (Resize Handle) */}
            <div 
              onMouseDown={handleResizeMouseDown}
              className={`group/resize relative flex items-center justify-between px-3.5 py-1.5 bg-slate-900/90 hover:bg-slate-900 border-t border-white/10 cursor-row-resize select-none transition-colors ${
                isResizing ? 'bg-amber-500/10 border-amber-500/40 text-amber-300' : 'text-slate-400'
              }`}
              title="Clique e arraste para redimensionar a altura do diagrama (será salva na nota)"
            >
              <button
                type="button"
                onClick={() => setMode('code')}
                className="text-[11px] text-slate-500 hover:text-amber-300 transition-colors inline-flex items-center gap-1 font-mono cursor-pointer"
                title="Editar código deste diagrama"
              >
                <Code2 size={12} /> Editar código
              </button>

              <div className="flex items-center gap-1.5 text-slate-500 group-hover/resize:text-amber-400 transition-colors">
                <GripHorizontal size={14} className="shrink-0" />
                <span className="text-[10px] font-medium tracking-wide">
                  {isResizing ? `Altura: ${height}px` : 'Arraste para redimensionar altura'}
                </span>
              </div>

              <span className="text-[10px] font-mono font-medium text-slate-400 bg-slate-950/80 px-2 py-0.5 rounded border border-white/10">
                {height === 0 ? 'Auto' : `${height}px`}
              </span>
            </div>

            {/* IMPORTANTE: Mantém o NodeViewContent no DOM para que o TipTap/ProseMirror preserve o estado do documento */}
            <div className="hidden">
              <pre>
                <NodeViewContent as={'code' as any} />
              </pre>
            </div>
          </div>
        )}

        {/* MODO MERMAID: DIVIDIDO (SPLIT) */}
        {isMermaid && mode === 'split' && (
          <div className="flex flex-col bg-slate-950/40">
            <div className="grid grid-cols-1 lg:grid-cols-2 divide-y lg:divide-y-0 lg:divide-x divide-white/10">
              {/* Coluna 1: Editor de Código TipTap */}
              <div className="p-3 bg-slate-950/40 flex flex-col">
                <div className="text-[10px] uppercase tracking-wider text-slate-500 font-bold mb-1.5 flex items-center gap-1 shrink-0">
                  <Code2 size={11} /> Editor de Código
                </div>
                <pre 
                  style={{ minHeight: `${(height === 0 ? 400 : height) - 40}px` }}
                  className="p-3 bg-slate-900/90 rounded-xl border border-white/5 font-mono text-xs overflow-x-auto text-amber-200 flex-1 leading-relaxed"
                >
                  <NodeViewContent as={'code' as any} className="focus:outline-none" />
                </pre>
              </div>

              {/* Coluna 2: Resultado Visual Mermaid Integrado */}
              <div className="p-3 bg-slate-950/20 flex flex-col justify-center">
                <div className="text-[10px] uppercase tracking-wider text-slate-500 font-bold mb-1.5 flex items-center gap-1 shrink-0">
                  <RefreshCw size={11} className="text-amber-400 animate-spin-slow" /> Resultado em Tempo Real
                </div>
                <MermaidDiagram 
                  ref={mermaidRef}
                  chart={codeText} 
                  variant="embedded"
                  height={height === 0 ? undefined : Math.max(height - 40, 260)}
                  zoom={zoom}
                />
              </div>
            </div>

            {/* Barra de Redimensionamento no Split View */}
            <div 
              onMouseDown={handleResizeMouseDown}
              className={`group/resize relative flex items-center justify-between px-3.5 py-1.5 bg-slate-900/90 hover:bg-slate-900 border-t border-white/10 cursor-row-resize select-none transition-colors ${
                isResizing ? 'bg-amber-500/10 border-amber-500/40 text-amber-300' : 'text-slate-400'
              }`}
              title="Clique e arraste para redimensionar a altura (será salva na nota)"
            >
              <span className="text-[10px] text-slate-500 font-mono">Modo Dividido</span>
              <div className="flex items-center gap-1.5 text-slate-500 group-hover/resize:text-amber-400 transition-colors">
                <GripHorizontal size={14} className="shrink-0" />
                <span className="text-[10px] font-medium tracking-wide">
                  {isResizing ? `Altura: ${height}px` : 'Arraste para redimensionar altura'}
                </span>
              </div>
              <span className="text-[10px] font-mono font-medium text-slate-400 bg-slate-950/80 px-2 py-0.5 rounded border border-white/10">
                {height === 0 ? 'Auto' : `${height}px`}
              </span>
            </div>
          </div>
        )}

        {/* MODO MERMAID: APENAS CÓDIGO (CODE) */}
        {isMermaid && mode === 'code' && (
          <div className="p-4 bg-slate-950/70">
            <div className="flex items-center justify-between pb-2 mb-2 border-b border-white/5 text-[11px] text-slate-400">
              <span className="font-mono text-amber-400/90">Edite as instruções do diagrama Mermaid abaixo:</span>
              <button
                type="button"
                onClick={() => setMode('preview')}
                className="px-2.5 py-1 rounded-lg bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 font-medium text-xs transition flex items-center gap-1.5 border border-amber-500/30 cursor-pointer"
              >
                <Eye size={12} /> Ver Resultado
              </button>
            </div>
            <pre className="p-3 bg-slate-900/90 rounded-xl border border-white/5 font-mono text-xs overflow-x-auto min-h-[160px] text-amber-200 leading-relaxed">
              <NodeViewContent as={'code' as any} className="focus:outline-none" />
            </pre>
          </div>
        )}

        {/* BLOCO DE CÓDIGO CONVENCIONAL (NÃO-MERMAID) */}
        {!isMermaid && (
          <pre className="p-4 bg-slate-950/70 font-mono text-xs overflow-x-auto leading-relaxed">
            <NodeViewContent as={'code' as any} className="focus:outline-none" />
          </pre>
        )}
      </div>
    </NodeViewWrapper>
  );
};
