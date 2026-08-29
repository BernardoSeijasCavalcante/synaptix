import React, { useEffect, useState } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Mention from '@tiptap/extension-mention';
import suggestion from './extensions/suggestion';

interface CommentBoxProps {
  initialContent: string;
  onBlur: (newContent: string) => void;
}

export const CommentBox: React.FC<CommentBoxProps> = ({ initialContent, onBlur }) => {
  const [isEditing, setIsEditing] = useState(false);

  const editor = useEditor({
    extensions: [
      StarterKit,
      Mention.configure({
        HTMLAttributes: {
          class: 'mention bg-yellow-500/20 text-yellow-500 rounded px-1 font-medium cursor-pointer hover:bg-yellow-500/30 transition-colors',
        },
        suggestion,
      }),
    ],
    content: initialContent,
    editable: isEditing,
    editorProps: {
      attributes: {
        class: 'w-full bg-transparent text-sm text-gray-300 outline-none prose prose-invert max-w-none prose-sm cursor-text min-h-[40px]',
      },
    },
    onBlur: ({ editor }) => {
      setIsEditing(false);
      // Wait a tick to allow the click on mentions to register if they were just blurred
      setTimeout(() => {
        // Tiptap's HTML output or just raw text?
        // Since we want to save and parse mentions, HTML is easiest.
        onBlur(editor.getHTML());
      }, 100);
    },
  });

  useEffect(() => {
    if (editor && editor.isEditable !== isEditing) {
      editor.setEditable(isEditing);
    }
    if (isEditing && editor) {
      editor.commands.focus();
    }
  }, [isEditing, editor]);

  // Click handler for the container to enable editing
  const handleClick = (e: React.MouseEvent) => {
    // If clicking on a mention, let the mention handle it (navigation)
    if ((e.target as HTMLElement).classList.contains('mention') && !isEditing) {
      const id = (e.target as HTMLElement).getAttribute('data-id');
      console.log("Navigating to mention:", id);
      // TODO: navigation logic
      return;
    }
    setIsEditing(true);
  };

  return (
    <div onClick={handleClick} className="w-full relative">
      <EditorContent editor={editor} />
      {!isEditing && (
        <div className="absolute inset-0 z-10 cursor-pointer" style={{ pointerEvents: 'none' }}></div>
      )}
    </div>
  );
};
