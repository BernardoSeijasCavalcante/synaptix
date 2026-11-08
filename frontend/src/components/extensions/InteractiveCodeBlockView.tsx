import React, { useState, useMemo } from 'react';
import { NodeViewWrapper, NodeViewContent, type NodeViewProps } from '@tiptap/react';
import { 
  Eye, 
  Code2, 
  Columns, 
  Copy, 
  Check, 
  Sparkles, 
  Terminal,
  RefreshCw
} from 'lucide-react';
import { MermaidDiagram } from '../MermaidDiagram';

/**
 * Detecta se o bloco de código é uma especificação Mermaid válida
 */
export function isMermaidCode(text: string, language?: string): boolean {
  if (language && language.toLowerCase() === 'mermaid') return true;
  if (!text) return false;
  
  const firstLine = text.trim().split('\n')[0].trim().toLowerCase();
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

export const InteractiveCodeBlockView: React.FC<NodeViewProps> = ({
  node,
  updateAttributes,
  selected,
}) => {
  const language = node.attrs.language || '';
  const codeText = node.textContent || '';
  
  const isMermaid = useMemo(() => {
    return isMermaidCode(codeText, language);
  }, [codeText, language]);

  // Se for Mermaid, o padrão é exibir visualmente o resultado ('preview'), mas permitindo alternar para código ou split
  const [mode, setMode] = useState<'preview' | 'code' | 'split'>('preview');
  const [copied, setCopied] = useState(false);

  // Auto-ajusta o atributo language caso detectado como Mermaid
  React.useEffect(() => {
    if (isMermaid && language !== 'mermaid') {
      updateAttributes({ language: 'mermaid' });
    }
  }, [isMermaid, language, updateAttributes]);

  const handleCopy = () => {
    navigator.clipboard.writeText(codeText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <NodeViewWrapper 
      className={`my-4 rounded-2xl overflow-hidden border transition-all duration-200 ${
        selected ? 'border-amber-400 ring-2 ring-amber-400/20' : 'border-white/10 hover:border-white/20'
      } bg-slate-950/80 shadow-xl`}
    >
      {/* Header Toolbar */}
      <div className="px-3.5 py-2 bg-slate-900/90 border-b border-white/10 flex items-center justify-between text-xs text-slate-400 select-none">
        {/* Identificador de Linguagem / Tipo */}
        <div className="flex items-center gap-2">
          {isMermaid ? (
            <span className="flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-purple-500/20 text-purple-300 border border-purple-500/30 font-mono text-[11px] font-semibold">
              <Sparkles size={11} className="text-amber-400" />
              Mermaid Diagram
            </span>
          ) : (
            <span className="flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-slate-800 text-slate-300 border border-white/10 font-mono text-[11px]">
              <Terminal size={11} className="text-slate-400" />
              {language || 'code'}
            </span>
          )}
        </div>

        {/* Controles para Mermaid: Visual | Código | Dividido */}
        {isMermaid ? (
          <div className="flex items-center gap-1">
            <div className="flex items-center bg-slate-950/80 p-0.5 rounded-lg border border-white/10 text-[11px]">
              <button
                type="button"
                onClick={() => setMode('preview')}
                className={`flex items-center gap-1 px-2 py-1 rounded-md transition font-medium ${
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
                className={`flex items-center gap-1 px-2 py-1 rounded-md transition font-medium ${
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
                className={`flex items-center gap-1 px-2 py-1 rounded-md transition font-medium ${
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

            <button
              type="button"
              onClick={handleCopy}
              className="p-1.5 rounded-lg hover:text-slate-200 hover:bg-white/10 transition text-slate-400"
              title="Copiar código Mermaid"
            >
              {copied ? <Check size={13} className="text-emerald-400" /> : <Copy size={13} />}
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={handleCopy}
            className="flex items-center gap-1 px-2 py-1 rounded-md hover:text-slate-200 hover:bg-white/10 transition text-slate-400 text-[11px]"
            title="Copiar código"
          >
            {copied ? <Check size={12} className="text-emerald-400" /> : <Copy size={12} />}
            <span>{copied ? 'Copiado' : 'Copiar'}</span>
          </button>
        )}
      </div>

      {/* Conteúdo Principal do Bloco */}
      <div className="relative">
        {/* MODO MERMAID: DIVIDIDO (SPLIT) */}
        {isMermaid && mode === 'split' && (
          <div className="grid grid-cols-1 lg:grid-cols-2 divide-y lg:divide-y-0 lg:divide-x divide-white/10">
            {/* Coluna 1: Editor de Código TipTap */}
            <div className="p-3 bg-slate-950/40">
              <div className="text-[10px] uppercase tracking-wider text-slate-500 font-bold mb-1.5 flex items-center gap-1">
                <Code2 size={11} /> Editor de Código
              </div>
              <pre className="p-3 bg-slate-900/90 rounded-xl border border-white/5 font-mono text-xs overflow-x-auto min-h-[140px] text-amber-200">
                <NodeViewContent as={'code' as any} className="focus:outline-none" />
              </pre>
            </div>

            {/* Coluna 2: Resultado Visual Mermaid */}
            <div className="p-3 bg-slate-950/20 flex flex-col justify-center">
              <div className="text-[10px] uppercase tracking-wider text-slate-500 font-bold mb-1.5 flex items-center gap-1">
                <RefreshCw size={11} className="text-amber-400 animate-spin-slow" /> Resultado em Tempo Real
              </div>
              <MermaidDiagram chart={codeText} title="Resultado do Diagrama" />
            </div>
          </div>
        )}

        {/* MODO MERMAID: APENAS VISUAL (PREVIEW) */}
        {isMermaid && mode === 'preview' && (
          <div className="p-3">
            <MermaidDiagram chart={codeText} title="Diagrama Mermaid" />
            <div className="mt-2 text-center">
              <button
                type="button"
                onClick={() => setMode('code')}
                className="text-[11px] text-slate-500 hover:text-amber-300 transition-colors inline-flex items-center gap-1"
              >
                <Code2 size={11} /> Clique aqui ou na aba "Código" para editar este diagrama
              </button>
            </div>

            {/* IMPORTANTE: Mantém o NodeViewContent no DOM para que o TipTap/ProseMirror preserve o estado sem quebrar */}
            <div className="hidden">
              <pre>
                <NodeViewContent as={'code' as any} />
              </pre>
            </div>
          </div>
        )}

        {/* MODO MERMAID: APENAS CÓDIGO (CODE) */}
        {isMermaid && mode === 'code' && (
          <div className="p-4 bg-slate-950/70">
            <div className="flex items-center justify-between pb-2 mb-2 border-b border-white/5 text-[11px] text-slate-400">
              <span className="font-mono text-amber-400/90">Edite as instruções do diagrama abaixo:</span>
              <button
                type="button"
                onClick={() => setMode('preview')}
                className="px-2.5 py-1 rounded-lg bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 font-medium text-xs transition flex items-center gap-1.5 border border-amber-500/30"
              >
                <Eye size={12} /> Ver Resultado
              </button>
            </div>
            <pre className="p-3 bg-slate-900/90 rounded-xl border border-white/5 font-mono text-xs overflow-x-auto min-h-[120px] text-amber-200">
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
