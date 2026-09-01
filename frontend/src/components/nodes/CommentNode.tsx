import { Handle, Position } from '@xyflow/react';

export function CommentNode({ data }: { data: any }) {
  return (
    <div className="bg-slate-900 border border-slate-700 rounded-xl shadow-xl w-80 text-gray-200">
      <Handle type="target" position={Position.Left} className="w-3 h-3 bg-slate-600" />
      
      <div 
        className="px-4 py-2 bg-slate-800 rounded-t-xl border-b border-slate-700 cursor-pointer hover:bg-slate-700 transition"
        onClick={() => data.onTitleClick?.(data.note_id)}
      >
        <h4 className="font-semibold text-sm text-yellow-500 truncate" title={data.note_title}>
          📝 {data.note_title}
        </h4>
      </div>

      <div className="p-4 flex flex-col gap-3">
        {data.selected_text ? (
          <div className="text-xs text-gray-500 italic border-l-2 border-gray-600 pl-2">
            "{data.selected_text}"
          </div>
        ) : data.page_number ? (
          <div className="text-xs text-gray-500 font-medium bg-slate-800 px-2 py-1 rounded inline-block w-fit">
            Página {data.page_number}
          </div>
        ) : null}
        
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
