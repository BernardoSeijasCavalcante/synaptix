import { Node, mergeAttributes, nodeInputRule } from '@tiptap/core';
import { ReactNodeViewRenderer } from '@tiptap/react';
import { NoteImageView } from './NoteImageView';

export type ImageAlign = 'left' | 'center' | 'right';

export interface NoteImageAttributes {
  src: string;
  alt?: string;
  title?: string;
  width?: string;
  align?: ImageAlign;
}

export interface NoteImageOptions {
  inline: boolean;
  HTMLAttributes: Record<string, any>;
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    noteImage: {
      setNoteImage: (options: NoteImageAttributes) => ReturnType;
      updateNoteImage: (options: Partial<NoteImageAttributes>) => ReturnType;
    };
  }
}

const IMAGE_INPUT_REGEX = /(?:^|\s)(!\[(.+|:?)]\((\S+)(?:(?:\s+)["'](\S+)["'])?\))$/;

export const NoteImage = Node.create<NoteImageOptions>({
  name: 'image',

  addOptions() {
    return {
      inline: false,
      HTMLAttributes: {},
    };
  },

  inline() {
    return this.options.inline;
  },

  group() {
    return this.options.inline ? 'inline' : 'block';
  },

  draggable: true,
  selectable: true,

  addAttributes() {
    return {
      src: {
        default: null,
        parseHTML: (element) => element.getAttribute('src'),
        renderHTML: (attributes) => {
          if (!attributes.src) return {};
          return { src: attributes.src };
        },
      },
      alt: {
        default: '',
        parseHTML: (element) => element.getAttribute('alt') || '',
        renderHTML: (attributes) => ({
          alt: attributes.alt || '',
        }),
      },
      title: {
        default: null,
        parseHTML: (element) => element.getAttribute('title'),
        renderHTML: (attributes) => {
          if (!attributes.title) return {};
          return { title: attributes.title };
        },
      },
      width: {
        default: '100%',
        parseHTML: (element) =>
          element.getAttribute('data-width') ||
          element.getAttribute('width') ||
          element.style?.width ||
          '100%',
        renderHTML: (attributes) => {
          const width = attributes.width || '100%';
          return {
            width,
            'data-width': width,
          };
        },
      },
      align: {
        default: 'center',
        parseHTML: (element) =>
          (element.getAttribute('data-align') as ImageAlign) || 'center',
        renderHTML: (attributes) => {
          const align: ImageAlign = attributes.align || 'center';
          return {
            'data-align': align,
          };
        },
      },
    };
  },

  parseHTML() {
    return [
      {
        tag: 'img[src]',
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    const width = HTMLAttributes['data-width'] || HTMLAttributes.width || '100%';
    const align: ImageAlign = HTMLAttributes['data-align'] || 'center';

    let marginStyle = 'margin-left: auto; margin-right: auto;';
    if (align === 'left') {
      marginStyle = 'margin-left: 0; margin-right: auto;';
    } else if (align === 'right') {
      marginStyle = 'margin-left: auto; margin-right: 0;';
    }

    const style = `width: ${width}; max-width: 100%; height: auto; display: block; ${marginStyle}`;

    return [
      'img',
      mergeAttributes(this.options.HTMLAttributes, HTMLAttributes, {
        style,
        class: 'tiptap-note-image rounded-xl my-4 border border-white/10 shadow-lg transition-all',
      }),
    ];
  },

  addNodeView() {
    return ReactNodeViewRenderer(NoteImageView);
  },

  addStorage() {
    return {
      markdown: {
        serialize(state: any, node: any) {
          const escapeAttr = (val: string) =>
            String(val || '')
              .replace(/&/g, '&amp;')
              .replace(/"/g, '&quot;')
              .replace(/</g, '&lt;')
              .replace(/>/g, '&gt;');

          const src = escapeAttr(node.attrs.src || '');
          const alt = escapeAttr(node.attrs.alt || '');
          const title = node.attrs.title ? ` title="${escapeAttr(node.attrs.title)}"` : '';
          const width = escapeAttr(node.attrs.width || '100%');
          const align = escapeAttr(node.attrs.align || 'center');

          let marginStyle = 'margin-left: auto; margin-right: auto;';
          if (align === 'left') {
            marginStyle = 'margin-left: 0; margin-right: auto;';
          } else if (align === 'right') {
            marginStyle = 'margin-left: auto; margin-right: 0;';
          }

          state.write(
            `<img src="${src}" alt="${alt}"${title} width="${width}" data-width="${width}" data-align="${align}" style="width: ${width}; max-width: 100%; height: auto; display: block; ${marginStyle}" />`
          );
          state.closeBlock(node);
        },
        parse: {
          // markdown-it com html: true interpreta tags <img> e ![alt](src) diretamente para o parseHTML
        },
      },
    };
  },

  addCommands() {
    return {
      setNoteImage:
        (options) =>
        ({ commands }) => {
          return commands.insertContent({
            type: this.name,
            attrs: {
              width: '100%',
              align: 'center',
              ...options,
            },
          });
        },
      updateNoteImage:
        (options) =>
        ({ commands }) => {
          return commands.updateAttributes(this.name, options);
        },
    };
  },

  addInputRules() {
    return [
      nodeInputRule({
        find: IMAGE_INPUT_REGEX,
        type: this.type,
        getAttributes: (match) => {
          const [, , alt, src, title] = match;
          return { src, alt, title, width: '100%', align: 'center' };
        },
      }),
    ];
  },
});
