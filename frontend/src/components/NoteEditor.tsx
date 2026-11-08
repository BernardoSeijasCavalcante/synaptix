import { useEffect, useState, useRef, useCallback } from 'react';
import { useEditor, EditorContent, ReactNodeViewRenderer } from '@tiptap/react';
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
import { 
  Trash, Bold, Italic, Strikethrough, Code, Table as TableIcon, Plus, Trash2, 
  ArrowUp, ArrowDown, ArrowLeft, ArrowRight, AlignLeft, AlignCenter, AlignRight, AlignJustify, 
  MessageSquarePlus, PanelRight, FileEdit, Sparkles, FolderInput, Loader2, CloudCheck,
  Lock, Unlock, Key, Eye, EyeOff, AlertCircle, Image as ImageIcon, Link as LinkIcon,
  Unlink, ExternalLink, Copy, Check, Pencil, FileDown, Upload, X, GraduationCap
} from 'lucide-react';
import { useGuidedStudyStore } from '../store/useGuidedStudyStore';
import { GuidedStudySidebar } from './GuidedStudySidebar';
import { InputRule, Extension } from '@tiptap/core';
import { CommentMark } from './extensions/CommentMark';
import { NoteImage } from './extensions/NoteImage';
import { InteractiveCodeBlockView } from './extensions/InteractiveCodeBlockView';
import { CommentSidebar } from './CommentSidebar';
import Mention from '@tiptap/extension-mention';
import suggestion from './extensions/suggestion';
import { CommentMindMap } from './CommentMindMap';
import { DocumentViewer } from './DocumentViewer';
import { PasswordModal, type PasswordModalMode } from './PasswordModal';
import { exportNoteToPdf } from '../utils/exportNotePdf';

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
  const { 
    notes, activeNoteId, activeNotebookId, createNote, updateNote, deleteNote, setActiveNote, openTransferModal,
    isNoteUnlocked, unlockNote, lockNote, setNotePassword, removeNotePassword, uploadFile 
  } = useNotesStore();
  const { fetchComments, createComment, deleteComment, comments, loadedNoteId, isLoadingComments } = useCommentsStore();
  const { 
    isOpen: isStudyDrawerOpen, 
    toggleDrawer: toggleStudyDrawer, 
    activeSession: activeStudySession 
  } = useGuidedStudyStore();
  const activeNote = notes.find(n => n.id === activeNoteId);
  const isUnlocked = activeNote ? (!activeNote.is_password_protected || isNoteUnlocked(activeNote.id)) : false;
  const [title, setTitle] = useState('');
  const [saveStatus, setSaveStatus] = useState<'saved' | 'saving' | 'unsaved'>('saved');
  
  const [hoveredCommentId, setHoveredCommentId] = useState<number | null>(null);
  const [isMindMapExpanded, setIsMindMapExpanded] = useState(false);
  const [pdfPageNumber, setPdfPageNumber] = useState(1);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [editingCommentRectId, setEditingCommentRectId] = useState<number | null>(null);
  const [lastViewedPdfInfo, setLastViewedPdfInfo] = useState<{ noteId: number; page: number; title: string } | null>(null);

  const handleNavigateToSlide = useCallback((noteIdOrTitle: number | string, pageNumber?: number) => {
    let targetPdf: typeof notes[0] | undefined = undefined;
    if (typeof noteIdOrTitle === 'number') {
      targetPdf = notes.find((n) => n.id === noteIdOrTitle);
    }
    if (!targetPdf || targetPdf.type !== 'pdf') {
      const searchStr = (typeof noteIdOrTitle === 'string' ? noteIdOrTitle : targetPdf?.title || '').trim().toLowerCase();
      if (searchStr) {
        targetPdf = notes.find((n) => n.type === 'pdf' && (
          n.title.trim().toLowerCase() === searchStr ||
          n.title.toLowerCase().includes(searchStr) ||
          searchStr.includes(n.title.toLowerCase()) ||
          (n.file_url && n.file_url.toLowerCase().includes(searchStr))
        ));
      }
      if (!targetPdf) {
        // Fallback: primeiro PDF encontrado no mesmo caderno
        targetPdf = notes.find((n) => n.type === 'pdf' && n.notebook_id === activeNotebookId)
          || notes.find((n) => n.type === 'pdf');
      }
    }

    if (targetPdf) {
      const targetPage = pageNumber && pageNumber > 0 ? pageNumber : 1;
      setLastViewedPdfInfo({ noteId: targetPdf.id, page: targetPage, title: targetPdf.title });
      setPdfPageNumber(targetPage);
      setActiveNote(targetPdf.id);
    }
  }, [notes, activeNotebookId, setActiveNote]);

  const handleInsertStudyContent = (markdownContent: string) => {
    // Decodifica entidades HTML acidentais em blocos de código (ex: --&gt; -> -->)
    const sanitizedMarkdown = markdownContent.replace(/(```[\s\S]*?```)/g, (codeBlock) => {
      return codeBlock
        .replace(/--&gt;/g, '-->')
        .replace(/&lt;--/g, '<--')
        .replace(/&gt;=/g, '>=')
        .replace(/&lt;=/g, '<=')
        .replace(/&gt;/g, '>')
        .replace(/&lt;/g, '<')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/&amp;/g, '&');
    });

    if (editor && activeNote?.type !== 'pdf') {
      const parsedHtml = (editor as any).storage?.markdown?.parser?.parse(sanitizedMarkdown);
      if (parsedHtml) {
        editor.chain().focus().insertContent(parsedHtml).run();
      } else {
        editor.chain().focus().insertContent(sanitizedMarkdown).run();
      }
      const currentMarkdown = (editor as any).storage?.markdown?.getMarkdown() || '';
      if (activeNoteIdRef.current) {
        scheduleAutoSave(activeNoteIdRef.current, titleRef.current, currentMarkdown);
      }
    } else {
      // Quando um PDF está aberto na tela, insere na nota Markdown de resumo da sessão
      const targetNoteId = activeStudySession?.target_note_id;
      const targetNote = targetNoteId 
        ? notes.find((n) => n.id === targetNoteId) 
        : notes.find((n) => n.notebook_id === activeNotebookId && n.type !== 'pdf');

      if (targetNote) {
        const updatedBody = (targetNote.content || '') + '\n\n' + sanitizedMarkdown;
        updateNote(targetNote.id, { content: updatedBody });
      } else if (activeNotebookId) {
        createNote(
          activeStudySession?.title ? `Anotações: ${activeStudySession.title}` : 'Anotações de Estudo Guiado',
          sanitizedMarkdown,
          activeNotebookId
        );
      }
    }
  };

  // Estados para Proteção por Senha
  const [unlockInput, setUnlockInput] = useState('');
  const [showUnlockPassword, setShowUnlockPassword] = useState(false);
  const [isUnlocking, setIsUnlocking] = useState(false);
  const [unlockError, setUnlockError] = useState<string | null>(null);

  const [passwordModalOpen, setPasswordModalOpen] = useState(false);
  const [passwordModalMode, setPasswordModalMode] = useState<PasswordModalMode>('set');
  const [showSecurityMenu, setShowSecurityMenu] = useState(false);

  // Estados para Inserção de Imagens
  const [imageModalOpen, setImageModalOpen] = useState(false);
  const [imageTab, setImageTab] = useState<'upload' | 'url'>('upload');
  const [imageUrlInput, setImageUrlInput] = useState('');
  const [imageAltInput, setImageAltInput] = useState('');
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Estados para Inserção e Edição de Links
  const [linkModalOpen, setLinkModalOpen] = useState(false);
  const [linkUrlInput, setLinkUrlInput] = useState('');
  const [linkTextInput, setLinkTextInput] = useState('');
  const [isEditingExistingLink, setIsEditingExistingLink] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);

  // Estado para Exportação em PDF
  const [isExportingPdf, setIsExportingPdf] = useState(false);
  
  const containerRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<HTMLDivElement>(null);
  const [connections, setConnections] = useState<{ id: number; path: string }[]>([]);

  // Refs para controle robusto de auto-save
  const activeNoteIdRef = useRef<number | null>(activeNoteId);
  const previousNoteIdRef = useRef<number | null>(null);
  const loadedNoteIdRef = useRef<number | null>(null);
  const titleRef = useRef(title);
  const isSettingContentRef = useRef(false);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastAutoSaveTimeRef = useRef<number>(0);
  const pendingDataRef = useRef<{ noteId: number; title: string; content: string } | null>(null);
  const uploadAndInsertImageRef = useRef<((file: File, insertPos?: number) => Promise<void>) | null>(null);

  useEffect(() => {
    activeNoteIdRef.current = activeNoteId;
  }, [activeNoteId]);

  useEffect(() => {
    titleRef.current = title;
  }, [title]);

  const performSave = useCallback(async (noteId: number, noteTitle: string, noteContent: string) => {
    if (!noteId) return;
    setSaveStatus('saving');
    try {
      await updateNote(noteId, {
        title: noteTitle,
        content: noteContent,
      });
      try {
        localStorage.removeItem(`synaptix_draft_${noteId}`);
      } catch {
        // Ignora erros de localStorage
      }
      setSaveStatus('saved');
    } catch (error) {
      console.error('Error auto-saving note:', error);
      setSaveStatus('unsaved');
    }
  }, [updateNote]);

  const scheduleAutoSave = useCallback((noteId: number, noteTitle: string, noteContent: string) => {
    if (!noteId) return;

    // Cache imediato em memória e localStorage para prevenção de perda por crash
    pendingDataRef.current = { noteId, title: noteTitle, content: noteContent };
    try {
      localStorage.setItem(`synaptix_draft_${noteId}`, JSON.stringify({
        noteId,
        title: noteTitle,
        content: noteContent,
        updatedAt: Date.now(),
      }));
    } catch {
      // Ignora erro de quota do localStorage
    }

    setSaveStatus('saving');

    const now = Date.now();
    const MAX_AUTO_SAVE_INTERVAL = 3000; // Salva no máximo a cada 3s durante digitação contínua

    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }

    if (now - lastAutoSaveTimeRef.current > MAX_AUTO_SAVE_INTERVAL) {
      lastAutoSaveTimeRef.current = now;
      performSave(noteId, noteTitle, noteContent);
      pendingDataRef.current = null;
      return;
    }

    debounceTimerRef.current = setTimeout(() => {
      debounceTimerRef.current = null;
      lastAutoSaveTimeRef.current = Date.now();
      const pending = pendingDataRef.current;
      if (pending && pending.noteId === noteId) {
        performSave(pending.noteId, pending.title, pending.content);
        pendingDataRef.current = null;
      }
    }, 750);
  }, [performSave]);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        codeBlock: false,
      }),
      Markdown.configure({ html: true }),
      TaskList,
      TaskItem.configure({ nested: true }),
      Table.configure({ resizable: true }),
      TableRow,
      TableHeader,
      TableCell,
      Link.configure({
        openOnClick: false,
        autolink: true,
        linkOnPaste: true,
        HTMLAttributes: {
          rel: 'noopener noreferrer',
          target: '_blank',
        },
      }),
      NoteImage,
      CodeBlockLowlight.extend({
        addNodeView() {
          return ReactNodeViewRenderer(InteractiveCodeBlockView);
        },
      }).configure({ lowlight }),
      TableShortcut,
      TextAlign.configure({ types: ['tableCell', 'tableHeader'] }),
      CommentMark,
      Mention.configure({
        HTMLAttributes: {
          class: 'mention bg-amber-500/20 text-amber-300 border border-amber-500/30 rounded px-1.5 py-0.5 font-medium cursor-pointer hover:bg-amber-500/30 transition-colors shadow-sm',
        },
        suggestion,
      }),
    ],
    content: '',
    onUpdate: ({ editor }) => {
      if (isSettingContentRef.current) return;
      const noteId = activeNoteIdRef.current;
      if (!noteId) return;
      const markdown = (editor as any).storage?.markdown?.getMarkdown() || '';
      scheduleAutoSave(noteId, titleRef.current, markdown);
    },
    editorProps: {
      attributes: {
        class: 'focus:outline-none min-h-[500px] prose prose-invert max-w-none prose-headings:text-slate-100 prose-p:text-slate-200 prose-p:leading-relaxed prose-code:text-amber-300 prose-pre:bg-slate-950/70 prose-pre:border prose-pre:border-white/10 prose-pre:backdrop-blur-md',
      },
      handleDOMEvents: {
        blur: () => {
          flushSave();
          return false;
        },
        click: (_view, event) => {
          const target = event.target as HTMLElement | null;
          const anchor = target?.closest('a');
          if (anchor && (event.ctrlKey || event.metaKey)) {
            const href = anchor.getAttribute('href');
            if (href) {
              event.preventDefault();
              window.open(href, '_blank', 'noopener,noreferrer');
              return true;
            }
          }
          return false;
        },
      },
      handlePaste: (_view, event) => {
        const items = Array.from(event.clipboardData?.items || []);
        const imageItem = items.find((item) => item.type.startsWith('image/'));
        if (imageItem) {
          const file = imageItem.getAsFile();
          if (file && uploadAndInsertImageRef.current) {
            event.preventDefault();
            uploadAndInsertImageRef.current(file);
            return true;
          }
        }
        return false;
      },
      handleDrop: (view, event, _slice, moved) => {
        if (moved) return false;
        const files = Array.from(event.dataTransfer?.files || []);
        const imageFile = files.find((f) => f.type.startsWith('image/'));
        if (imageFile && uploadAndInsertImageRef.current) {
          event.preventDefault();
          const coords = view.posAtCoords({ left: event.clientX, top: event.clientY });
          uploadAndInsertImageRef.current(imageFile, coords?.pos);
          return true;
        }
        return false;
      },
    },
  });

  const flushSave = useCallback(async (targetNoteId?: number) => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }

    const idToSave = targetNoteId ?? activeNoteIdRef.current;
    if (!idToSave) return;

    const pending = pendingDataRef.current;
    if (pending && pending.noteId === idToSave) {
      pendingDataRef.current = null;
      await performSave(idToSave, pending.title, pending.content);
    }
  }, [performSave]);

  const handleUploadAndInsertImage = useCallback(
    async (file: File, insertPos?: number) => {
      if (!editor) return;
      setIsUploadingImage(true);
      try {
        const uploadedUrl = await uploadFile(file);
        if (uploadedUrl) {
          const cleanUrl = uploadedUrl
            .replace(/^http:\/\/localhost:8000/, '')
            .replace(/^http:\/\/127\.0\.0\.1:8000/, '');
          const chain = editor.chain().focus();
          if (typeof insertPos === 'number') {
            chain.setTextSelection(insertPos);
          }
          chain
            .setNoteImage({
              src: cleanUrl,
              alt: file.name || 'Imagem da nota',
              width: '100%',
              align: 'center',
            })
            .run();
          setImageModalOpen(false);
          setImageUrlInput('');
          setImageAltInput('');

          const noteId = activeNoteIdRef.current;
          if (noteId) {
            const markdown = (editor as any).storage?.markdown?.getMarkdown() || '';
            await performSave(noteId, titleRef.current, markdown);
          }
        }
      } catch (err) {
        console.error('Erro ao enviar imagem para a nota:', err);
      } finally {
        setIsUploadingImage(false);
      }
    },
    [editor, uploadFile, performSave]
  );

  useEffect(() => {
    uploadAndInsertImageRef.current = handleUploadAndInsertImage;
  }, [handleUploadAndInsertImage]);

  useEffect(() => {
    setUnlockInput('');
    setUnlockError(null);
    setShowUnlockPassword(false);
    setShowSecurityMenu(false);
    setImageModalOpen(false);
    setLinkModalOpen(false);
  }, [activeNoteId]);

  const handleUnlockFromEditor = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeNoteId || !unlockInput) return;
    setUnlockError(null);
    setIsUnlocking(true);
    try {
      await unlockNote(activeNoteId, unlockInput);
      setUnlockInput('');
    } catch (err: any) {
      setUnlockError(err.message || 'Senha incorreta.');
    } finally {
      setIsUnlocking(false);
    }
  };

  const handlePasswordModalSubmit = async (data: { password: string; currentPassword?: string }) => {
    if (!activeNoteId) return;
    if (passwordModalMode === 'set') {
      await setNotePassword(activeNoteId, data.password);
    } else if (passwordModalMode === 'change') {
      await setNotePassword(activeNoteId, data.password, data.currentPassword);
    } else if (passwordModalMode === 'remove') {
      await removeNotePassword(activeNoteId, data.password);
    }
  };

  useEffect(() => {
    if (activeNoteId && !isMindMapExpanded) {
      if (isUnlocked) {
        fetchComments(activeNoteId);
      }
    }
  }, [activeNoteId, isMindMapExpanded, isUnlocked, fetchComments]);

  useEffect(() => {
    if (!activeNote || !editor) {
      if (previousNoteIdRef.current) {
        flushSave(previousNoteIdRef.current);
      }
      previousNoteIdRef.current = null;
      loadedNoteIdRef.current = null;
      return;
    }

    if (activeNote.is_password_protected && !isUnlocked) {
      if (previousNoteIdRef.current && previousNoteIdRef.current !== activeNote.id) {
        flushSave(previousNoteIdRef.current);
      }
      previousNoteIdRef.current = activeNote.id;
      loadedNoteIdRef.current = null;
      return;
    }

    // Salva imediatamente qualquer alteração pendente da nota anterior antes de trocar
    if (previousNoteIdRef.current && previousNoteIdRef.current !== activeNote.id) {
      flushSave(previousNoteIdRef.current);
    }
    previousNoteIdRef.current = activeNote.id;

    // Se esta nota já está carregada no editor, NÃO recarrega nem redefine o conteúdo.
    // Isso evita que auto-saves ou re-renderizações chamem setContent() durante a digitação,
    // o que causava o salto inesperado do cursor para o final da nota e perda de caracteres.
    if (loadedNoteIdRef.current === activeNote.id) {
      return;
    }

    loadedNoteIdRef.current = activeNote.id;

    let targetTitle = activeNote.title || '';
    let targetContent = activeNote.content || '';

    // Verifica se há rascunho recuperado no localStorage em caso de queda de energia/browser fechado
    try {
      const draftStr = localStorage.getItem(`synaptix_draft_${activeNote.id}`);
      if (draftStr) {
        const draft = JSON.parse(draftStr);
        if (draft && draft.noteId === activeNote.id) {
          if (draft.content && draft.content !== activeNote.content) {
            targetContent = draft.content;
            if (draft.title) targetTitle = draft.title;
            performSave(activeNote.id, targetTitle, targetContent);
          } else {
            localStorage.removeItem(`synaptix_draft_${activeNote.id}`);
          }
        }
      }
    } catch (e) {
      console.warn('Erro ao verificar recuperação de rascunho:', e);
    }

    setTitle(targetTitle);
    titleRef.current = targetTitle;
    setPdfPageNumber(1);

    if (activeNote.type !== 'pdf') {
      isSettingContentRef.current = true;
      // Recupera e limpa entidades HTML em blocos de código/Mermaid gravados anteriormente
      const cleanContent = (targetContent || '').replace(/(```[\s\S]*?```)/g, (codeBlock) => {
        return codeBlock
          .replace(/--&gt;/g, '-->')
          .replace(/&lt;--/g, '<--')
          .replace(/&gt;=/g, '>=')
          .replace(/&lt;=/g, '<=')
          .replace(/&gt;/g, '>')
          .replace(/&lt;/g, '<')
          .replace(/&quot;/g, '"')
          .replace(/&#39;/g, "'")
          .replace(/&amp;/g, '&');
      });

      editor.commands.setContent(cleanContent);

      const timer = setTimeout(() => {
        isSettingContentRef.current = false;
      }, 50);

      setSaveStatus('saved');

      return () => {
        clearTimeout(timer);
      };
    } else {
      setSaveStatus('saved');
    }
  }, [activeNoteId, editor, isUnlocked, activeNote?.is_password_protected, flushSave, performSave]);

  const openLinkModal = useCallback(() => {
    if (!editor) return;
    const isLink = editor.isActive('link');
    const currentHref = editor.getAttributes('link').href || '';
    const { from, to } = editor.state.selection;
    let selectedText = '';

    if (isLink && from === to) {
      editor.chain().focus().extendMarkRange('link').run();
      const sel = editor.state.selection;
      selectedText = editor.state.doc.textBetween(sel.from, sel.to, ' ');
    } else if (from !== to) {
      selectedText = editor.state.doc.textBetween(from, to, ' ');
    }

    setLinkUrlInput(currentHref);
    setLinkTextInput(selectedText);
    setIsEditingExistingLink(isLink);
    setLinkModalOpen(true);
  }, [editor]);

  // Listener para fechamento de janela (keepalive), atalhos Ctrl+S / Ctrl+K e unmount
  useEffect(() => {
    const handleBeforeUnload = () => {
      const pending = pendingDataRef.current;
      if (pending) {
        try {
          fetch(`/notes/${pending.noteId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              title: pending.title,
              content: pending.content,
            }),
            keepalive: true,
          });
        } catch (err) {
          console.error('Falha no keepalive unload save:', err);
        }
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        flushSave();
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        if (activeNote && activeNote.type !== 'pdf' && isUnlocked) {
          e.preventDefault();
          openLinkModal();
        }
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      window.removeEventListener('keydown', handleKeyDown);
      if (pendingDataRef.current) {
        flushSave(pendingDataRef.current.noteId);
      }
    };
  }, [flushSave, openLinkModal, activeNote, isUnlocked]);

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

  // Limpar marcações de comentários órfãos quando a lista de comentários terminar de carregar
  useEffect(() => {
    if (!editor || !activeNote || activeNote.type === 'pdf') return;
    if (isLoadingComments || loadedNoteId !== activeNote.id) return;

    const validCommentIdStrings = new Set(comments.map(c => c.id.toString()));
    let hasOrphan = false;

    editor.state.doc.descendants((node) => {
      if (node.marks && node.marks.length > 0) {
        const commentMark = node.marks.find(m => m.type.name === 'comment');
        if (commentMark) {
          const markId = commentMark.attrs['data-comment-id'];
          if (!markId || !validCommentIdStrings.has(String(markId))) {
            hasOrphan = true;
          }
        }
      }
    });

    if (hasOrphan) {
      editor.chain().cleanOrphanComments(comments.map(c => c.id.toString())).run();
      const updatedMarkdown = (editor as any).storage.markdown.getMarkdown();
      updateNote(activeNote.id, {
        title: activeNote.title,
        content: updatedMarkdown,
      });
      try {
        localStorage.removeItem(`synaptix_draft_${activeNote.id}`);
      } catch {
        // Ignora
      }
    }
  }, [comments, loadedNoteId, isLoadingComments, editor, activeNote?.id]);

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
      flushSave();
    }
  };

  const handleDeleteComment = async (commentId: number) => {
    if (editor && activeNote && activeNote.type !== 'pdf') {
      editor.chain().unsetComment(commentId.toString()).run();
      const updatedMarkdown = (editor as any).storage.markdown.getMarkdown();
      await updateNote(activeNote.id, {
        title,
        content: updatedMarkdown,
      });
      try {
        localStorage.removeItem(`synaptix_draft_${activeNote.id}`);
      } catch {
        // Ignora
      }
    }
    await deleteComment(commentId);
  };

  const handleDelete = () => {
    if (!activeNote) return;
    if (confirm('Deseja realmente excluir esta nota?')) {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
        debounceTimerRef.current = null;
      }
      pendingDataRef.current = null;
      try {
        localStorage.removeItem(`synaptix_draft_${activeNote.id}`);
      } catch {
        // Ignora
      }
      deleteNote(activeNote.id);
      setActiveNote(null);
    }
  };

  const insertTable = () => {
    editor?.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run();
  };

  const handleInsertImageByUrl = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editor || !imageUrlInput.trim()) return;
    const rawUrl = imageUrlInput.trim();
    editor
      .chain()
      .focus()
      .setNoteImage({
        src: rawUrl,
        alt: imageAltInput.trim() || 'Imagem',
        width: '100%',
        align: 'center',
      })
      .run();
    setImageModalOpen(false);
    setImageUrlInput('');
    setImageAltInput('');

    const noteId = activeNoteIdRef.current;
    if (noteId) {
      const markdown = (editor as any).storage?.markdown?.getMarkdown() || '';
      await performSave(noteId, titleRef.current, markdown);
    }
  };

  const handleSaveLink = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editor) return;
    let url = linkUrlInput.trim();
    if (!url) {
      editor.chain().focus().extendMarkRange('link').unsetLink().run();
      setLinkModalOpen(false);
      return;
    }

    if (!/^(https?:\/\/|mailto:|tel:|\/)/i.test(url)) {
      url = `https://${url}`;
    }

    const displayText = linkTextInput.trim() || url;
    const { from, to } = editor.state.selection;

    if (from === to && !editor.isActive('link')) {
      editor
        .chain()
        .focus()
        .insertContent({
          type: 'text',
          text: displayText,
          marks: [
            {
              type: 'link',
              attrs: { href: url, target: '_blank' },
            },
          ],
        })
        .run();
    } else {
      if (editor.isActive('link')) {
        editor.chain().focus().extendMarkRange('link').run();
      }
      const sel = editor.state.selection;
      const currentSelectedText = editor.state.doc.textBetween(sel.from, sel.to, ' ');
      if (displayText && displayText !== currentSelectedText) {
        editor
          .chain()
          .focus()
          .insertContentAt(
            { from: sel.from, to: sel.to },
            {
              type: 'text',
              text: displayText,
              marks: [
                {
                  type: 'link',
                  attrs: { href: url, target: '_blank' },
                },
              ],
            }
          )
          .run();
      } else {
        editor.chain().focus().extendMarkRange('link').setLink({ href: url, target: '_blank' }).run();
      }
    }

    setLinkModalOpen(false);
    setLinkUrlInput('');
    setLinkTextInput('');
    setTimeout(() => flushSave(), 100);
  };

  const handleCopyActiveLink = async () => {
    if (!editor) return;
    const href = editor.getAttributes('link').href;
    if (!href) return;
    try {
      await navigator.clipboard.writeText(href);
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 1800);
    } catch (err) {
      console.error('Erro ao copiar link:', err);
    }
  };

  const handleExportPdf = async () => {
    if (!editor || !activeNote || isExportingPdf) return;
    setIsExportingPdf(true);
    try {
      await flushSave();
      const htmlContent = editor.getHTML();
      await exportNoteToPdf({
        title: title || activeNote.title || 'Nota Synaptix',
        htmlContent,
      });
    } catch (err) {
      console.error('Erro ao exportar nota para PDF:', err);
    } finally {
      setIsExportingPdf(false);
    }
  };

  if (!activeNoteId || !activeNote) {
    return (
      <div className="flex-1 flex overflow-hidden relative">
        <div className="flex-1 flex flex-col items-center justify-center text-slate-500 bg-transparent p-8">
          <div className="glass-card max-w-md p-8 sm:p-10 rounded-3xl text-center border border-white/10 shadow-2xl">
            <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-amber-500/10 border border-amber-500/25 flex items-center justify-center text-amber-400">
              <FileEdit size={32} />
            </div>
            <h2 className="text-xl font-bold text-slate-200 mb-2">Selecione ou crie uma nota</h2>
            <p className="text-sm text-slate-400 leading-relaxed mb-5">
              Escolha um caderno ou nota na barra lateral para começar a redigir, ou inicie uma Sessão de Estudo Guiado com o mentor IA.
            </p>
            <div className="flex flex-col gap-2.5">
              <button
                onClick={toggleStudyDrawer}
                className="glass-btn-gold py-2.5 px-4 rounded-xl text-xs font-semibold shadow-lg flex items-center justify-center gap-2"
              >
                <GraduationCap size={16} className="text-amber-400" />
                <span>{isStudyDrawerOpen ? 'Fechar Painel de Estudo' : 'Abrir Estudo Guiado (Superfície & Profundeza)'}</span>
              </button>
              <div className="inline-flex items-center justify-center gap-1.5 text-xs text-amber-400/80 font-medium pt-2">
                <Sparkles size={12} /> Suporte nativo a Markdown, Imagens, Links, Tabelas e Exportação PDF
              </div>
            </div>
          </div>
        </div>
        {isStudyDrawerOpen && (
          <GuidedStudySidebar 
            onInsertIntoNote={handleInsertStudyContent} 
            onNavigateToSlide={handleNavigateToSlide}
          />
        )}
      </div>
    );
  }

  if (activeNote.is_password_protected && !isNoteUnlocked(activeNote.id)) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-slate-500 bg-transparent p-8">
        <div className="glass-card max-w-md w-full p-8 sm:p-10 rounded-3xl text-center border border-amber-500/30 shadow-[0_0_50px_rgba(234,179,8,0.12)]">
          <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-400">
            <Lock size={32} />
          </div>
          <span className="inline-block px-3 py-1 rounded-full text-[11px] font-semibold bg-amber-500/15 text-amber-300 border border-amber-500/30 uppercase tracking-wider mb-2">
            Nota Protegida por Senha
          </span>
          <h2 className="text-xl font-bold text-slate-100 mb-2 truncate max-w-full" title={activeNote.title}>
            {activeNote.title}
          </h2>
          <p className="text-xs text-slate-400 leading-relaxed mb-6">
            O conteúdo desta nota está protegido e criptografado. Digite a senha para visualizar, comentar e editar.
          </p>

          <form onSubmit={handleUnlockFromEditor} className="space-y-4">
            {unlockError && (
              <div className="p-3 bg-rose-500/15 border border-rose-500/40 rounded-xl text-rose-300 text-xs flex items-center gap-2 text-left">
                <AlertCircle size={15} className="shrink-0" />
                <span>{unlockError}</span>
              </div>
            )}
            <div className="relative text-left">
              <input
                type={showUnlockPassword ? 'text' : 'password'}
                value={unlockInput}
                onChange={(e) => setUnlockInput(e.target.value)}
                placeholder="Digite a senha da nota..."
                className="w-full glass-input text-xs text-slate-100 px-3.5 py-3 rounded-xl focus:outline-none focus:border-amber-400/60 pr-10"
                autoFocus
              />
              <button
                type="button"
                onClick={() => setShowUnlockPassword(!showUnlockPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200 transition"
              >
                {showUnlockPassword ? <EyeOff size={15} /> : <Eye size={15} />}
              </button>
            </div>
            <button
              type="submit"
              disabled={isUnlocking}
              className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-xl font-semibold text-xs bg-amber-500 hover:bg-amber-400 text-slate-950 shadow-lg shadow-amber-500/20 transition cursor-pointer"
            >
              {isUnlocking ? <Loader2 size={15} className="animate-spin" /> : <Unlock size={15} />}
              <span>Desbloquear Nota</span>
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col h-full bg-transparent text-slate-100 overflow-hidden" onClick={() => setShowSecurityMenu(false)}>
      {/* Input de arquivo oculto para upload de imagens */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) {
            handleUploadAndInsertImage(file);
          }
          e.target.value = '';
        }}
      />

      {!isMindMapExpanded && activeNote.type !== 'pdf' && (
        <div className="glass-panel-subtle flex flex-col px-6 py-4 border-b border-white/10 gap-3 shrink-0">
          <div className="flex justify-between items-center gap-4">
            <input
              type="text"
              value={title}
              onChange={(e) => {
                const newTitle = e.target.value;
                setTitle(newTitle);
                titleRef.current = newTitle;
                if (activeNote) {
                  const markdown = (editor as any)?.storage?.markdown?.getMarkdown() || '';
                  scheduleAutoSave(activeNote.id, newTitle, markdown);
                }
              }}
              onBlur={() => flushSave()}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  editor?.commands.focus();
                }
              }}
              className="text-2xl sm:text-3xl font-extrabold bg-transparent border-none focus:ring-0 outline-none w-full text-white placeholder-slate-500 tracking-tight"
              placeholder="Título da Nota"
            />
            <div className="flex items-center gap-2 shrink-0">
              {/* Indicador de Status do Auto-save / Upload de Imagem */}
              <div 
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium bg-white/[0.04] border border-white/10 select-none transition-all duration-300"
                title="Todas as alterações são salvas automaticamente"
              >
                {isUploadingImage ? (
                  <>
                    <Loader2 size={13} className="animate-spin text-amber-400" />
                    <span className="text-amber-300 hidden sm:inline">Enviando imagem...</span>
                    <span className="text-amber-300 sm:hidden">Imagem...</span>
                  </>
                ) : saveStatus === 'saving' ? (
                  <>
                    <Loader2 size={13} className="animate-spin text-amber-400" />
                    <span className="text-amber-300 hidden sm:inline">Salvando...</span>
                    <span className="text-amber-300 sm:hidden">Salvando</span>
                  </>
                ) : (
                  <>
                    <CloudCheck size={14} className="text-emerald-400" />
                    <span className="text-slate-400 hidden sm:inline">Salvo automaticamente</span>
                    <span className="text-slate-400 sm:hidden">Salvo</span>
                  </>
                )}
              </div>

              {/* Botão de Exportar Nota para PDF */}
              <button
                onClick={handleExportPdf}
                disabled={isExportingPdf}
                className="glass-btn-ghost hover:bg-amber-500/15 hover:border-amber-500/30 hover:text-amber-300 text-slate-300 flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs transition-all disabled:opacity-50"
                title="Converter e baixar esta nota inteira como PDF"
              >
                {isExportingPdf ? (
                  <Loader2 size={14} className="animate-spin text-amber-400" />
                ) : (
                  <FileDown size={14} className="text-amber-400" />
                )}
                <span className="hidden sm:inline">
                  {isExportingPdf ? 'Gerando PDF...' : 'Exportar PDF'}
                </span>
              </button>

              {/* Controle de Proteção por Senha da Nota */}
              <div className="relative">
                {activeNote.is_password_protected ? (
                  <>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setShowSecurityMenu(!showSecurityMenu);
                      }}
                      className="glass-btn-ghost hover:bg-amber-500/15 hover:border-amber-500/30 text-amber-300 flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs transition-all border border-amber-500/30"
                      title="Gerenciar Proteção por Senha"
                    >
                      <Lock size={14} className="text-amber-400" />
                      <span className="hidden sm:inline">Protegida</span>
                    </button>
                    {showSecurityMenu && (
                      <div 
                        className="absolute right-0 top-full mt-1.5 w-44 bg-slate-900 border border-white/15 rounded-xl shadow-2xl py-1 z-50 text-xs"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <button
                          onClick={() => {
                            setShowSecurityMenu(false);
                            flushSave(activeNote.id);
                            lockNote(activeNote.id);
                          }}
                          className="w-full text-left px-3.5 py-2 hover:bg-white/10 text-slate-200 flex items-center gap-2"
                        >
                          <Lock size={13} className="text-amber-400" />
                          <span>Bloquear Agora</span>
                        </button>
                        <button
                          onClick={() => {
                            setShowSecurityMenu(false);
                            setPasswordModalMode('change');
                            setPasswordModalOpen(true);
                          }}
                          className="w-full text-left px-3.5 py-2 hover:bg-white/10 text-slate-200 flex items-center gap-2"
                        >
                          <Key size={13} className="text-amber-400" />
                          <span>Alterar Senha</span>
                        </button>
                        <button
                          onClick={() => {
                            setShowSecurityMenu(false);
                            setPasswordModalMode('remove');
                            setPasswordModalOpen(true);
                          }}
                          className="w-full text-left px-3.5 py-2 hover:bg-rose-500/20 text-rose-300 flex items-center gap-2"
                        >
                          <Unlock size={13} className="text-rose-400" />
                          <span>Remover Senha</span>
                        </button>
                      </div>
                    )}
                  </>
                ) : (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setPasswordModalMode('set');
                      setPasswordModalOpen(true);
                    }}
                    className="glass-btn-ghost hover:bg-amber-500/15 hover:border-amber-500/30 hover:text-amber-300 text-slate-300 flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs transition-all"
                    title="Adicionar Senha a esta Nota"
                  >
                    <Key size={14} className="text-slate-400" />
                    <span className="hidden sm:inline">Proteger</span>
                  </button>
                )}
              </div>

              <button 
                onClick={() => {
                  flushSave();
                  openTransferModal(activeNote);
                }}

                className="glass-btn-ghost hover:bg-amber-500/15 hover:border-amber-500/30 hover:text-amber-300 text-slate-300 flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs transition-all"
                title="Transferir nota para outro Caderno ou Workspace"
              >
                <FolderInput size={15} />
                <span>Mover</span>
              </button>
              <button 
                onClick={handleDelete}
                className="glass-btn-ghost hover:bg-rose-500/15 hover:border-rose-500/30 hover:text-rose-300 text-slate-400 flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs transition-all"
                title="Excluir nota"
              >
                <Trash size={15} />
              </button>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-slate-400">
            <button 
              onClick={insertTable}
              className="glass-btn-ghost flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-xl hover:text-amber-300 transition-all"
              title="Inserir Tabela (/tabela)"
            >
              <TableIcon size={14} className="text-amber-400" /> Tabela
            </button>
            <button
              onClick={() => {
                setImageTab('upload');
                setImageModalOpen(true);
              }}
              className="glass-btn-ghost flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-xl hover:text-amber-300 transition-all"
              title="Inserir Imagem (Upload, Colar Ctrl+V, Arrastar ou URL)"
            >
              <ImageIcon size={14} className="text-amber-400" /> Imagem
            </button>
            <button
              onClick={openLinkModal}
              className="glass-btn-ghost flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-xl hover:text-amber-300 transition-all"
              title="Inserir ou Editar Link (Ctrl+K)"
            >
              <LinkIcon size={14} className="text-amber-400" /> Link
            </button>
            <button 
              onClick={() => setIsSidebarOpen(!isSidebarOpen)}
              className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-xl transition-all ${
                isSidebarOpen 
                  ? 'bg-amber-500/15 border border-amber-500/30 text-amber-300 shadow-[0_0_12px_rgba(234,179,8,0.15)]' 
                  : 'glass-btn-ghost text-slate-400 hover:text-slate-200'
              }`}
              title="Alternar Sidebar de Comentários"
            >
              <PanelRight size={14} /> Comentários ({comments.length})
            </button>
            {activeNote?.type === 'pdf' && activeStudySession?.target_note_id && (
              <button
                onClick={() => setActiveNote(activeStudySession.target_note_id!)}
                className="glass-btn-gold flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-xl shadow-md transition-all text-amber-200"
                title="Alternar para a nota de anotações do estudo"
              >
                <FileEdit size={13} className="text-amber-400" />
                <span className="hidden sm:inline">Ver Caderno de Anotações</span>
              </button>
            )}
            {activeNote?.type !== 'pdf' && lastViewedPdfInfo && (
              <button
                onClick={() => handleNavigateToSlide(lastViewedPdfInfo.noteId, lastViewedPdfInfo.page)}
                className="glass-btn-ghost flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-xl text-purple-300 hover:text-purple-200 border border-purple-500/30 bg-purple-500/10 shadow-md transition-all"
                title="Retornar ao slide PDF atual"
              >
                <ExternalLink size={13} className="text-purple-400" />
                <span className="hidden sm:inline">Slide: {lastViewedPdfInfo.title} (Pág. {lastViewedPdfInfo.page})</span>
              </button>
            )}
            <button 
              onClick={toggleStudyDrawer}
              className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-xl transition-all ${
                isStudyDrawerOpen 
                  ? 'bg-gradient-to-r from-purple-500/20 to-amber-500/20 border border-purple-500/40 text-purple-200 shadow-[0_0_12px_rgba(168,85,247,0.25)]' 
                  : 'glass-btn-ghost text-slate-300 hover:text-amber-300'
              }`}
              title="Alternar Painel de Estudo Guiado (Superfície & Profundeza)"
            >
              <GraduationCap size={14} className={isStudyDrawerOpen ? 'text-purple-400' : 'text-amber-400'} />
              <span>Estudo Guiado</span>
              {activeStudySession && (
                <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse ml-0.5" />
              )}
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
                stroke={hoveredCommentId === conn.id ? "#eab308" : "rgba(148, 163, 184, 0.25)"} 
                strokeWidth={hoveredCommentId === conn.id ? "2.5" : "1.5"}
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
            editingCommentRectId={editingCommentRectId}
            setEditingCommentRectId={setEditingCommentRectId}
          />
        ) : (
          <div className="flex-1 overflow-y-auto p-6 sm:p-10 relative" ref={editorRef} onScroll={updateConnections}>
            <div className="max-w-4xl mx-auto">
              {editor && (
                <>
                  <FloatingMenu editor={editor} className="glass-panel bg-slate-900/85 backdrop-blur-2xl border border-white/15 shadow-2xl rounded-xl flex overflow-hidden p-1 gap-1 -ml-12 z-50">
                    <button
                      onClick={insertTable}
                      className="flex items-center gap-1.5 p-2 hover:bg-white/10 rounded-lg transition text-slate-300 hover:text-amber-400 text-xs font-medium"
                      title="Inserir Tabela (/tabela)"
                    >
                      <Plus size={14} /> <TableIcon size={14} /> Tabela
                    </button>
                    <button
                      onClick={() => {
                        setImageTab('upload');
                        setImageModalOpen(true);
                      }}
                      className="flex items-center gap-1.5 p-2 hover:bg-white/10 rounded-lg transition text-slate-300 hover:text-amber-400 text-xs font-medium"
                      title="Inserir Imagem"
                    >
                      <ImageIcon size={14} /> Imagem
                    </button>
                    <button
                      onClick={openLinkModal}
                      className="flex items-center gap-1.5 p-2 hover:bg-white/10 rounded-lg transition text-slate-300 hover:text-amber-400 text-xs font-medium"
                      title="Inserir Link (Ctrl+K)"
                    >
                      <LinkIcon size={14} /> Link
                    </button>
                  </FloatingMenu>

                  {/* BubbleMenu de Seleção de Texto */}
                  <BubbleMenu editor={editor} shouldShow={(props: any) => {
                    return !props.editor.isActive('table') && !props.editor.isActive('image') && props.from !== props.to;
                  }} className="glass-panel bg-slate-900/90 backdrop-blur-2xl border border-white/15 shadow-2xl rounded-xl flex items-center p-1 gap-0.5 overflow-hidden z-50">
                    <button
                      onClick={handleAddComment}
                      className="p-2 hover:bg-white/10 rounded-lg transition text-slate-300 hover:text-amber-400"
                      title="Comentar"
                    >
                      <MessageSquarePlus size={16} />
                    </button>
                    <div className="w-px h-5 bg-white/10 mx-1"></div>
                    <button
                      onClick={() => editor.chain().focus().toggleBold().run()}
                      className={`p-2 hover:bg-white/10 rounded-lg transition ${editor.isActive('bold') ? 'text-amber-400 bg-amber-500/15' : 'text-slate-300'}`}
                      title="Negrito (Ctrl+B)"
                    >
                      <Bold size={15} />
                    </button>
                    <button
                      onClick={() => editor.chain().focus().toggleItalic().run()}
                      className={`p-2 hover:bg-white/10 rounded-lg transition ${editor.isActive('italic') ? 'text-amber-400 bg-amber-500/15' : 'text-slate-300'}`}
                      title="Itálico (Ctrl+I)"
                    >
                      <Italic size={15} />
                    </button>
                    <button
                      onClick={() => editor.chain().focus().toggleStrike().run()}
                      className={`p-2 hover:bg-white/10 rounded-lg transition ${editor.isActive('strike') ? 'text-amber-400 bg-amber-500/15' : 'text-slate-300'}`}
                      title="Tachado (Ctrl+Shift+X)"
                    >
                      <Strikethrough size={15} />
                    </button>
                    <button
                      onClick={() => editor.chain().focus().toggleCode().run()}
                      className={`p-2 hover:bg-white/10 rounded-lg transition ${editor.isActive('code') ? 'text-amber-400 bg-amber-500/15' : 'text-slate-300'}`}
                      title="Código (Ctrl+E)"
                    >
                      <Code size={15} />
                    </button>
                    <div className="w-px h-5 bg-white/10 mx-1"></div>
                    <button
                      onClick={openLinkModal}
                      className={`p-2 hover:bg-white/10 rounded-lg transition ${editor.isActive('link') ? 'text-amber-400 bg-amber-500/15' : 'text-slate-300 hover:text-amber-400'}`}
                      title="Inserir ou Editar Link (Ctrl+K)"
                    >
                      <LinkIcon size={15} />
                    </button>
                  </BubbleMenu>

                  {/* BubbleMenu de Link Ativo (quando clicado sem seleção de texto) */}
                  <BubbleMenu editor={editor} shouldShow={(props: any) => {
                    return props.editor.isActive('link') && !props.editor.isActive('table') && !props.editor.isActive('image') && props.from === props.to;
                  }} className="glass-panel bg-slate-900/95 backdrop-blur-2xl border border-white/15 shadow-2xl rounded-xl flex items-center p-1.5 gap-1 overflow-hidden z-50 max-w-sm">
                    <span
                      className="text-xs text-sky-400 truncate max-w-[160px] px-2 font-medium"
                      title={editor.getAttributes('link').href || ''}
                    >
                      {editor.getAttributes('link').href || 'Link'}
                    </span>
                    <div className="w-px h-4 bg-white/10 mx-0.5"></div>
                    <button
                      onClick={() => {
                        const href = editor.getAttributes('link').href;
                        if (href) window.open(href, '_blank', 'noopener,noreferrer');
                      }}
                      className="p-1.5 hover:bg-white/10 text-slate-300 hover:text-amber-400 rounded-lg transition"
                      title="Abrir link em nova aba"
                    >
                      <ExternalLink size={14} />
                    </button>
                    <button
                      onClick={handleCopyActiveLink}
                      className="p-1.5 hover:bg-white/10 text-slate-300 hover:text-amber-400 rounded-lg transition"
                      title="Copiar URL do link"
                    >
                      {copiedLink ? <Check size={14} className="text-emerald-400" /> : <Copy size={14} />}
                    </button>
                    <button
                      onClick={openLinkModal}
                      className="p-1.5 hover:bg-white/10 text-slate-300 hover:text-amber-400 rounded-lg transition"
                      title="Editar link"
                    >
                      <Pencil size={14} />
                    </button>
                    <button
                      onClick={() => {
                        editor.chain().focus().extendMarkRange('link').unsetLink().run();
                        setTimeout(() => flushSave(), 100);
                      }}
                      className="p-1.5 hover:bg-rose-500/20 text-rose-400 rounded-lg transition"
                      title="Remover link"
                    >
                      <Unlink size={14} />
                    </button>
                  </BubbleMenu>

                  <BubbleMenu editor={editor} shouldShow={(props: any) => props.editor.isActive('table')} className="glass-panel bg-slate-900/90 backdrop-blur-2xl border border-white/15 shadow-2xl rounded-xl flex flex-wrap max-w-xs overflow-hidden z-50 p-1.5 gap-1">
                    <button onClick={() => editor.chain().focus().addRowBefore().run()} className="p-1.5 hover:bg-white/10 text-slate-300 rounded-lg" title="Adicionar linha acima"><ArrowUp size={15}/></button>
                    <button onClick={() => editor.chain().focus().addRowAfter().run()} className="p-1.5 hover:bg-white/10 text-slate-300 rounded-lg" title="Adicionar linha abaixo"><ArrowDown size={15}/></button>
                    <button onClick={() => editor.chain().focus().deleteRow().run()} className="p-1.5 hover:bg-rose-500/15 text-rose-400 rounded-lg" title="Deletar linha"><Trash2 size={15}/></button>
                    <div className="w-px h-5 bg-white/10 mx-1 self-center"></div>
                    <button onClick={() => editor.chain().focus().addColumnBefore().run()} className="p-1.5 hover:bg-white/10 text-slate-300 rounded-lg" title="Adicionar coluna à esquerda"><ArrowLeft size={15}/></button>
                    <button onClick={() => editor.chain().focus().addColumnAfter().run()} className="p-1.5 hover:bg-white/10 text-slate-300 rounded-lg" title="Adicionar coluna à direita"><ArrowRight size={15}/></button>
                    <button onClick={() => editor.chain().focus().deleteColumn().run()} className="p-1.5 hover:bg-rose-500/15 text-rose-400 rounded-lg" title="Deletar coluna"><Trash2 size={15}/></button>
                    <div className="w-px h-5 bg-white/10 mx-1 self-center"></div>
                    <button onClick={() => editor.chain().focus().setTextAlign('left').run()} className={`p-1.5 hover:bg-white/10 rounded-lg ${editor.isActive({ textAlign: 'left' }) ? 'text-amber-400 bg-amber-500/15' : 'text-slate-300'}`} title="Alinhar à Esquerda"><AlignLeft size={15}/></button>
                    <button onClick={() => editor.chain().focus().setTextAlign('center').run()} className={`p-1.5 hover:bg-white/10 rounded-lg ${editor.isActive({ textAlign: 'center' }) ? 'text-amber-400 bg-amber-500/15' : 'text-slate-300'}`} title="Centralizar"><AlignCenter size={15}/></button>
                    <button onClick={() => editor.chain().focus().setTextAlign('right').run()} className={`p-1.5 hover:bg-white/10 rounded-lg ${editor.isActive({ textAlign: 'right' }) ? 'text-amber-400 bg-amber-500/15' : 'text-slate-300'}`} title="Alinhar à Direita"><AlignRight size={15}/></button>
                    <button onClick={() => editor.chain().focus().setTextAlign('justify').run()} className={`p-1.5 hover:bg-white/10 rounded-lg ${editor.isActive({ textAlign: 'justify' }) ? 'text-amber-400 bg-amber-500/15' : 'text-slate-300'}`} title="Justificar"><AlignJustify size={15}/></button>
                    <div className="w-px h-5 bg-white/10 mx-1 self-center"></div>
                    <button onClick={() => editor.chain().focus().deleteTable().run()} className="p-1.5 flex items-center gap-1 hover:bg-rose-500/20 text-rose-400 rounded-lg px-2 text-xs" title="Deletar Tabela"><Trash size={13}/> Tabela</button>
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
              editingCommentRectId={editingCommentRectId}
              setEditingCommentRectId={setEditingCommentRectId}
              onDeleteComment={handleDeleteComment}
              onClickComment={(page, commentId) => {
                if (page != null) {
                  setPdfPageNumber(page);
                } else if (activeNote.type !== 'pdf') {
                  const el = document.querySelector(`mark[data-comment-id="${commentId}"]`);
                  if (el) {
                    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                  }
                }
              }}
            />
          </div>
        )}

        {isStudyDrawerOpen && (
          <GuidedStudySidebar 
            onInsertIntoNote={handleInsertStudyContent} 
            onNavigateToSlide={handleNavigateToSlide}
          />
        )}
      </div>

      {/* Modal de Inserção de Imagem */}
      {imageModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/75 backdrop-blur-sm p-4"
          onClick={() => setImageModalOpen(false)}
        >
          <div
            className="glass-card w-full max-w-md rounded-2xl border border-white/15 p-6 shadow-2xl space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-400">
                  <ImageIcon size={16} />
                </div>
                <h3 className="text-sm font-bold text-slate-100">Inserir Imagem na Nota</h3>
              </div>
              <button
                onClick={() => setImageModalOpen(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-white/10 transition"
              >
                <X size={16} />
              </button>
            </div>

            <div className="flex rounded-xl bg-slate-900/80 p-1 border border-white/10 text-xs">
              <button
                type="button"
                onClick={() => setImageTab('upload')}
                className={`flex-1 py-2 rounded-lg font-medium transition ${
                  imageTab === 'upload'
                    ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Enviar do Computador
              </button>
              <button
                type="button"
                onClick={() => setImageTab('url')}
                className={`flex-1 py-2 rounded-lg font-medium transition ${
                  imageTab === 'url'
                    ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Por URL Externa
              </button>
            </div>

            {imageTab === 'upload' ? (
              <div className="space-y-3">
                <div
                  onClick={() => fileInputRef.current?.click()}
                  className="border-2 border-dashed border-white/15 hover:border-amber-400/50 rounded-2xl p-6 text-center cursor-pointer transition bg-white/[0.02] hover:bg-amber-500/5"
                >
                  {isUploadingImage ? (
                    <div className="flex flex-col items-center gap-2 py-2">
                      <Loader2 size={24} className="animate-spin text-amber-400" />
                      <span className="text-xs text-amber-300 font-medium">
                        Criptografando e enviando imagem...
                      </span>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center gap-2">
                      <Upload size={24} className="text-amber-400" />
                      <span className="text-xs font-semibold text-slate-200">
                        Clique para selecionar uma imagem
                      </span>
                      <span className="text-[11px] text-slate-400">
                        PNG, JPG, WEBP ou GIF (ou cole direto com Ctrl+V / arraste no editor)
                      </span>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <form onSubmit={handleInsertImageByUrl} className="space-y-3">
                <div>
                  <label className="block text-xs text-slate-300 mb-1 font-medium">
                    URL da Imagem
                  </label>
                  <input
                    type="url"
                    required
                    value={imageUrlInput}
                    onChange={(e) => setImageUrlInput(e.target.value)}
                    placeholder="https://exemplo.com/imagem.png"
                    className="w-full glass-input text-xs text-slate-100 px-3.5 py-2.5 rounded-xl"
                    autoFocus
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-300 mb-1 font-medium">
                    Descrição / Texto Alternativo (opcional)
                  </label>
                  <input
                    type="text"
                    value={imageAltInput}
                    onChange={(e) => setImageAltInput(e.target.value)}
                    placeholder="Ex: Diagrama de arquitetura"
                    className="w-full glass-input text-xs text-slate-100 px-3.5 py-2.5 rounded-xl"
                  />
                </div>
                <div className="flex justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setImageModalOpen(false)}
                    className="glass-btn-ghost px-4 py-2 rounded-xl text-xs"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    className="glass-btn-gold px-4 py-2 rounded-xl text-xs font-semibold"
                  >
                    Inserir Imagem
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {/* Modal de Inserção / Edição de Link */}
      {linkModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/75 backdrop-blur-sm p-4"
          onClick={() => setLinkModalOpen(false)}
        >
          <div
            className="glass-card w-full max-w-md rounded-2xl border border-white/15 p-6 shadow-2xl space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-400">
                  <LinkIcon size={16} />
                </div>
                <h3 className="text-sm font-bold text-slate-100">
                  {isEditingExistingLink ? 'Editar Link' : 'Inserir Link'}
                </h3>
              </div>
              <button
                onClick={() => setLinkModalOpen(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-white/10 transition"
              >
                <X size={16} />
              </button>
            </div>

            <form onSubmit={handleSaveLink} className="space-y-3">
              <div>
                <label className="block text-xs text-slate-300 mb-1 font-medium">
                  Texto de Exibição
                </label>
                <input
                  type="text"
                  value={linkTextInput}
                  onChange={(e) => setLinkTextInput(e.target.value)}
                  placeholder="Texto que aparecerá na nota (opcional)"
                  className="w-full glass-input text-xs text-slate-100 px-3.5 py-2.5 rounded-xl"
                />
              </div>
              <div>
                <label className="block text-xs text-slate-300 mb-1 font-medium">
                  URL de Destino
                </label>
                <input
                  type="text"
                  required
                  value={linkUrlInput}
                  onChange={(e) => setLinkUrlInput(e.target.value)}
                  placeholder="https://exemplo.com"
                  className="w-full glass-input text-xs text-slate-100 px-3.5 py-2.5 rounded-xl"
                  autoFocus
                />
              </div>
              <div className="flex justify-between items-center pt-2">
                {isEditingExistingLink ? (
                  <button
                    type="button"
                    onClick={() => {
                      editor?.chain().focus().extendMarkRange('link').unsetLink().run();
                      setLinkModalOpen(false);
                      setTimeout(() => flushSave(), 100);
                    }}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs text-rose-400 hover:bg-rose-500/15 transition"
                  >
                    <Unlink size={13} /> Remover Link
                  </button>
                ) : (
                  <div />
                )}
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setLinkModalOpen(false)}
                    className="glass-btn-ghost px-4 py-2 rounded-xl text-xs"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    className="glass-btn-gold px-4 py-2 rounded-xl text-xs font-semibold"
                  >
                    Salvar Link
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      <PasswordModal
        isOpen={passwordModalOpen}
        onClose={() => setPasswordModalOpen(false)}
        mode={passwordModalMode}
        itemType="Nota"
        itemName={activeNote?.title || ''}
        onSubmit={handlePasswordModalSubmit}
      />
    </div>
  );

};
