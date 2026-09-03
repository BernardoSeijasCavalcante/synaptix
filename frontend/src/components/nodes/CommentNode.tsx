import { Handle, Position } from '@xyflow/react';

export function CommentNode({ data }: { data: any }) {
  const isQuestion = data.is_question;

  return (
    <div className={`bg-slate-900 border rounded-xl shadow-xl w-80 text-gray-200 ${isQuestion ? 'border-indigo-600' : 'border-slate-700'}`}>
      <Handle type="target" position={Position.Left} className="w-3 h-3 bg-slate-600" />
      
      <div 
        className={`px-4 py-2 rounded-t-xl border-b transition ${isQuestion ? 'bg-indigo-900/50 border-indigo-700' : 'bg-slate-800 border-slate-700 cursor-pointer hover:bg-slate-700'}`}
        onClick={() => !isQuestion && data.onTitleClick?.(data.note_id)}
      >
        <h4 className={`font-semibold text-sm truncate ${isQuestion ? 'text-indigo-400' : 'text-yellow-500'}`} title={isQuestion ? 'Pergunta' : data.note_title}>
          {isQuestion ? '❓ Pergunta' : `📝 ${data.note_title}`}
        </h4>
      </div>

      <div className="p-4 flex flex-col gap-3">
        <div className={`${isQuestion ? 'text-base font-medium text-indigo-200 mb-2' : 'text-xs text-gray-500 italic border-l-2 border-gray-600 pl-2'}`}>
          {isQuestion ? data.selected_text : `"${data.selected_text}"`}
        </div>
        
        {/* Usando dangerouslySetInnerHTML pois o conteúdo vem do Tiptap e contém as menções formatadas em HTML */}
        <div 
          className="text-sm prose prose-invert prose-sm"
          dangerouslySetInnerHTML={{ __html: data.content }}
        />
      </div>

      <Handle type="source" position={Position.Right} className="w-3 h-3 bg-purple-500" />
    </div>
  );
}
