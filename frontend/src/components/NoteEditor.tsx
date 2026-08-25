import { useEffect, useState } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import { BubbleMenu, FloatingMenu } from '@tiptap/react/menus';
import StarterKit from '@tiptap/starter-kit';
import { Markdown } from 'tiptap-markdown';
import { TaskList } from '@tiptap/extension-task-list';
import { TaskItem } from '@tiptap/extension-task-item';
import { Table } from '@tiptap/extension-table';
import { TableRow } from '@tiptap/extension-table-row';
import { TableCell } from '@tiptap/extension-table-cell';
import { TableHeader } from '@tiptap/extension-table-header';
import { Link } from '@tiptap/extension-link';
import { CodeBlockLowlight } from '@tiptap/extension-code-block-lowlight';
import { all, createLowlight } from 'lowlight';
import 'highlight.js/styles/github-dark.css';
import { useNotesStore } from '../store/useNotesStore';
import { Save, Trash, Bold, Italic, Strikethrough, Code, Table as TableIcon, Plus, Trash2, ArrowUp, ArrowDown, ArrowLeft, ArrowRight } from 'lucide-react';
import { InputRule, Extension } from '@tiptap/core';

const lowlight = createLowlight(all);

const TableShortcut = Extension.create({
  name: 'tableShortcut',
  addInputRules() {
    return [
      new InputRule({
        find: /^\/tabela $/,
        handler: ({ range }) => {
          this.editor.chain().focus().deleteRange(range).insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run();
        },
      }),
    ];
  },
});

