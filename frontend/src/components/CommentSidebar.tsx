import React from 'react';
import { useCommentsStore } from '../store/useCommentsStore';
import { Trash2, Network } from 'lucide-react';
import { CommentBox } from './CommentBox';

interface CommentSidebarProps {
  onHoverComment: (id: number | null) => void;
  hoveredCommentId: number | null;
  onToggleMindMap: () => void;
  isMindMapExpanded: boolean;
}

export const CommentSidebar: React.FC<CommentSidebarProps> = ({ 
  onHoverComment, 
  hoveredCommentId,
  onToggleMindMap,
  isMindMapExpanded
}) => {
  const { comments, deleteComment, updateComment } = useCommentsStore();

  if (comments.length === 0) {
    return (
      <div className="w-80 border-l border-slate-800 bg-[#0a1128] p-4 flex flex-col text-gray-500 overflow-y-auto">
        <div className="flex justify-between items-center mb-6">
          <h3 className="text-gray-300 font-medium">Comentários</h3>
          <button 
            onClick={onToggleMindMap}
            className={`p-1.5 rounded transition-colors ${isMindMapExpanded ? 'bg-purple-600/30 text-purple-400' : 'hover:bg-slate-800 text-gray-400'}`}
            title="Expandir Mapa Mental"
          >
            <Network size={18} />
          </button>
        </div>
        <p className="text-sm text-center mt-10">Nenhum comentário nesta nota.</p>
      </div>
    );
  }

  return (
    <div className="w-80 h-full border-l border-slate-800 bg-[#0a1128] p-4 flex flex-col gap-4 overflow-y-auto" id="comment-sidebar">
      <div className="flex justify-between items-center mb-2">
        <h3 className="text-gray-300 font-medium">Comentários</h3>
        <button 
          onClick={onToggleMindMap}
          className={`p-1.5 rounded transition-colors ${isMindMapExpanded ? 'bg-purple-600/30 text-purple-400' : 'hover:bg-slate-800 text-gray-400 hover:text-purple-400'}`}
          title="Expandir Mapa Mental"
        >
          <Network size={18} />
        </button>
      </div>
      
      {comments.map(comment => (
        <div 
          key={comment.id}
          id={`sidebar-comment-${comment.id}`}
          className={`bg-slate-900 border rounded-lg p-3 relative transition-colors ${hoveredCommentId === comment.id ? 'border-yellow-500' : 'border-slate-700'}`}
          onMouseEnter={() => onHoverComment(comment.id)}
          onMouseLeave={() => onHoverComment(null)}
        >
          {comment.selected_text ? (
            <div className="text-xs text-gray-500 mb-2 italic border-l-2 border-gray-600 pl-2 line-clamp-2">
              "{comment.selected_text}"
            </div>
          ) : comment.page_number ? (
            <div className="text-xs text-gray-500 mb-2 font-medium bg-slate-800 px-2 py-1 rounded inline-block">
              Página {comment.page_number}
            </div>
          ) : null}
          <CommentBox 
            initialContent={comment.content} 
            onBlur={(newContent) => {
              if (newContent !== comment.content) {
                updateComment(comment.id, newContent);
              }
            }} 
          />
          <button 
            onClick={() => deleteComment(comment.id)}
            className="absolute top-2 right-2 text-gray-500 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity"
            style={{ opacity: hoveredCommentId === comment.id ? 1 : undefined }}
          >
            <Trash2 size={14} />
          </button>
          <div className="text-[10px] text-gray-600 mt-1 text-right">
            {new Date(comment.created_at).toLocaleDateString()}
          </div>
        </div>
      ))}
    </div>
  );
};

