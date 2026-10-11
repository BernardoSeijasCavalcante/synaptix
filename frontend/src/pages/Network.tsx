
import { ReactFlow, Background, Controls, MiniMap, useNodesState, useEdgesState } from '@xyflow/react';
import '@xyflow/react/dist/style.css';

const initialNodes = [
  { id: '1', position: { x: 250, y: 100 }, data: { label: 'Conceito Chave A' } },
  { id: '2', position: { x: 100, y: 250 }, data: { label: 'Conceito Relacionado B' } },
  { id: '3', position: { x: 400, y: 250 }, data: { label: 'Aplicação C' } },
];
const initialEdges = [
  { id: 'e1-2', source: '1', target: '2', label: 'depende de' },
  { id: 'e1-3', source: '1', target: '3', label: 'gera' },
];

export default function Network() {
  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);

  const carregarGrafoBackend = async () => {
    try {
      // Mock de chamada ao backend MVP
      const res = await fetch('http://localhost:8000/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: "test" })
      });
      const data = await res.json();
      setNodes(data.nodes);
      setEdges(data.edges);
    } catch (error) {
      console.error("Erro ao carregar do backend, certifique-se que está rodando na porta 8000", error);
      alert('Erro ao buscar do backend. Iniciando mock IA localmente...');
    }
  };

  return (
    <div className="flex flex-col h-[calc(100vh-64px)] bg-[#0a1128]">
      <div className="p-4 border-b border-slate-800 bg-slate-950 flex justify-between items-center shadow-sm z-10">
        <h2 className="text-xl font-bold text-gray-200">Rede Sináptica</h2>
        <button 
          onClick={carregarGrafoBackend}
          className="bg-purple-600/20 text-purple-400 border border-purple-600/30 px-4 py-2 rounded hover:bg-purple-600/30 transition"
        >
          Analisar com IA
        </button>
      </div>
      <div className="flex-1 w-full relative">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          fitView
          colorMode="dark"
        >
          <Background color="#334155" />
          <Controls className="bg-slate-900 border-slate-800" />
          <MiniMap className="bg-slate-900" nodeColor="#eab308" maskColor="rgba(0,0,0,0.5)" />
        </ReactFlow>
      </div>
    </div>
  );
}
