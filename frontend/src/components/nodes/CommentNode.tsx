import { Handle, Position } from '@xyflow/react';

export function CommentNode({ data }: { data: any }) {
  const isQuestion = data.is_question;

  return (
    <div className={`glass-card rounded-2xl shadow-2xl w-80 text-slate-200 overflow-hidden border backdrop-blur-xl transition-all ${
      isQuestion ? 'border-purple-500/40 shadow-purple-950/30' : 'border-white/10 shadow-black/40'
    }`}>
      <Handle type="target" position={Position.Left} className="!w-3 !h-3 !bg-slate-400 !border !border-white/20 !shadow" />
      
      <div 
        className={`px-4 py-2.5 border-b transition-colors ${
          isQuestion 
            ? 'bg-purple-950/50 border-purple-500/30' 
            : 'bg-slate-900/70 border-white/10 cursor-pointer hover:bg-white/[0.08]'
        }`}
        onClick={() => !isQuestion && data.onTitleClick?.(data.note_id)}
      >
        <h4 className={`font-semibold text-xs tracking-wide truncate ${isQuestion ? 'text-purple-300' : 'text-amber-300'}`} title={isQuestion ? 'Pergunta' : data.note_title}>
          {isQuestion ? '❓ Pergunta Reflexiva' : `📝 ${data.note_title}`}
        </h4>
      </div>

      <div className="p-4 flex flex-col gap-3">
        <div className={`${
          isQuestion 
            ? 'text-sm font-medium text-purple-200 mb-1 leading-snug' 
            : 'text-xs text-slate-400 italic border-l-2 border-amber-400/60 pl-2.5 leading-relaxed'
        }`}>
          {isQuestion ? data.selected_text : `"${data.selected_text}"`}
        </div>
        
        {/* Render Tiptap HTML content */}
        <div 
          className="text-xs prose prose-invert max-w-none text-slate-300 leading-relaxed"
          dangerouslySetInnerHTML={{ __html: data.content }}
        />
      </div>

      <Handle type="source" position={Position.Right} className="!w-3 !h-3 !bg-amber-400 !border !border-white/20 !shadow" />
    </div>
  );
}
