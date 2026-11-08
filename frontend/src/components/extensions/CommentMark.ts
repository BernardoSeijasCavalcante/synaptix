import { Mark, mergeAttributes } from '@tiptap/core';

export interface CommentOptions {
  HTMLAttributes: Record<string, any>;
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    comment: {
      /**
       * Set a comment mark
       */
      setComment: (commentId: string | number) => ReturnType;
      /**
       * Unset a comment mark
       */
      unsetComment: (commentId: string | number) => ReturnType;
      /**
       * Remove comment marks whose IDs are not in the validCommentIds list
       */
      cleanOrphanComments: (validCommentIds: (string | number)[]) => ReturnType;
    };
  }
}

export const CommentMark = Mark.create<CommentOptions>({
  name: 'comment',
  inclusive: false,

  addOptions() {
    return {
      HTMLAttributes: {},
    };
  },

  addAttributes() {
    return {
      'data-comment-id': {
        default: null,
        parseHTML: element => element.getAttribute('data-comment-id'),
        renderHTML: attributes => {
          if (!attributes['data-comment-id']) {
            return {};
          }
          return {
            'data-comment-id': attributes['data-comment-id'],
          };
        },
      },
    };
  },

  parseHTML() {
    return [
      {
        tag: 'mark[data-comment-id]',
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    return ['mark', mergeAttributes(this.options.HTMLAttributes, HTMLAttributes, { class: 'bg-amber-400/20 border-b-2 border-amber-400 rounded px-1.5 py-0.5 text-inherit shadow-[0_0_10px_rgba(234,179,8,0.15)] transition-colors hover:bg-amber-400/30 cursor-pointer' }), 0];
  },

  addStorage() {
    return {
      markdown: {
        serialize: {
          open: (_state: any, mark: any) => {
            return `<mark data-comment-id="${mark.attrs['data-comment-id']}">`;
          },
          close: '</mark>',
        },
        parse: {
          setup(_markdownit: any) {
            // we rely on markdown-it parsing raw HTML, 
            // the parseHTML of the mark handles the DOM part.
          },
        },
      }
    };
  },

  addCommands() {
    return {
      setComment: (commentId) => ({ commands }) => {
        return commands.setMark(this.name, { 'data-comment-id': String(commentId) });
      },
      unsetComment: (commentId) => ({ tr, dispatch }) => {
        if (!dispatch) return false;
        
        const { doc } = tr;
        const targetId = String(commentId);
        const rangesToRemove: { from: number; to: number }[] = [];
        
        doc.descendants((node, pos) => {
          if (!node.isInline && !node.isText) return;
          const hasMark = node.marks.find(
            mark => mark.type.name === this.name && String(mark.attrs['data-comment-id']) === targetId
          );
          if (hasMark) {
            rangesToRemove.push({ from: pos, to: pos + node.nodeSize });
          }
        });

        if (rangesToRemove.length > 0) {
          rangesToRemove.forEach(range => {
            tr.removeMark(range.from, range.to, this.type);
          });
          return true;
        }

        return false;
      },
      cleanOrphanComments: (validCommentIds) => ({ tr, dispatch }) => {
        if (!dispatch) return false;
        
        const validSet = new Set(validCommentIds.map(id => String(id)));
        const { doc } = tr;
        const rangesToRemove: { from: number; to: number }[] = [];

        doc.descendants((node, pos) => {
          if (!node.isInline && !node.isText) return;
          const commentMark = node.marks.find(
            mark => mark.type.name === this.name
          );
          if (commentMark) {
            const markId = commentMark.attrs['data-comment-id'];
            if (!markId || !validSet.has(String(markId))) {
              rangesToRemove.push({ from: pos, to: pos + node.nodeSize });
            }
          }
        });

        if (rangesToRemove.length > 0) {
          rangesToRemove.forEach(range => {
            tr.removeMark(range.from, range.to, this.type);
          });
          return true;
        }

        return false;
      },
    };
  },
});
