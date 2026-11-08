import React, { useEffect, useCallback } from 'react';
import { 
  ReactFlow, 
  Background, 
  Controls, 
  MiniMap, 
  useNodesState, 
  useEdgesState
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
  const { activeNotebookId, activeNoteId, notes } = useNotesStore();
  const activeNote = notes.find(n => n.id === activeNoteId);
  const currentNotebookId = activeNotebookId || activeNote?.notebook_id || null;

  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);

  useEffect(() => {
    if (currentNotebookId) {
      fetchNotebookComments(currentNotebookId);
      fetchNotebookConnections(currentNotebookId);
    }
  }, [currentNotebookId]);

  const onNodeDragStop = useCallback(
    (_event: any, node: Node) => {
      const commentId = parseInt(node.id.replace('c-', ''));
      if (!isNaN(commentId)) {
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
        
        const apiX = comment.x_position;
        const apiY = comment.y_position;
        const gridX = (index % 3) * 400;
        const gridY = Math.floor(index / 3) * 300;
        
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

    const handleDeleteConnection = (connId: number) => {
      useCommentsStore.getState().deleteConnection(connId);
    };

    // Filtra arestas garantindo que ambos os nós de origem e destino existem na tela
    const commentIdSet = new Set(comments.map(c => c.id));
    const validConnections = connections.filter(
      conn => commentIdSet.has(conn.source_comment_id) && commentIdSet.has(conn.target_comment_id)
    );

    const newEdges = validConnections.map(conn => ({
      id: `e-${conn.id}`,
      source: `c-${conn.source_comment_id}`,
      target: `c-${conn.target_comment_id}`,
      type: 'observationEdge',
      data: {
        connectionId: conn.id,
        observation: conn.observation,
        onSaveObservation: handleSaveObservation,
        onDeleteConnection: handleDeleteConnection,
      }
    }));

    setEdges(newEdges);
  }, [connections, comments, updateConnectionObservation, setEdges]);

  const onConnect = useCallback(async (params: Connection) => {
    if (params.source && params.target) {
      const sourceId = parseInt(params.source.replace('c-', ''));
      const targetId = parseInt(params.target.replace('c-', ''));
      
      if (isNaN(sourceId) || isNaN(targetId) || sourceId === targetId) return;

      await createConnection(sourceId, targetId);
    }
  }, [createConnection]);

  const onEdgesDelete = useCallback(
    (edgesToDelete: Edge[]) => {
      edgesToDelete.forEach((edge) => {
        if (edge.data?.connectionId) {
          useCommentsStore.getState().deleteConnection(edge.data.connectionId as number);
        }
      });
    },
    []
  );

  const onPaneContextMenu = useCallback(
    (event: MouseEvent | React.MouseEvent<Element, MouseEvent>) => {
      event.preventDefault();
      
      if (!currentNotebookId) {
        alert("Selecione um caderno para criar uma pergunta.");
        return;
      }
      const currentTarget = event.currentTarget as Element | null;
      const rect = currentTarget?.getBoundingClientRect?.() ?? { left: 0, top: 0 };
      const x = event.clientX - rect.left;
      const y = event.clientY - rect.top;

      void (async () => {
        const question = await usePromptStore.getState().openPrompt("Digite a pergunta:");
        if (!question) return;
        
        const answer = await usePromptStore.getState().openPrompt("Digite a resposta:");
        if (!answer) return;

        await createQuestion(currentNotebookId, question, answer, x, y);
      })();
    },
    [currentNotebookId, createQuestion]
  );

  return (
    <div className="w-full h-full bg-transparent relative">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onEdgesDelete={onEdgesDelete}
        onNodeDragStop={onNodeDragStop}
        onConnect={onConnect}
        onPaneContextMenu={onPaneContextMenu}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        fitView
        colorMode="dark"
        className="bg-transparent"
      >
        <Background color="rgba(148, 163, 184, 0.2)" gap={20} size={1.5} />
        <Controls className="!bg-slate-900/80 !backdrop-blur-xl !border !border-white/10 !rounded-xl !shadow-2xl" />
        <MiniMap className="!bg-slate-900/80 !backdrop-blur-xl !border !border-white/10 !rounded-xl !shadow-2xl" nodeColor="#eab308" maskColor="rgba(7, 12, 27, 0.7)" />
      </ReactFlow>
    </div>
  );
};
