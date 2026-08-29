import { ReactRenderer } from '@tiptap/react';
import tippy from 'tippy.js';
import type { Instance, GetReferenceClientRect } from 'tippy.js';
import { MentionList } from './MentionList';
import { useNotesStore } from '../../store/useNotesStore';
import { useCommentsStore } from '../../store/useCommentsStore';

export default {
  items: ({ query }: { query: string }) => {
    const notesStore = useNotesStore.getState();
    const commentsStore = useCommentsStore.getState();
    
    const notes = notesStore.notes;
    const comments = commentsStore.comments;
    
    const lowerQuery = query.toLowerCase();
    
    const matchedNotes = notes
      .filter(note => note.title.toLowerCase().includes(lowerQuery))
      .map(note => ({
        id: `note:${note.id}`,
        label: note.title,
        type: 'note'
      }));
      
    const matchedComments = comments
      .filter(comment => comment.content.toLowerCase().includes(lowerQuery))
      .map(comment => {
        const words = comment.content.replace(/<[^>]+>/g, '').split(/\s+/);
        const excerpt = words.slice(0, 3).join(' ') + (words.length > 3 ? '...' : '');
        return {
          id: `comment:${comment.id}`,
          label: excerpt || "Comentário",
          type: 'comment',
          originalContent: comment.content
        };
      });
      
    return [...matchedNotes, ...matchedComments].slice(0, 10);
  },

  render: () => {
    let component: ReactRenderer;
    let popup: Instance[];

    return {
      onStart: (props: any) => {
        component = new ReactRenderer(MentionList, {
          props,
          editor: props.editor,
        });

        if (!props.clientRect) {
          return;
        }

        popup = tippy('body', {
          getReferenceClientRect: props.clientRect as GetReferenceClientRect,
          appendTo: () => document.body,
          content: component.element,
          showOnCreate: true,
          interactive: true,
          trigger: 'manual',
          placement: 'bottom-start',
        });
      },

      onUpdate(props: any) {
        component.updateProps(props);

        if (!props.clientRect) {
          return;
        }

        popup[0].setProps({
          getReferenceClientRect: props.clientRect as GetReferenceClientRect,
        });
      },

      onKeyDown(props: any) {
        if (props.event.key === 'Escape') {
          popup[0].hide();
          return true;
        }

        return (component.ref as any)?.onKeyDown(props);
      },

      onExit() {
        if (popup && popup[0]) {
            popup[0].destroy();
        }
        if (component) {
            component.destroy();
        }
      },
    };
  },
};

