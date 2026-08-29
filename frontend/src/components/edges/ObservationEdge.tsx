import { BaseEdge, getBezierPath } from '@xyflow/react';
import type { EdgeProps } from '@xyflow/react';
import { useState } from 'react';

export function ObservationEdge({
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

  const handleSave = () => {
    if (data?.onSaveObservation && typeof data.onSaveObservation === 'function') {
      data.onSaveObservation(data.connectionId, obsText);
    }
    setIsExpanded(false);
  };

  return (
    <>
      <BaseEdge path={edgePath} markerEnd={markerEnd} style={{ ...style, strokeWidth: 2, stroke: '#9333ea' }} />
      <foreignObject
        width={isExpanded ? 240 : 20}
        height={isExpanded ? 140 : 20}
        x={labelX - (isExpanded ? 120 : 10)}
        y={labelY - (isExpanded ? 70 : 10)}
        className="overflow-visible"
      >
        <div className="flex items-center justify-center w-full h-full pointer-events-auto">
          {!isExpanded ? (
            <button
              className="w-5 h-5 bg-purple-600 rounded-full border-2 border-white hover:scale-125 transition-transform flex items-center justify-center text-white text-[10px] shadow-md"
              onClick={() => setIsExpanded(true)}
              title={obsText ? "Ver observação" : "Adicionar observação"}
            >
              {obsText ? '👁️' : '+'}
            </button>
          ) : (
            <div className="bg-slate-800 border border-purple-500 rounded-lg p-2 shadow-2xl flex flex-col gap-2 w-full h-full relative" onMouseLeave={() => setIsExpanded(false)}>
              <textarea
                className="w-full h-full bg-slate-900 text-sm text-gray-200 resize-none outline-none p-2 rounded"
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
            </div>
          )}
        </div>
      </foreignObject>
    </>
  );
}
