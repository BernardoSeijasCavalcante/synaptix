import React from 'react';
import { useCommentsStore } from '../store/useCommentsStore';
import { Trash2, Network, ScanText, X } from 'lucide-react';
import { CommentBox } from './CommentBox';

interface CommentSidebarProps {
  onHoverComment: (id: number | null) => void;
  hoveredCommentId: number | null;
  onToggleMindMap: () => void;
  isMindMapExpanded: boolean;
  onClickComment?: (page: number | null | undefined) => void;
  editingCommentRectId?: number | null;
  setEditingCommentRectId?: (id: number | null) => void;
}

export const CommentSidebar: React.FC<CommentSidebarProps> = ({ 
  onHoverComment, 
  hoveredCommentId,
  onToggleMindMap,
  isMindMapExpanded,
  onClickComment,
  editingCommentRectId,
  setEditingCommentRectId
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
          className={`bg-slate-900 border rounded-lg p-3 relative transition-colors ${hoveredCommentId === comment.id ? 'border-yellow-500' : 'border-slate-700'} ${onClickComment ? 'cursor-pointer' : ''}`}
          onMouseEnter={() => onHoverComment(comment.id)}
          onMouseLeave={() => onHoverComment(null)}
          onClick={() => onClickComment?.(comment.page_number)}
        >
          {comment.rect_x1 != null ? (
            <div className="text-xs text-gray-400 mb-2 bg-slate-800/50 p-2 rounded border border-slate-700 flex items-center gap-2">
              <div className="w-6 h-6 border-2 border-yellow-500/50 border-dashed rounded bg-slate-900 flex-shrink-0"></div>
              <span>Área destacada na Página {comment.page_number}</span>
            </div>
          ) : (
            <div className="text-xs text-gray-500 mb-2 italic border-l-2 border-gray-600 pl-2 line-clamp-2">
              "{comment.selected_text}"
            </div>
          )}
          <CommentBox 
            initialContent={comment.content} 
            onBlur={(newContent) => {
              if (newContent !== comment.content) {
                updateComment(comment.id, newContent);
              }
            }} 
          />
          <div className="absolute top-2 right-2 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity" style={{ opacity: hoveredCommentId === comment.id ? 1 : undefined }}>
            {comment.rect_x1 != null && setEditingCommentRectId && (
              <button 
                onClick={(e) => {
                  e.stopPropagation();
                  if (editingCommentRectId === comment.id) {
                    setEditingCommentRectId(null);
                  } else {
                    setEditingCommentRectId(comment.id);
                  }
                }}
                className={`p-1 rounded transition-colors ${editingCommentRectId === comment.id ? 'bg-yellow-500/20 text-yellow-400' : 'text-gray-500 hover:text-yellow-400'}`}
                title={editingCommentRectId === comment.id ? "Cancelar re-seleção" : "Refazer seleção de área"}
              >
                {editingCommentRectId === comment.id ? <X size={14} /> : <ScanText size={14} />}
              </button>
            )}
            <button 
              onClick={(e) => { e.stopPropagation(); deleteComment(comment.id); }}
              className="p-1 text-gray-500 hover:text-red-400"
              title="Excluir"
            >
              <Trash2 size={14} />
            </button>
          </div>
          <div className="text-[10px] text-gray-600 mt-1 text-right">
            {new Date(comment.created_at).toLocaleDateString()}
          </div>
        </div>
      ))}
    </div>
  );
};

