import { useState } from 'react';
import { ReactFlow, Background, Controls, MiniMap, useNodesState, useEdgesState, BackgroundVariant } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { Network as NetworkIcon, Sparkles, Loader2 } from 'lucide-react';

const initialNodes = [
  { 
    id: '1', 
    position: { x: 250, y: 100 }, 
    data: { label: 'Conceito Chave A' },
    style: { 
      background: 'rgba(168, 85, 247, 0.15)', 
      color: '#f3e8ff', 
      border: '1px solid rgba(168, 85, 247, 0.4)', 
      borderRadius: '12px',
      padding: '12px 18px',
      fontWeight: '600',
      boxShadow: '0 8px 24px rgba(168, 85, 247, 0.2)',
      backdropFilter: 'blur(12px)'
    } 
  },
  { 
    id: '2', 
    position: { x: 100, y: 260 }, 
    data: { label: 'Conceito Relacionado B' },
    style: { 
      background: 'rgba(13, 22, 50, 0.7)', 
      color: '#e2e8f0', 
      border: '1px solid rgba(255, 255, 255, 0.12)', 
      borderRadius: '12px',
      padding: '12px 18px',
      fontWeight: '500',
      boxShadow: '0 8px 24px rgba(0, 0, 0, 0.4)',
      backdropFilter: 'blur(12px)'
    } 
  },
  { 
    id: '3', 
    position: { x: 420, y: 260 }, 
    data: { label: 'Aplicação C' },
    style: { 
      background: 'rgba(234, 179, 8, 0.15)', 
      color: '#fef08a', 
      border: '1px solid rgba(234, 179, 8, 0.4)', 
      borderRadius: '12px',
      padding: '12px 18px',
      fontWeight: '600',
      boxShadow: '0 8px 24px rgba(234, 179, 8, 0.2)',
      backdropFilter: 'blur(12px)'
    } 
  },
];

const initialEdges = [
  { 
    id: 'e1-2', 
    source: '1', 
    target: '2', 
    label: 'depende de',
    style: { stroke: '#a855f7', strokeWidth: 2 },
    labelStyle: { fill: '#cbd5e1', fontWeight: 500, fontSize: 11 },
    labelBgStyle: { fill: 'rgba(15, 23, 42, 0.85)', rx: 6, ry: 6 }
  },
  { 
    id: 'e1-3', 
    source: '1', 
    target: '3', 
    label: 'gera',
    style: { stroke: '#eab308', strokeWidth: 2 },
    labelStyle: { fill: '#cbd5e1', fontWeight: 500, fontSize: 11 },
    labelBgStyle: { fill: 'rgba(15, 23, 42, 0.85)', rx: 6, ry: 6 }
  },
];

export default function Network() {
  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);
  const [analyzing, setAnalyzing] = useState(false);

  const carregarGrafoBackend = async () => {
    setAnalyzing(true);
    try {
      const res = await fetch('/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: "test" })
      });
      const data = await res.json();
      setNodes(data.nodes);
      setEdges(data.edges);
    } catch (error) {
      console.error("Erro ao carregar do backend", error);
      alert('Iniciando análise local de conexões sinápticas...');
    } finally {
      setAnalyzing(false);
    }
  };

  return (
    <div className="flex flex-col h-[calc(100vh-64px)] bg-transparent overflow-hidden">
      {/* Frosted Top Bar */}
      <div className="glass-panel-subtle px-6 py-4 border-b border-white/10 flex justify-between items-center z-10 shrink-0">
        <div>
          <h2 className="text-xl sm:text-2xl font-bold tracking-tight bg-gradient-to-r from-purple-200 via-pink-200 to-amber-200 bg-clip-text text-transparent flex items-center gap-2.5">
            <NetworkIcon size={22} className="text-purple-400" /> Rede Sináptica
          </h2>
          <p className="text-slate-400 text-xs sm:text-sm mt-0.5">Mapeamento de relações cognitivas e conceitos interligados.</p>
        </div>

        <button 
          onClick={carregarGrafoBackend}
          disabled={analyzing}
          className="glass-btn-purple px-4 py-2 rounded-xl text-xs font-semibold shadow-lg shadow-purple-900/20 hover:scale-105 active:scale-95 transition-all flex items-center gap-2"
        >
          {analyzing ? (
            <>
              <Loader2 size={15} className="animate-spin text-purple-300" />
              <span>Analisando...</span>
            </>
          ) : (
            <>
              <Sparkles size={15} className="text-purple-300" />
              <span>Analisar com IA</span>
            </>
          )}
        </button>
      </div>

      {/* ReactFlow Interactive Graph Canvas */}
      <div className="flex-1 w-full relative">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          fitView
          colorMode="dark"
        >
          <Background 
            variant={BackgroundVariant.Dots} 
            gap={24} 
            size={1.5} 
            color="rgba(148, 163, 184, 0.2)" 
          />
          <Controls className="!bg-slate-900/80 !backdrop-blur-xl !border !border-white/10 !rounded-xl !shadow-2xl" />
          <MiniMap 
            className="!bg-slate-900/80 !backdrop-blur-xl !border !border-white/10 !rounded-xl !shadow-2xl" 
            nodeColor="#eab308" 
            maskColor="rgba(7, 12, 27, 0.7)" 
          />
        </ReactFlow>
      </div>
    </div>
  );
}