export const NoteEditor = () => {
  const { notes, activeNoteId, updateNote, deleteNote, setActiveNote } = useNotesStore();
  const activeNote = notes.find(n => n.id === activeNoteId);
  const [title, setTitle] = useState('');

  const editor = useEditor({
    extensions: [
      StarterKit,
      Markdown,
      TaskList,
      TaskItem.configure({ nested: true }),
      Table.configure({ resizable: true }),
      TableRow,
      TableHeader,
      TableCell,
      Link.configure({ openOnClick: false }),
      CodeBlockLowlight.configure({ lowlight }),
      TableShortcut,
    ],
    content: '',
    editorProps: {
      attributes: {
        class: 'focus:outline-none min-h-[500px] prose prose-invert max-w-none',
      },
    },
  });

  useEffect(() => {
    if (activeNote && editor) {
      setTitle(activeNote.title);
      const currentMarkdown = (editor as any).storage.markdown.getMarkdown();
      if (currentMarkdown !== activeNote.content) {
        editor.commands.setContent(activeNote.content);
      }
    }
  }, [activeNoteId, editor]);

  const handleSave = () => {
    if (!activeNote || !editor) return;
    updateNote(activeNote.id, {
      title,
      content: (editor as any).storage.markdown.getMarkdown(),
    });
  };

  const handleDelete = () => {
    if (!activeNote) return;
    if (confirm('Deseja realmente excluir esta nota?')) {
      deleteNote(activeNote.id);
      setActiveNote(null);
    }
  };

  const insertTable = () => {
    editor?.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run();
  };

  if (!activeNoteId || !activeNote) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-gray-500 bg-[#0a1128]">
        <div className="text-6xl mb-4">✍️</div>
        <h2 className="text-xl font-medium text-gray-300">Selecione ou crie uma nota</h2>
        <p className="text-sm mt-2">Escolha um caderno na barra lateral para começar.</p>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col h-full bg-[#0a1128] text-gray-100">
      <div className="flex flex-col p-6 border-b border-slate-800 gap-4">
        <div className="flex justify-between items-center">
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onBlur={handleSave}
            className="text-3xl font-bold bg-transparent border-none focus:ring-0 outline-none w-full text-white placeholder-gray-600"
            placeholder="Título da Nota"
          />
          <div className="flex gap-2 shrink-0">
            <button 
              onClick={handleSave}
              className="flex items-center gap-2 bg-yellow-600/20 text-yellow-500 hover:bg-yellow-600/30 px-4 py-2 rounded transition-colors"
            >
              <Save size={18} />
              <span>Salvar</span>
            </button>
            <button 
              onClick={handleDelete}
              className="flex items-center gap-2 text-red-400 hover:bg-red-900/30 px-4 py-2 rounded transition-colors"
            >
              <Trash size={18} />
            </button>
          </div>
        </div>
        {/* Toolbar */}
        <div className="flex gap-2 text-gray-400">
          <button 
            onClick={insertTable}
            className="flex items-center gap-1 hover:text-yellow-400 text-sm bg-slate-900 px-2 py-1 rounded border border-slate-700 transition"
            title="Inserir Tabela"
          >
            <TableIcon size={14} /> Tabela
          </button>
        </div>
      </div>
      
      <div className="flex-1 overflow-y-auto p-8 relative">
        <div className="max-w-4xl mx-auto">
          {editor && (
            <>
              {/* Floating Menu for empty lines */}
              <FloatingMenu editor={editor} className="bg-slate-900 shadow-xl border border-slate-700 rounded-lg flex overflow-hidden -ml-12">
                <button
                  onClick={insertTable}
                  className="flex items-center gap-2 p-2 hover:bg-slate-800 transition text-gray-300 hover:text-yellow-500 text-sm"
                  title="Inserir Tabela (/tabela)"
                >
                  <Plus size={16} /> <TableIcon size={16} />
                </button>
              </FloatingMenu>

              {/* General Bubble Menu */}
              <BubbleMenu editor={editor} shouldShow={(props: any) => {
                return !props.editor.isActive('table') && props.from !== props.to;
              }} className="bg-slate-900 shadow-xl border border-slate-700 rounded-lg flex overflow-hidden z-50">
                <button
                  onClick={() => editor.chain().focus().toggleBold().run()}
                  className={`p-2 hover:bg-slate-800 transition ${editor.isActive('bold') ? 'text-yellow-500' : 'text-gray-300'}`}
                  title="Negrito (Ctrl+B)"
                >
                  <Bold size={16} />
                </button>
                <button
                  onClick={() => editor.chain().focus().toggleItalic().run()}
                  className={`p-2 hover:bg-slate-800 transition ${editor.isActive('italic') ? 'text-yellow-500' : 'text-gray-300'}`}
                  title="Itálico (Ctrl+I)"
                >
                  <Italic size={16} />
                </button>
                <button
                  onClick={() => editor.chain().focus().toggleStrike().run()}
                  className={`p-2 hover:bg-slate-800 transition ${editor.isActive('strike') ? 'text-yellow-500' : 'text-gray-300'}`}
                  title="Tachado (Ctrl+Shift+X)"
                >
                  <Strikethrough size={16} />
                </button>
                <button
                  onClick={() => editor.chain().focus().toggleCode().run()}
                  className={`p-2 hover:bg-slate-800 transition ${editor.isActive('code') ? 'text-yellow-500' : 'text-gray-300'}`}
                  title="Código (Ctrl+E)"
                >
                  <Code size={16} />
                </button>
              </BubbleMenu>

              {/* Table Specific Bubble Menu */}
              <BubbleMenu editor={editor} shouldShow={(props: any) => props.editor.isActive('table')} className="bg-slate-900 shadow-xl border border-slate-700 rounded-lg flex flex-wrap max-w-xs overflow-hidden z-50 p-1 gap-1">
                <button onClick={() => editor.chain().focus().addRowBefore().run()} className="p-1 hover:bg-slate-800 text-gray-300 rounded" title="Adicionar linha acima"><ArrowUp size={16}/></button>
                <button onClick={() => editor.chain().focus().addRowAfter().run()} className="p-1 hover:bg-slate-800 text-gray-300 rounded" title="Adicionar linha abaixo"><ArrowDown size={16}/></button>
                <button onClick={() => editor.chain().focus().deleteRow().run()} className="p-1 hover:bg-slate-800 text-red-400 rounded" title="Deletar linha"><Trash2 size={16}/></button>
                <div className="w-px h-6 bg-slate-700 mx-1 self-center"></div>
                <button onClick={() => editor.chain().focus().addColumnBefore().run()} className="p-1 hover:bg-slate-800 text-gray-300 rounded" title="Adicionar coluna à esquerda"><ArrowLeft size={16}/></button>
                <button onClick={() => editor.chain().focus().addColumnAfter().run()} className="p-1 hover:bg-slate-800 text-gray-300 rounded" title="Adicionar coluna à direita"><ArrowRight size={16}/></button>
                <button onClick={() => editor.chain().focus().deleteColumn().run()} className="p-1 hover:bg-slate-800 text-red-400 rounded" title="Deletar coluna"><Trash2 size={16}/></button>
                <div className="w-px h-6 bg-slate-700 mx-1 self-center"></div>
                <button onClick={() => editor.chain().focus().deleteTable().run()} className="p-1 flex items-center gap-1 hover:bg-red-900/30 text-red-500 rounded px-2" title="Deletar Tabela"><Trash size={14}/> Tabela</button>
              </BubbleMenu>
            </>
          )}
          <EditorContent editor={editor} />
        </div>
      </div>
    </div>
  );
};
