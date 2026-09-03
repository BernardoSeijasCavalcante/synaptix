import { useEffect, useState } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Mention from '@tiptap/extension-mention';
import { Markdown } from 'tiptap-markdown';
import suggestion from './extensions/suggestion';
import { usePromptStore } from '../store/usePromptStore';

export const PromptModal = () => {
  const { isOpen, title, closePrompt } = usePromptStore();
  const [isConfirmingDiscard, setIsConfirmingDiscard] = useState(false);

  const editor = useEditor({
    extensions: [
      StarterKit,
      Markdown,
      Mention.configure({
        HTMLAttributes: {
          class: 'mention bg-yellow-500/20 text-yellow-500 rounded px-1 font-medium cursor-pointer hover:bg-yellow-500/30 transition-colors',
        },
        suggestion,
      }),
    ],
    content: '',
    editorProps: {
      attributes: {
        class: 'focus:outline-none min-h-[100px] max-h-[400px] overflow-y-auto prose prose-invert max-w-none bg-slate-900 border border-slate-700 rounded p-3 text-gray-200 focus:border-yellow-500 transition-colors',
      },
    },
  });

  useEffect(() => {
    if (isOpen && editor) {
      editor.commands.setContent('');
      setIsConfirmingDiscard(false);
      setTimeout(() => editor.commands.focus(), 100);
    }
  }, [isOpen, editor]);

  if (!isOpen) return null;

  const handleCancel = () => {
    if (!editor) {
      closePrompt(null);
      return;
    }
    
    const currentContent = editor.getText().trim();
    if (currentContent.length > 0) {
      setIsConfirmingDiscard(true);
    } else {
      closePrompt(null);
    }
  };

  const handleConfirm = () => {
    if (!editor) return;
    const value = editor.storage.markdown.getMarkdown();
    closePrompt(value);
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="bg-slate-950 border border-slate-800 rounded-lg shadow-xl w-full max-w-lg overflow-hidden flex flex-col">
        <div className="p-4 border-b border-slate-800">
          <h2 className="text-lg font-semibold text-gray-100">{title}</h2>
        </div>
        
        <div className="p-4 flex-1">
          <EditorContent editor={editor} />
        </div>
        
        <div className="p-4 border-t border-slate-800 flex justify-end gap-3 bg-slate-900/50">
          {isConfirmingDiscard ? (
            <div className="flex items-center gap-3 w-full justify-between">
              <span className="text-red-400 text-sm font-medium">Descartar o conteúdo?</span>
              <div className="flex gap-2">
                <button
                  onClick={() => setIsConfirmingDiscard(false)}
                  className="px-3 py-1.5 rounded text-sm font-medium text-gray-300 hover:text-white hover:bg-slate-800 transition-colors"
                >
                  Não, manter
                </button>
                <button
                  onClick={() => {
                    setIsConfirmingDiscard(false);
                    closePrompt(null);
                  }}
                  className="px-3 py-1.5 bg-red-500/10 hover:bg-red-500 text-red-500 hover:text-white font-bold rounded text-sm transition-colors"
                >
                  Sim, descartar
                </button>
              </div>
            </div>
          ) : (
            <>
              <button
                onClick={handleCancel}
                className="px-4 py-2 rounded text-sm font-medium text-gray-400 hover:text-white hover:bg-slate-800 transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={handleConfirm}
                className="px-4 py-2 bg-yellow-500 hover:bg-yellow-600 text-slate-950 font-bold rounded text-sm transition-colors"
              >
                Confirmar
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
