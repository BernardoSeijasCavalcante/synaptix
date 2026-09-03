import { useEffect, useState, useRef } from 'react';
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
import { TextAlign } from '@tiptap/extension-text-align';
import { all, createLowlight } from 'lowlight';
import 'highlight.js/styles/github-dark.css';
import { useNotesStore } from '../store/useNotesStore';
import { usePromptStore } from '../store/usePromptStore';
import { useCommentsStore } from '../store/useCommentsStore';
import { Save, Trash, Bold, Italic, Strikethrough, Code, Table as TableIcon, Plus, Trash2, ArrowUp, ArrowDown, ArrowLeft, ArrowRight, AlignLeft, AlignCenter, AlignRight, AlignJustify, MessageSquarePlus, PanelRight } from 'lucide-react';
import { InputRule, Extension } from '@tiptap/core';
import { CommentMark } from './extensions/CommentMark';
import { CommentSidebar } from './CommentSidebar';
import Mention from '@tiptap/extension-mention';
import suggestion from './extensions/suggestion';
import { CommentMindMap } from './CommentMindMap';
import { DocumentViewer } from './DocumentViewer';

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
  const { fetchComments, createComment, comments } = useCommentsStore();
  const activeNote = notes.find(n => n.id === activeNoteId);
  const [title, setTitle] = useState('');
  
  const [hoveredCommentId, setHoveredCommentId] = useState<number | null>(null);
  const [isMindMapExpanded, setIsMindMapExpanded] = useState(false);
  const [pdfPageNumber, setPdfPageNumber] = useState(1);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  
  const containerRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<HTMLDivElement>(null);
  const [connections, setConnections] = useState<{ id: number; path: string }[]>([]);

  const editor = useEditor({
    extensions: [
      StarterKit,
      Markdown.configure({ html: true }),
      TaskList,
      TaskItem.configure({ nested: true }),
      Table.configure({ resizable: true }),
      TableRow,
      TableHeader,
      TableCell,
      Link.configure({ openOnClick: false }),
      CodeBlockLowlight.configure({ lowlight }),
      TableShortcut,
      TextAlign.configure({ types: ['tableCell', 'tableHeader'] }),
      CommentMark,
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
        class: 'focus:outline-none min-h-[500px] prose prose-invert max-w-none',
      },
    },
  });

  useEffect(() => {
    if (activeNoteId && !isMindMapExpanded) {
      fetchComments(activeNoteId);
    }
  }, [activeNoteId, isMindMapExpanded]);

  useEffect(() => {
    if (activeNote && editor) {
      setTitle(activeNote.title);
      setPdfPageNumber(1);
      const currentMarkdown = (editor as any).storage.markdown.getMarkdown();
      if (currentMarkdown !== activeNote.content) {
        editor.commands.setContent(activeNote.content);
      }
    }
  }, [activeNoteId, editor]);

  const updateConnections = () => {
    if (!containerRef.current || isMindMapExpanded) return;
    const containerRect = containerRef.current.getBoundingClientRect();
    const newConnections: { id: number; path: string }[] = [];

    comments.forEach(comment => {
      const markElement = document.querySelector(`mark[data-comment-id="${comment.id}"]`) || 
                          document.querySelector(`div[data-pdf-comment-id="${comment.id}"]`);
      const sidebarElement = document.querySelector(`#sidebar-comment-${comment.id}`);

      if (markElement && sidebarElement) {
        const markRect = markElement.getBoundingClientRect();
        const sidebarRect = sidebarElement.getBoundingClientRect();

        const startX = markRect.right - containerRect.left;
        const startY = markRect.top + markRect.height / 2 - containerRect.top;
        
        const endX = sidebarRect.left - containerRect.left;
        const endY = sidebarRect.top + 24 - containerRect.top; 

        const cp1x = startX + 40;
        const cp1y = startY;
        const cp2x = endX - 40;
        const cp2y = endY;

        const path = `M ${startX} ${startY} C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${endX} ${endY}`;
        newConnections.push({ id: comment.id, path });
      }
    });

    setConnections(newConnections);
  };

  useEffect(() => {
    updateConnections();
    window.addEventListener('resize', updateConnections);
    const interval = setInterval(updateConnections, 500); 
    return () => {
      window.removeEventListener('resize', updateConnections);
      clearInterval(interval);
    };
  }, [comments, editor?.state.doc, isMindMapExpanded, isSidebarOpen]);

  const handleSave = () => {
    if (!activeNote || !editor) return;
    updateNote(activeNote.id, {
      title,
      content: (editor as any).storage.markdown.getMarkdown(),
    });
  };

  const handleAddComment = async () => {
    if (!editor || !activeNoteId) return;
    
    const { from, to } = editor.state.selection;
    if (from === to) return;
    
    const selectedText = editor.state.doc.textBetween(from, to, ' ');
    const content = await usePromptStore.getState().openPrompt("Digite seu comentário:");
    if (!content) return;

    const newComment = await createComment(activeNoteId, content, selectedText);
    if (newComment) {
      editor.chain().focus().setTextSelection({ from, to }).setComment(newComment.id.toString()).run();
      handleSave();
    }
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
    <div className="flex-1 flex flex-col h-full bg-[#0a1128] text-gray-100 overflow-hidden">
      {!isMindMapExpanded && activeNote.type !== 'pdf' && (
        <div className="flex flex-col p-6 border-b border-slate-800 gap-4 shrink-0">
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
          <div className="flex gap-2 text-gray-400">
            <button 
              onClick={insertTable}
              className="flex items-center gap-1 hover:text-yellow-400 text-sm bg-slate-900 px-2 py-1 rounded border border-slate-700 transition"
              title="Inserir Tabela"
            >
              <TableIcon size={14} /> Tabela
            </button>
            <button 
              onClick={() => setIsSidebarOpen(!isSidebarOpen)}
              className={`flex items-center gap-1 text-sm bg-slate-900 px-2 py-1 rounded border border-slate-700 transition ${isSidebarOpen ? 'text-yellow-500 hover:text-yellow-400' : 'hover:text-yellow-400 text-gray-400'}`}
              title="Alternar Sidebar de Comentários"
            >
              <PanelRight size={14} /> Comentários
            </button>
          </div>
        </div>
      )}
      
      <div className="flex-1 flex overflow-hidden relative" ref={containerRef}>
        {!isMindMapExpanded && (
          <svg className="absolute inset-0 pointer-events-none z-10" style={{ width: '100%', height: '100%' }}>
            {connections.map(conn => (
              <path 
                key={conn.id} 
                d={conn.path} 
                fill="none" 
                stroke={hoveredCommentId === conn.id ? "#eab308" : "#334155"} 
                strokeWidth="2"
                className="transition-colors duration-200"
              />
            ))}
          </svg>
        )}

        {isMindMapExpanded ? (
          <CommentMindMap onNavigateToNote={(noteId) => {
            setActiveNote(noteId);
            setIsMindMapExpanded(false);
          }} />
        ) : activeNote.type === 'pdf' ? (
          <DocumentViewer 
            hoveredCommentId={hoveredCommentId} 
            pageNumber={pdfPageNumber} 
            setPageNumber={setPdfPageNumber} 
            isSidebarOpen={isSidebarOpen}
            onToggleSidebar={() => setIsSidebarOpen(!isSidebarOpen)}
            onScroll={updateConnections}
          />
        ) : (
          <div className="flex-1 overflow-y-auto p-8 relative" ref={editorRef} onScroll={updateConnections}>
            <div className="max-w-4xl mx-auto">
              {editor && (
                <>
                  <FloatingMenu editor={editor} className="bg-slate-900 shadow-xl border border-slate-700 rounded-lg flex overflow-hidden -ml-12">
                    <button
                      onClick={insertTable}
                      className="flex items-center gap-2 p-2 hover:bg-slate-800 transition text-gray-300 hover:text-yellow-500 text-sm"
                      title="Inserir Tabela (/tabela)"
                    >
                      <Plus size={16} /> <TableIcon size={16} />
                    </button>
                  </FloatingMenu>

                  <BubbleMenu editor={editor} shouldShow={(props: any) => {
                    return !props.editor.isActive('table') && props.from !== props.to;
                  }} className="bg-slate-900 shadow-xl border border-slate-700 rounded-lg flex overflow-hidden z-50">
                    <button
                      onClick={handleAddComment}
                      className="p-2 hover:bg-slate-800 transition text-gray-300 hover:text-yellow-500"
                      title="Comentar"
                    >
                      <MessageSquarePlus size={16} />
                    </button>
                    <div className="w-px h-6 bg-slate-700 mx-1 self-center"></div>
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

                  <BubbleMenu editor={editor} shouldShow={(props: any) => props.editor.isActive('table')} className="bg-slate-900 shadow-xl border border-slate-700 rounded-lg flex flex-wrap max-w-xs overflow-hidden z-50 p-1 gap-1">
                    <button onClick={() => editor.chain().focus().addRowBefore().run()} className="p-1 hover:bg-slate-800 text-gray-300 rounded" title="Adicionar linha acima"><ArrowUp size={16}/></button>
                    <button onClick={() => editor.chain().focus().addRowAfter().run()} className="p-1 hover:bg-slate-800 text-gray-300 rounded" title="Adicionar linha abaixo"><ArrowDown size={16}/></button>
                    <button onClick={() => editor.chain().focus().deleteRow().run()} className="p-1 hover:bg-slate-800 text-red-400 rounded" title="Deletar linha"><Trash2 size={16}/></button>
                    <div className="w-px h-6 bg-slate-700 mx-1 self-center"></div>
                    <button onClick={() => editor.chain().focus().addColumnBefore().run()} className="p-1 hover:bg-slate-800 text-gray-300 rounded" title="Adicionar coluna à esquerda"><ArrowLeft size={16}/></button>
                    <button onClick={() => editor.chain().focus().addColumnAfter().run()} className="p-1 hover:bg-slate-800 text-gray-300 rounded" title="Adicionar coluna à direita"><ArrowRight size={16}/></button>
                    <button onClick={() => editor.chain().focus().deleteColumn().run()} className="p-1 hover:bg-slate-800 text-red-400 rounded" title="Deletar coluna"><Trash2 size={16}/></button>
                    <div className="w-px h-6 bg-slate-700 mx-1 self-center"></div>
                    <button onClick={() => editor.chain().focus().setTextAlign('left').run()} className={`p-1 hover:bg-slate-800 rounded ${editor.isActive({ textAlign: 'left' }) ? 'text-yellow-500' : 'text-gray-300'}`} title="Alinhar à Esquerda"><AlignLeft size={16}/></button>
                    <button onClick={() => editor.chain().focus().setTextAlign('center').run()} className={`p-1 hover:bg-slate-800 rounded ${editor.isActive({ textAlign: 'center' }) ? 'text-yellow-500' : 'text-gray-300'}`} title="Centralizar"><AlignCenter size={16}/></button>
                    <button onClick={() => editor.chain().focus().setTextAlign('right').run()} className={`p-1 hover:bg-slate-800 rounded ${editor.isActive({ textAlign: 'right' }) ? 'text-yellow-500' : 'text-gray-300'}`} title="Alinhar à Direita"><AlignRight size={16}/></button>
                    <button onClick={() => editor.chain().focus().setTextAlign('justify').run()} className={`p-1 hover:bg-slate-800 rounded ${editor.isActive({ textAlign: 'justify' }) ? 'text-yellow-500' : 'text-gray-300'}`} title="Justificar"><AlignJustify size={16}/></button>
                    <div className="w-px h-6 bg-slate-700 mx-1 self-center"></div>
                    <button onClick={() => editor.chain().focus().deleteTable().run()} className="p-1 flex items-center gap-1 hover:bg-red-900/30 text-red-500 rounded px-2" title="Deletar Tabela"><Trash size={14}/> Tabela</button>
                  </BubbleMenu>
                </>
              )}
              <EditorContent editor={editor} />
            </div>
          </div>
        )}

        {isSidebarOpen && (
          <div className="shrink-0 z-20 h-full flex flex-col" onScroll={updateConnections}>
            <CommentSidebar 
              onHoverComment={setHoveredCommentId} 
              hoveredCommentId={hoveredCommentId} 
              isMindMapExpanded={isMindMapExpanded}
              onToggleMindMap={() => setIsMindMapExpanded(!isMindMapExpanded)}
            />
          </div>
        )}
      </div>
    </div>
  );
};

