import { useEffect, useState } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Mention from '@tiptap/extension-mention';
import { Markdown } from 'tiptap-markdown';
import suggestion from './extensions/suggestion';
import { usePromptStore } from '../store/usePromptStore';
import { Sparkles, AlertTriangle } from 'lucide-react';

export const PromptModal = () => {
  const { isOpen, title, closePrompt } = usePromptStore();
  const [isConfirmingDiscard, setIsConfirmingDiscard] = useState(false);

  const editor = useEditor({
    extensions: [
      StarterKit,
      Markdown,
      Mention.configure({
        HTMLAttributes: {
          class: 'mention bg-amber-500/20 text-amber-300 border border-amber-500/30 rounded px-1.5 py-0.5 font-medium cursor-pointer hover:bg-amber-500/30 transition-colors shadow-sm',
        },
        suggestion,
      }),
    ],
    content: '',
    editorProps: {
      attributes: {
        class: 'focus:outline-none min-h-[100px] max-h-[350px] overflow-y-auto prose prose-invert max-w-none glass-input rounded-xl p-3.5 text-slate-100 focus:border-amber-400/50 transition-colors text-sm',
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
    const value = (editor.storage as any).markdown.getMarkdown();
    closePrompt(value);
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-md animate-in fade-in duration-200 p-4">
      <div className="glass-panel bg-[#091129]/90 backdrop-blur-2xl border border-white/15 rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden flex flex-col animate-in zoom-in-95 duration-200">
        <div className="p-5 border-b border-white/10 flex items-center justify-between">
          <h2 className="text-base font-bold text-slate-100 flex items-center gap-2">
            <Sparkles size={16} className="text-amber-400" />
            <span>{title}</span>
          </h2>
        </div>
        
        <div className="p-5 flex-1">
          <EditorContent editor={editor} />
        </div>
        
        <div className="p-4 border-t border-white/10 flex justify-end gap-3 bg-white/[0.02]">
          {isConfirmingDiscard ? (
            <div className="flex items-center gap-3 w-full justify-between">
              <span className="text-rose-400 text-xs font-semibold flex items-center gap-1.5">
                <AlertTriangle size={14} /> Descartar o conteúdo digitado?
              </span>
              <div className="flex gap-2">
                <button
                  onClick={() => setIsConfirmingDiscard(false)}
                  className="px-3 py-1.5 rounded-lg text-xs font-medium text-slate-300 hover:text-white hover:bg-white/10 transition-colors"
                >
                  Continuar
                </button>
                <button
                  onClick={() => {
                    setIsConfirmingDiscard(false);
                    closePrompt(null);
                  }}
                  className="px-3.5 py-1.5 bg-rose-500/15 hover:bg-rose-500 border border-rose-500/30 text-rose-300 hover:text-white font-bold rounded-lg text-xs transition-colors"
                >
                  Sim, descartar
                </button>
              </div>
            </div>
          ) : (
            <>
              <button
                onClick={handleCancel}
                className="glass-btn-ghost px-4 py-2 rounded-xl text-xs font-semibold hover:text-white transition-all"
              >
                Cancelar
              </button>
              <button
                onClick={handleConfirm}
                className="glass-btn-gold px-4 py-2 font-bold text-xs uppercase tracking-wider rounded-xl shadow-lg hover:scale-105 active:scale-95 transition-all"
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
