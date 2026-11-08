import { BaseEdge, EdgeLabelRenderer, getBezierPath } from '@xyflow/react';
import type { EdgeProps } from '@xyflow/react';
import { useState, useEffect } from 'react';

export function ObservationEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  style = {},
  markerEnd,
  data,
}: EdgeProps) {
  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  });

  const [isExpanded, setIsExpanded] = useState(false);
  const [obsText, setObsText] = useState<string>((data?.observation as string) || '');

  useEffect(() => {
    setObsText((data?.observation as string) || '');
  }, [data?.observation]);

  const handleSave = () => {
    if (data?.onSaveObservation && typeof data.onSaveObservation === 'function') {
      data.onSaveObservation(data.connectionId, obsText);
    }
    setIsExpanded(false);
  };

  return (
    <>
      <BaseEdge id={id} path={edgePath} markerEnd={markerEnd} style={{ ...style, strokeWidth: 2, stroke: '#a855f7' }} />
      <EdgeLabelRenderer>
        <div
          style={{
            position: 'absolute',
            transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
            pointerEvents: 'all',
          }}
          className="nodrag nopan flex items-center justify-center"
        >
          {!isExpanded ? (
            <button
              className="w-6 h-6 bg-purple-600/90 backdrop-blur-md rounded-full border border-purple-300/60 hover:scale-125 transition-transform flex items-center justify-center text-white text-[11px] shadow-[0_0_12px_rgba(168,85,247,0.5)] cursor-pointer"
              onClick={() => setIsExpanded(true)}
              title={obsText ? "Ver observação" : "Adicionar observação"}
            >
              {obsText ? '👁️' : '+'}
            </button>
          ) : (
            <div className="glass-panel bg-slate-900/95 backdrop-blur-2xl border border-purple-500/50 rounded-xl p-2.5 shadow-2xl flex flex-col gap-2 w-64 h-36 relative" onMouseLeave={() => setIsExpanded(false)}>
              <textarea
                className="w-full h-full glass-input text-xs text-slate-100 placeholder-slate-400 resize-none outline-none p-2 rounded-lg leading-relaxed focus:border-purple-400/50"
                placeholder="Qual a relação entre esses comentários?"
                value={obsText}
                onChange={(e) => setObsText(e.target.value)}
                autoFocus
                onBlur={handleSave}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleSave();
                  }
                }}
              />
              <button 
                onMouseDown={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  if (data?.onDeleteConnection && typeof data.onDeleteConnection === 'function') {
                    data.onDeleteConnection(data.connectionId);
                  }
                }}
                className="absolute -top-2.5 -right-2.5 w-5 h-5 bg-rose-600/90 backdrop-blur-md rounded-full text-white text-xs flex items-center justify-center hover:bg-rose-500 shadow-md border border-white/20 transition-all hover:scale-110 cursor-pointer"
                title="Excluir Conexão"
              >
                &times;
              </button>
            </div>
          )}
        </div>
      </EdgeLabelRenderer>
    </>
  );
}
