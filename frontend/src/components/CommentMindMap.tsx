import React, { useEffect, useCallback } from 'react';
import { 
  ReactFlow, 
  Background, 
  Controls, 
  MiniMap, 
  useNodesState, 
  useEdgesState,
  addEdge
} from '@xyflow/react';
import type { Connection, Edge, Node } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { useCommentsStore } from '../store/useCommentsStore';
import { useNotesStore } from '../store/useNotesStore';
import { usePromptStore } from '../store/usePromptStore';
import { CommentNode } from './nodes/CommentNode';
import { ObservationEdge } from './edges/ObservationEdge';

const nodeTypes = { commentNode: CommentNode };
const edgeTypes = { observationEdge: ObservationEdge };

interface CommentMindMapProps {
  onNavigateToNote: (noteId: number) => void;
}

export const CommentMindMap: React.FC<CommentMindMapProps> = ({ onNavigateToNote }) => {
  const { comments, connections, fetchNotebookComments, fetchNotebookConnections, createConnection, updateConnectionObservation, createQuestion } = useCommentsStore();
  const { activeNotebookId, notes } = useNotesStore();

  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);

  useEffect(() => {
    if (activeNotebookId) {
      fetchNotebookComments(activeNotebookId);
      fetchNotebookConnections(activeNotebookId);
    }
  }, [activeNotebookId]);

  const onNodeDragStop = useCallback(
    (_event: any, node: Node) => {
      const commentId = parseInt(node.id.replace('c-', ''));
      if (!isNaN(commentId)) {
        // O xyflow não atualiza nosso backend automaticamente, disparamos a action
        useCommentsStore.getState().updateCommentPosition(commentId, Math.round(node.position.x), Math.round(node.position.y));
      }
    },
    []
  );

  useEffect(() => {
    // Generate nodes from comments
    setNodes((currentNodes) => {
      return comments.map((comment, index) => {
        const note = notes.find(n => n.id === comment.note_id);
        const existingNode = currentNodes.find(n => n.id === `c-${comment.id}`);
        
        // Se a API trouxe posição nula, calcula o grid, se não, usa a da API. 
        // Se o currentNode já existe, prefere a posição do React Flow (pois pode estar arrastando agora e não queremos sobrescrever) 
        // a menos que estejamos reconstruindo a tela inteira. Na verdade, para evitar piscos, `existingNode?.position` é sempre seguro
        // já que o onNodeDragStop envia para o backend.
        
        const apiX = comment.x_position;
        const apiY = comment.y_position;
        const gridX = (index % 3) * 400;
        const gridY = Math.floor(index / 3) * 300;
        
        // Estratégia de reconciliação de posição
        const x = existingNode?.position.x ?? (apiX !== null && apiX !== undefined ? apiX : gridX);
        const y = existingNode?.position.y ?? (apiY !== null && apiY !== undefined ? apiY : gridY);

        return {
          ...existingNode,
          id: `c-${comment.id}`,
          type: 'commentNode',
          position: { x, y },
          data: {
            ...existingNode?.data,
            note_id: comment.note_id,
            note_title: note?.title || 'Nota Desconhecida',
            content: comment.content,
            selected_text: comment.selected_text,
            is_question: comment.is_question,
            onTitleClick: onNavigateToNote,
          },
        };
      });
    });
  }, [comments, notes, onNavigateToNote, setNodes]);

  useEffect(() => {
    const handleSaveObservation = (connId: number, obs: string) => {
      updateConnectionObservation(connId, obs);
    };

    // Generate edges from connections
    const newEdges = connections.map(conn => ({
      id: `e-${conn.id}`,
      source: `c-${conn.source_comment_id}`,
      target: `c-${conn.target_comment_id}`,
      type: 'observationEdge',
      data: {
        connectionId: conn.id,
        observation: conn.observation,
        onSaveObservation: handleSaveObservation,
      }
    }));

    setEdges(newEdges);
  }, [connections, updateConnectionObservation]);

  const onConnect = useCallback(async (params: Connection) => {
    if (params.source && params.target) {
      const sourceId = parseInt(params.source.replace('c-', ''));
      const targetId = parseInt(params.target.replace('c-', ''));
      
      const newConn = await createConnection(sourceId, targetId);
      if (newConn) {
        setEdges((eds) => addEdge({
          ...params,
          id: `e-${newConn.id}`,
          type: 'observationEdge',
          data: {
            connectionId: newConn.id,
            observation: null,
            onSaveObservation: (connId: number, obs: string) => {
              updateConnectionObservation(connId, obs);
            }
          }
        }, eds));
      }
    }
  }, [createConnection, updateConnectionObservation]);


  const onPaneContextMenu = useCallback(
    async (event: React.MouseEvent) => {
      event.preventDefault();
      
      if (!activeNotebookId) {
        alert("Selecione um notebook para criar uma pergunta.");
        return;
      }

      const question = await usePromptStore.getState().openPrompt("Digite a pergunta:");
      if (!question) return;
      
      const answer = await usePromptStore.getState().openPrompt("Digite a resposta:");
      if (!answer) return;

      const rect = event.currentTarget.getBoundingClientRect();
      const x = event.clientX - rect.left;
      const y = event.clientY - rect.top;

      await createQuestion(activeNotebookId, question, answer, x, y);
    },
    [activeNotebookId, createQuestion]
  );

  return (
    <div className="w-full h-full bg-slate-950 relative">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeDragStop={onNodeDragStop}
        onConnect={onConnect}
        onPaneContextMenu={onPaneContextMenu}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        fitView
        className="bg-slate-950"
      >
        <Background color="#334155" gap={16} />
        <Controls className="bg-slate-800 border-slate-700 fill-gray-300" />
        <MiniMap nodeColor="#1e293b" maskColor="rgba(0,0,0,0.5)" />
      </ReactFlow>
    </div>
  );
};
