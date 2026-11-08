import React from 'react';
import { useCommentsStore } from '../store/useCommentsStore';
import { Trash2, Network, ScanText, X, MessageSquare } from 'lucide-react';
import { CommentBox } from './CommentBox';

interface CommentSidebarProps {
  onHoverComment: (id: number | null) => void;
  hoveredCommentId: number | null;
  onToggleMindMap: () => void;
  isMindMapExpanded: boolean;
  onClickComment?: (page: number | null | undefined, commentId: number) => void;
  editingCommentRectId?: number | null;
  setEditingCommentRectId?: (id: number | null) => void;
  onDeleteComment?: (commentId: number) => void;
}

export const CommentSidebar: React.FC<CommentSidebarProps> = ({ 
  onHoverComment, 
  hoveredCommentId,
  onToggleMindMap,
  isMindMapExpanded,
  onClickComment,
  editingCommentRectId,
  setEditingCommentRectId,
  onDeleteComment
}) => {
  const { comments, deleteComment, updateComment } = useCommentsStore();

  if (comments.length === 0) {
    return (
      <div className="w-80 border-l border-white/10 glass-panel-subtle p-4 flex flex-col text-slate-500 overflow-y-auto backdrop-blur-2xl">
        <div className="flex justify-between items-center mb-6">
          <h3 className="text-slate-200 font-bold text-xs uppercase tracking-wider flex items-center gap-2">
            <MessageSquare size={14} className="text-amber-400" />
            <span>Comentários</span>
          </h3>
          <button 
            onClick={onToggleMindMap}
            className={`p-2 rounded-xl transition-all ${
              isMindMapExpanded 
                ? 'glass-btn-purple text-purple-200' 
                : 'glass-btn-ghost text-slate-400 hover:text-purple-300'
            }`}
            title="Expandir Mapa Mental"
          >
            <Network size={16} />
          </button>
        </div>
        <div className="text-center py-16 text-slate-500 text-xs flex flex-col items-center gap-2">
          <MessageSquare size={24} className="opacity-30 text-slate-400" />
          <span>Nenhum comentário nesta nota.</span>
          <span className="text-[11px] text-slate-600">Selecione um texto para adicionar.</span>
        </div>
      </div>
    );
  }

  return (
    <div className="w-80 h-full border-l border-white/10 glass-panel-subtle p-4 flex flex-col gap-3.5 overflow-y-auto backdrop-blur-2xl" id="comment-sidebar">
      <div className="flex justify-between items-center mb-1">
        <h3 className="text-slate-200 font-bold text-xs uppercase tracking-wider flex items-center gap-2">
          <MessageSquare size={14} className="text-amber-400" />
          <span>Comentários ({comments.length})</span>
        </h3>
        <button 
          onClick={onToggleMindMap}
          className={`p-2 rounded-xl transition-all ${
            isMindMapExpanded 
              ? 'glass-btn-purple text-purple-200 shadow-md' 
              : 'glass-btn-ghost text-slate-400 hover:text-purple-300'
          }`}
          title="Expandir Mapa Mental da Nota"
        >
          <Network size={16} />
        </button>
      </div>
      
      {comments.map(comment => {
        const isHovered = hoveredCommentId === comment.id;
        return (
          <div 
            key={comment.id}
            id={`sidebar-comment-${comment.id}`}
            className={`glass-card rounded-xl p-3.5 relative transition-all duration-200 group ${
              isHovered 
                ? 'border-amber-400/60 bg-amber-500/10 shadow-[0_0_20px_rgba(234,179,8,0.2)]' 
                : 'border-white/10 hover:border-white/20'
            } ${onClickComment ? 'cursor-pointer' : ''}`}
            onMouseEnter={() => onHoverComment(comment.id)}
            onMouseLeave={() => onHoverComment(null)}
            onClick={() => onClickComment?.(comment.page_number, comment.id)}
          >
            {comment.rect_x1 != null ? (
              <div className="text-xs text-amber-300 mb-2.5 bg-amber-500/10 p-2 rounded-lg border border-amber-500/20 flex items-center gap-2 backdrop-blur-sm">
                <div className="w-5 h-5 border-2 border-amber-400/60 border-dashed rounded bg-amber-400/10 flex-shrink-0"></div>
                <span className="font-medium text-[11px]">Área destacada na Página {comment.page_number}</span>
              </div>
            ) : (
              <div className="text-xs text-slate-400 mb-2.5 italic border-l-2 border-amber-400/60 pl-2.5 line-clamp-2 leading-relaxed">
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

            <div className="absolute top-2.5 right-2.5 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity" style={{ opacity: isHovered ? 1 : undefined }}>
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
                  className={`p-1.5 rounded-lg transition-colors ${editingCommentRectId === comment.id ? 'bg-amber-500/25 text-amber-300' : 'text-slate-400 hover:text-amber-400 hover:bg-white/10'}`}
                  title={editingCommentRectId === comment.id ? "Cancelar re-seleção" : "Refazer seleção de área"}
                >
                  {editingCommentRectId === comment.id ? <X size={13} /> : <ScanText size={13} />}
                </button>
              )}
              <button 
                onClick={(e) => { 
                  e.stopPropagation(); 
                  if (onDeleteComment) {
                    onDeleteComment(comment.id);
                  } else {
                    deleteComment(comment.id);
                  }
                }}
                className="p-1.5 text-slate-400 hover:text-rose-400 hover:bg-rose-500/15 rounded-lg transition"
                title="Excluir comentário"
              >
                <Trash2 size={13} />
              </button>
            </div>
            
            <div className="text-[10px] text-slate-500 font-mono mt-1 text-right">
              {new Date(comment.created_at).toLocaleDateString()}
            </div>
          </div>
        );
      })}
    </div>
  );
};
