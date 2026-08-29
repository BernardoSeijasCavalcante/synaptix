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
      setComment: (commentId: string) => ReturnType;
      /**
       * Unset a comment mark
       */
      unsetComment: (commentId: string) => ReturnType;
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
    return ['mark', mergeAttributes(this.options.HTMLAttributes, HTMLAttributes, { class: 'bg-yellow-500/30 border-b-2 border-yellow-500 rounded px-1 text-inherit' }), 0];
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
        return commands.setMark(this.name, { 'data-comment-id': commentId });
      },
      unsetComment: (commentId) => ({ tr, dispatch }) => {
        if (!dispatch) return false;
        
        const { doc } = tr;
        
        // If there's a selection, we could theoretically unset it in the selection.
        // But usually we want to find the mark by ID and remove it.
        let markRange: {from: number, to: number} | null = null;
        
        doc.descendants((node, pos) => {
          const hasMark = node.marks.find(
            mark => mark.type.name === this.name && mark.attrs['data-comment-id'] === commentId
          );
          if (hasMark) {
            markRange = { from: pos, to: pos + node.nodeSize };
          }
        });

        if (markRange) {
          const range = markRange as {from: number, to: number};
          tr.removeMark(range.from, range.to, this.type);
          return true;
        }

        return false;
      },
    };
  },
});
