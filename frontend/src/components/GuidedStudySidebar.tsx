import React, { useState, useEffect, useRef } from 'react';
import { 
  GraduationCap, Sparkles, X, ChevronRight, ChevronDown, CheckCircle2, 
  Unlock, Lightbulb, Send, Loader2, Plus, 
  FileText, Upload, Trash2, Brain, FileDown, 
  Maximize2, Minimize2, Compass, Layers, Check, AlertCircle,
  ExternalLink, Palette, RotateCw, CheckSquare, Square, BookOpen,
  FastForward, Hand, CheckCheck, HelpCircle
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import 'katex/dist/katex.min.css';

import { useGuidedStudyStore } from '../store/useGuidedStudyStore';
import { useNotesStore } from '../store/useNotesStore';
import type { GuidedStudyMessage, GuidedStudyDoubtThread } from '../types';
import { MermaidDiagram, sanitizeMermaidCode } from './MermaidDiagram';

interface GuidedStudySidebarProps {
  onInsertIntoNote?: (markdownContent: string) => void;
  onNavigateToSlide?: (noteIdOrTitle: number | string, pageNumber?: number) => void;
}

export const GuidedStudySidebar: React.FC<GuidedStudySidebarProps> = ({ 
  onInsertIntoNote, 
  onNavigateToSlide 
}) => {
  const { 
    isOpen, closeDrawer, activeSession, sessions, 
    isLoadingSessions, isInitializingSession, isSendingTurn, 
    isExtractingFile, error, fetchSessions, loadSession, 
    createSession, sendTurn, extractFile, crystallizeSynapse, 
    deleteSession, clearActiveSession, rebuildRoadmap, jumpToStep, generateVisual,
    raiseHand, resolveDoubt, isAskingDoubt, raisingHandForMessageId
  } = useGuidedStudyStore();

  const { activeWorkspaceId, activeNotebookId, activeNoteId, notes } = useNotesStore();

  // Local state for Session Builder
  const [showBuilder, setShowBuilder] = useState(false);
  const [sessionTitle, setSessionTitle] = useState('');
  const [selectedNoteIds, setSelectedNoteIds] = useState<number[]>([]);
  const [rawText, setRawText] = useState('');
  const [depthPersona, setDepthPersona] = useState('Cientista da Computação');
  const [surfacePace, setSurfacePace] = useState<'fast' | 'standard' | 'detailed'>('standard');
  const [autoCreateSynapses, setAutoCreateSynapses] = useState(true);
  const [extractedSources, setExtractedSources] = useState<{ filename: string; charCount: number }[]>([]);

  // Input & dialogue state
  const [studentInput, setStudentInput] = useState('');
  const [showRoadmap, setShowRoadmap] = useState(false);
  const [showBigInsight, setShowBigInsight] = useState(false);
  const [isExpandedWidth, setIsExpandedWidth] = useState(false);
  const [insertedMessageIds, setInsertedMessageIds] = useState<Record<string, boolean>>({});
  const [generatingVisualForMsgId, setGeneratingVisualForMsgId] = useState<string | null>(null);

  // Levantar a mão / Dúvidas de Sala de Aula state
  const [openDoubtDrawerMsgId, setOpenDoubtDrawerMsgId] = useState<string | null>(null);
  const [newDoubtInputByMsgId, setNewDoubtInputByMsgId] = useState<Record<string, string>>({});
  const [threadReplyInputs, setThreadReplyInputs] = useState<Record<string, string>>({});
  const [insertedThreadIds, setInsertedThreadIds] = useState<Record<string, boolean>>({});

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Load sessions list on mount or when notebook changes
  useEffect(() => {
    fetchSessions(activeWorkspaceId, activeNotebookId);
  }, [activeWorkspaceId, activeNotebookId]);

  // Scroll to bottom when new messages arrive
  useEffect(() => {
    if (activeSession?.messages?.length) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [activeSession?.messages?.length, isSendingTurn]);

  // Set default selected note when creating session
  useEffect(() => {
    if (activeNoteId && selectedNoteIds.length === 0) {
      setSelectedNoteIds([activeNoteId]);
      const currentNote = notes.find((n) => n.id === activeNoteId);
      if (currentNote && !sessionTitle) {
        setSessionTitle(`Estudo: ${currentNote.title}`);
      }
    }
  }, [activeNoteId, notes]);

  const handleCreateSessionSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!sessionTitle.trim()) return;

    const res = await createSession({
      title: sessionTitle.trim(),
      workspaceId: activeWorkspaceId,
      notebookId: activeNotebookId,
      targetNoteId: activeNoteId,
      sourceNoteIds: selectedNoteIds,
      rawText: rawText.trim() || undefined,
      depthPersona: depthPersona.trim() || 'Cientista da Computação',
      surfacePace,
      autoCreateSynapses
    });

    if (res) {
      setShowBuilder(false);
      setSessionTitle('');
      setRawText('');
      setExtractedSources([]);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const extracted = await extractFile(file);
    if (extracted) {
      setRawText((prev) => 
        prev ? `${prev}\n\n=== [Arquivo Anexo: ${extracted.filename}] ===\n${extracted.extracted_text}` : `=== [Arquivo Anexo: ${extracted.filename}] ===\n${extracted.extracted_text}`
      );
      setExtractedSources((prev) => [...prev, { filename: extracted.filename, charCount: extracted.char_count }]);
      if (!sessionTitle) {
        setSessionTitle(`Estudo: ${file.name.replace(/\.[^/.]+$/, '')}`);
      }
    }
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleSendResponse = async (action: 'answer' | 'ask_hint' | 'advance_phase' = 'answer') => {
    if (action === 'answer' && !studentInput.trim()) return;

    const msgToSend = action === 'ask_hint' 
      ? (studentInput.trim() || 'Poderia me dar uma pista ou analogia intuitiva sobre essa pergunta?') 
      : action === 'advance_phase'
      ? 'Gostaria de avançar para a Fase de Profundeza e compreender os tópicos com rigor de Cientista da Computação.'
      : studentInput.trim();

    setStudentInput('');
    await sendTurn(msgToSend, action, autoCreateSynapses);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendResponse('answer');
    }
  };

  const handleInsertSnippet = (msg: GuidedStudyMessage) => {
    if (!onInsertIntoNote) return;

    const topicTitle = activeSession?.roadmap?.find((t) => t.id === msg.topic_id)?.title || 'Conceito';
    const phaseLabel = msg.phase === 'surface' ? 'Superfície' : 'Profundeza';
    
    let snippet = `\n\n### 🧠 Sinapse: ${topicTitle} (${phaseLabel})\n`;
    if (msg.slide_reference) {
      snippet += `> **Slide de Referência:** ${msg.slide_reference.source_title || 'Material'} (Pág. ${msg.slide_reference.page_number || '?'})\n\n`;
    }
    if (msg.contextualization) {
      snippet += `> **Contextualização:** ${msg.contextualization}\n\n`;
    }
    if (msg.explanation) {
      snippet += `${msg.explanation}\n\n`;
    }
    if (msg.diagram_mermaid) {
      const cleanMermaid = sanitizeMermaidCode(msg.diagram_mermaid);
      snippet += `\`\`\`mermaid\n${cleanMermaid}\n\`\`\`\n\n`;
    }
    if (msg.step_by_step_example) {
      snippet += `**Exemplo Passo a Passo:**\n${msg.step_by_step_example}\n\n`;
    }
    if (msg.question) {
      snippet += `* **Pergunta Socrática:** ${msg.question}\n`;
    }
    if (msg.student_synthesis) {
      snippet += `* **Síntese Validada:** ${msg.student_synthesis}\n`;
    }

    onInsertIntoNote(snippet);
    setInsertedMessageIds((prev) => ({ ...prev, [msg.id]: true }));
  };

  const handleRebuildRoadmapClick = async (pace?: 'fast' | 'standard' | 'detailed') => {
    if (!activeSession) return;
    const selectedPace = pace || activeSession.surface_pace || 'standard';
    const paceDesc = selectedPace === 'fast' ? 'Expresso (1-2 blocos essenciais por capítulo)' : selectedPace === 'detailed' ? 'Detalhado (4-6 micro-blocos por capítulo)' : 'Padrão (2-3 blocos por capítulo)';
    if (confirm(`Deseja reconstruir a trilha socrática com 100% de cobertura de todas as fontes no ritmo "${paceDesc}"? Isso reorganizará os passos com referências exatas aos PDFs.`)) {
      await rebuildRoadmap(activeSession.id, selectedPace);
    }
  };

  const handleGenerateVisualClick = async (messageId: string) => {
    if (!activeSession) return;
    setGeneratingVisualForMsgId(messageId);
    await generateVisual(activeSession.id, messageId);
    setGeneratingVisualForMsgId(null);
  };

  const handleInsertDoubtSnippet = (thread: GuidedStudyDoubtThread) => {
    if (!onInsertIntoNote) return;

    const firstUserMsg = thread.messages.find((m) => m.role === 'user');
    const teacherMsgs = thread.messages.filter((m) => m.role === 'assistant');
    const lastTeacherMsg = teacherMsgs[teacherMsgs.length - 1];

    const questionText = firstUserMsg?.content || thread.title || 'Dúvida';
    const answerText = lastTeacherMsg?.content || 'Explicação do professor';
    const slideRef = lastTeacherMsg?.slide_reference || firstUserMsg?.slide_reference;

    let snippet = `\n\n> 💡 **Dúvida de Sala de Aula:** *"${questionText.trim()}"*\n`;
    if (slideRef) {
      snippet += `> *Referência:* ${slideRef.source_title || 'Material'}${slideRef.page_number ? ` (Pág. ${slideRef.page_number})` : ''}\n`;
    }
    snippet += `>\n`;
    
    for (const line of answerText.split('\n')) {
      snippet += `> ${line}\n`;
    }

    if (lastTeacherMsg?.diagram_mermaid) {
      const cleanMermaid = sanitizeMermaidCode(lastTeacherMsg.diagram_mermaid);
      snippet += `\n\`\`\`mermaid\n${cleanMermaid}\n\`\`\`\n`;
    }
    snippet += `\n`;

    onInsertIntoNote(snippet);
    setInsertedThreadIds((prev) => ({ ...prev, [thread.id]: true }));
  };

  const handleSendRaiseHand = async (parentMsgId: string, threadId?: string) => {
    const text = threadId ? threadReplyInputs[threadId]?.trim() : newDoubtInputByMsgId[parentMsgId]?.trim();
    if (!text) return;

    if (threadId) {
      setThreadReplyInputs((prev) => ({ ...prev, [threadId]: '' }));
    } else {
      setNewDoubtInputByMsgId((prev) => ({ ...prev, [parentMsgId]: '' }));
    }

    await raiseHand(parentMsgId, text, threadId);
  };

  const handleResolveDoubtThread = async (parentMsgId: string, threadId: string) => {
    await resolveDoubt(parentMsgId, threadId);
  };

  const handleRaiseHandBottomClick = () => {
    const assistantMsgs = activeSession?.messages?.filter((m) => m.role === 'assistant') || [];
    if (assistantMsgs.length === 0) return;
    const lastAssistant = assistantMsgs[assistantMsgs.length - 1];
    setOpenDoubtDrawerMsgId(lastAssistant.id);

    setTimeout(() => {
      const el = document.getElementById(`msg-${lastAssistant.id}`);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }
    }, 50);
  };

  if (!isOpen) return null;

  // Obter tópico atual e micro-conceito atual
  const currentTopic = activeSession?.roadmap?.[activeSession?.current_topic_index || 0];
  const subconcepts = currentTopic?.subconcepts || [];
  const currentSubIdx = currentTopic?.current_subconcept_index || 0;
  const currentSub = subconcepts[currentSubIdx];

  // Helper para linkar referências de página como [Pág. 3], [Pág. 17-18], (Pág. 5) no corpo do texto
  const linkifyPages = (text: string) => {
    if (!text) return '';
    return text
      .replace(/\[Págs?\.?\s*(\d+)(?:\s*[-–]\s*(\d+))?\]/gi, (m, p1) => `[${m.slice(1, -1)}](#slide-page-${p1})`)
      .replace(/\((Págs?\.?\s*(\d+)(?:\s*[-–]\s*(\d+))?)\)/gi, (_m, full, p1) => `([${full}](#slide-page-${p1}))`);
  };

  // Helper para resolver dinamicamente o Note do PDF real correspondente
  const resolveTargetPdf = (sourceTitle?: string | null, sourceNoteId?: number | null) => {
    if (sourceNoteId) {
      const byId = notes.find((n) => n.id === sourceNoteId);
      if (byId && byId.type === 'pdf') return byId;
    }
    if (sourceTitle) {
      const clean = sourceTitle.trim().toLowerCase();
      const byExact = notes.find((n) => n.type === 'pdf' && n.title.trim().toLowerCase() === clean);
      if (byExact) return byExact;
      const byContains = notes.find((n) => n.type === 'pdf' && (
        n.title.toLowerCase().includes(clean) || clean.includes(n.title.toLowerCase())
      ));
      if (byContains) return byContains;
      const byFileUrl = notes.find((n) => n.type === 'pdf' && n.file_url && n.file_url.toLowerCase().includes(clean));
      if (byFileUrl) return byFileUrl;
    }
    // Qualquer PDF do caderno ativo ou do sistema
    return notes.find((n) => n.type === 'pdf' && n.notebook_id === activeNotebookId)
      || notes.find((n) => n.type === 'pdf')
      || null;
  };

  const handleNavigateToSlideInternal = (pageNum: number, msg?: GuidedStudyMessage) => {
    if (!onNavigateToSlide) return;
    const title = msg?.slide_reference?.source_title || currentSub?.source_title || currentTopic?.title || '01.pdf';
    const noteId = msg?.slide_reference?.note_id || currentSub?.source_note_id;
    const target = resolveTargetPdf(title, noteId);
    if (target) {
      onNavigateToSlide(target.id, pageNum);
    } else if (title) {
      onNavigateToSlide(title, pageNum);
    }
  };

  // Auto-navega para o slide no visualizador quando uma nova mensagem com slide_reference chega
  useEffect(() => {
    if (activeSession?.messages?.length && onNavigateToSlide) {
      const lastMsg = activeSession.messages[activeSession.messages.length - 1];
      if (lastMsg.role === 'assistant' && (lastMsg.slide_reference?.page_number || lastMsg.slide_reference?.source_title)) {
        handleNavigateToSlideInternal(lastMsg.slide_reference.page_number || 1, lastMsg);
      }
    }
  }, [activeSession?.messages?.length]);

  const renderMarkdownWithPageChips = (rawMarkdown: string, msg: GuidedStudyMessage) => {
    const linkedText = linkifyPages(rawMarkdown);
    return (
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[rehypeKatex]}
        components={{
          a: ({ href, children, ...props }) => {
            if (href && href.startsWith('#slide-page-')) {
              const pageNum = parseInt(href.replace('#slide-page-', ''), 10);
              return (
                <button
                  type="button"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    handleNavigateToSlideInternal(pageNum, msg);
                  }}
                  className="inline-flex items-center gap-1 mx-1 px-2 py-0.5 rounded-lg bg-gradient-to-r from-purple-500/25 to-amber-500/20 hover:from-purple-500/40 hover:to-amber-500/35 border border-purple-400/50 text-purple-200 hover:text-white font-mono text-[11px] font-bold shadow-md transition-all cursor-pointer transform hover:scale-105 active:scale-95 no-underline align-middle"
                  title={`Abrir slide na página ${pageNum} no visualizador à esquerda`}
                >
                  <BookOpen size={11} className="text-amber-400 shrink-0" />
                  <span>{children}</span>
                  <ExternalLink size={9} className="text-purple-300 opacity-70 shrink-0" />
                </button>
              );
            }
            return (
              <a href={href} target="_blank" rel="noopener noreferrer" className="text-amber-400 underline hover:text-amber-300" {...props}>
                {children}
              </a>
            );
          }
        }}
      >
        {linkedText}
      </ReactMarkdown>
    );
  };

  return (
    <div 
      className={`h-full border-l border-white/10 glass-panel-subtle flex flex-col z-30 transition-all duration-300 relative shadow-2xl backdrop-blur-3xl overflow-hidden ${
        isExpandedWidth ? 'w-[620px] sm:w-[740px]' : 'w-[440px] sm:w-[500px]'
      }`}
    >
      {/* Top Header */}
      <div className="px-4 py-3 border-b border-white/10 flex items-center justify-between shrink-0 bg-slate-900/40">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-amber-400/20 to-purple-500/20 border border-amber-400/30 flex items-center justify-center text-amber-300 shadow-md">
            <GraduationCap size={17} />
          </div>
          <div className="flex flex-col">
            <div className="flex items-center gap-2">
              <span className="font-extrabold text-sm text-slate-100 tracking-tight">
                Estudo Guiado
              </span>
              {activeSession && (
                <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full border ${
                  activeSession.current_phase === 'depth'
                    ? 'bg-purple-500/20 text-purple-300 border-purple-500/30 shadow-[0_0_10px_rgba(168,85,247,0.2)]'
                    : 'bg-amber-500/20 text-amber-300 border-amber-500/30'
                }`}>
                  {activeSession.current_phase === 'depth' ? 'Fase: Profundeza' : 'Fase: Superfície'}
                </span>
              )}
            </div>
            <span className="text-[11px] text-slate-400 line-clamp-1">
              {activeSession ? activeSession.title : 'Mentor Socrático em Duas Bases'}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-1 text-slate-400">
          <button
            onClick={() => setIsExpandedWidth(!isExpandedWidth)}
            className="p-1.5 hover:text-slate-200 hover:bg-white/10 rounded-lg transition"
            title={isExpandedWidth ? 'Largura Padrão' : 'Expandir Painel'}
          >
            {isExpandedWidth ? <Minimize2 size={15} /> : <Maximize2 size={15} />}
          </button>
          <button
            onClick={closeDrawer}
            className="p-1.5 hover:text-slate-200 hover:bg-white/10 rounded-lg transition"
            title="Fechar Painel de Estudo"
          >
            <X size={16} />
          </button>
        </div>
      </div>

      {/* Error Alert */}
      {error && (
        <div className="mx-4 mt-3 p-2.5 rounded-xl bg-rose-500/15 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-2 shrink-0 animate-in fade-in duration-200">
          <AlertCircle size={14} className="shrink-0 text-rose-400" />
          <span className="flex-1 leading-snug">{error}</span>
        </div>
      )}

      {/* Main Container: Builder Mode or Active Session Mode */}
      {!activeSession || showBuilder ? (
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          <div className="flex items-center justify-between pb-2 border-b border-white/10">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-300 flex items-center gap-1.5">
              <Sparkles size={13} className="text-amber-400" />
              <span>{showBuilder ? 'Configurar Novo Estudo' : 'Sessões de Estudo'}</span>
            </span>

            {showBuilder ? (
              <button
                type="button"
                onClick={() => setShowBuilder(false)}
                className="text-xs text-slate-400 hover:text-slate-200 underline"
              >
                Ver Sessões Anteriores
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setShowBuilder(true)}
                className="glass-btn-gold px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 shadow-md"
              >
                <Plus size={13} />
                <span>Novo Estudo</span>
              </button>
            )}
          </div>

          {/* Builder Form */}
          {showBuilder ? (
            <form onSubmit={handleCreateSessionSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  Título da Sessão de Estudo
                </label>
                <input
                  type="text"
                  required
                  value={sessionTitle}
                  onChange={(e) => setSessionTitle(e.target.value)}
                  placeholder="Ex: Teoria da Computação, Autômatos e Model Checking"
                  className="w-full glass-input text-xs text-slate-100 px-3.5 py-2.5 rounded-xl"
                  autoFocus
                />
              </div>

              {/* Source Selection from Notes */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-semibold text-slate-300 flex items-center gap-1">
                    <FileText size={13} className="text-amber-400" />
                    <span>Notas e PDFs do Caderno ({selectedNoteIds.length} selecionados)</span>
                  </label>
                  {notes.length > 0 && (
                    <button
                      type="button"
                      onClick={() => {
                        if (selectedNoteIds.length === notes.length) {
                          setSelectedNoteIds([]);
                        } else {
                          setSelectedNoteIds(notes.map((n) => n.id));
                        }
                      }}
                      className="text-[11px] text-amber-300 hover:underline"
                    >
                      {selectedNoteIds.length === notes.length ? 'Desmarcar Todas' : 'Selecionar Todo o Caderno'}
                    </button>
                  )}
                </div>

                <div className="max-h-44 overflow-y-auto space-y-1 p-2 rounded-xl bg-slate-900/60 border border-white/10 text-xs">
                  {notes.length === 0 ? (
                    <div className="text-center py-4 text-slate-500 text-[11px]">
                      Nenhuma nota encontrada neste caderno.
                    </div>
                  ) : (
                    notes.map((note) => {
                      const isChecked = selectedNoteIds.includes(note.id);
                      return (
                        <label
                          key={note.id}
                          className={`flex items-center gap-2.5 p-2 rounded-lg cursor-pointer transition ${
                            isChecked
                              ? 'bg-amber-500/15 border border-amber-500/30 text-amber-200'
                              : 'hover:bg-white/[0.04] text-slate-300'
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setSelectedNoteIds((prev) => [...prev, note.id]);
                              } else {
                                setSelectedNoteIds((prev) => prev.filter((id) => id !== note.id));
                              }
                            }}
                            className="rounded border-white/20 text-amber-500 focus:ring-0 bg-slate-800"
                          />
                          <span className="truncate flex-1 font-medium">{note.title}</span>
                          <span className="text-[10px] text-slate-500 uppercase">{note.type || 'md'}</span>
                        </label>
                      );
                    })
                  )}
                </div>
              </div>

              {/* Direct File Upload & Extraction */}
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5 flex items-center justify-between">
                  <span>Anexar Arquivo Avulso (PDF, TXT, MD)</span>
                  {isExtractingFile && (
                    <span className="text-[11px] text-amber-400 flex items-center gap-1">
                      <Loader2 size={11} className="animate-spin" /> Extraindo texto e páginas...
                    </span>
                  )}
                </label>
                <div 
                  onClick={() => fileInputRef.current?.click()}
                  className="border-2 border-dashed border-white/15 hover:border-amber-400/40 p-3 rounded-xl text-center cursor-pointer transition bg-white/[0.02] hover:bg-amber-500/5"
                >
                  <Upload size={16} className="mx-auto text-amber-400 mb-1" />
                  <span className="text-xs text-slate-300 block font-medium">
                    Clique para enviar PDF ou arquivo de texto
                  </span>
                  <span className="text-[10px] text-slate-500">
                    O texto de cada página será extraído e demarcado no estudo
                  </span>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".pdf,.txt,.md"
                    onChange={handleFileUpload}
                    className="hidden"
                  />
                </div>

                {extractedSources.length > 0 && (
                  <div className="mt-2 space-y-1">
                    {extractedSources.map((src, i) => (
                      <div key={i} className="text-[11px] text-emerald-300 bg-emerald-500/10 border border-emerald-500/20 px-2.5 py-1 rounded-lg flex items-center justify-between">
                        <span className="truncate">{src.filename}</span>
                        <span className="font-mono text-[10px]">{(src.charCount / 1000).toFixed(1)}k chars</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Raw Text Input */}
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  Ou Cole o Conteúdo / Ementa a Ser Aprendida
                </label>
                <textarea
                  rows={3}
                  value={rawText}
                  onChange={(e) => setRawText(e.target.value)}
                  placeholder="Cole aqui capítulos de livros, apostilas, códigos ou tópicos..."
                  className="w-full glass-input text-xs text-slate-100 p-3 rounded-xl font-mono leading-relaxed"
                />
              </div>

              {/* Rigor Persona Configuration */}
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Rigor da Fase de Profundeza (Persona)
                </label>
                <input
                  type="text"
                  value={depthPersona}
                  onChange={(e) => setDepthPersona(e.target.value)}
                  placeholder="Ex: Cientista da Computação"
                  className="w-full glass-input text-xs text-slate-100 px-3 py-2 rounded-xl"
                />
                <span className="text-[10px] text-slate-500 mt-1 block">
                  Padrão: Cientista da Computação (foco em invariantes, mecânica sob o capô, trade-offs e fundamentos).
                </span>
              </div>

              {/* Surface Pace Selector */}
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5 flex items-center justify-between">
                  <span>Ritmo da Fase de Superfície</span>
                  <span className="text-[10px] text-amber-400 font-mono">
                    {surfacePace === 'fast' ? '⚡ 1-2 blocos/capítulo' : surfacePace === 'detailed' ? '🔬 4-6 blocos/capítulo' : '⚖️ 2-3 blocos/capítulo'}
                  </span>
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {(['fast', 'standard', 'detailed'] as const).map((p) => (
                    <button
                      type="button"
                      key={p}
                      onClick={() => setSurfacePace(p)}
                      className={`p-2.5 rounded-xl text-xs font-medium border text-center transition ${
                        surfacePace === p
                          ? 'bg-amber-500/20 border-amber-400/50 text-amber-200 shadow-md ring-1 ring-amber-400/40'
                          : 'bg-white/[0.02] border-white/10 text-slate-400 hover:text-slate-200 hover:border-white/20'
                      }`}
                    >
                      <span className="block font-bold text-[11px]">
                        {p === 'fast' ? '⚡ Expresso' : p === 'detailed' ? '🔬 Detalhado' : '⚖️ Padrão'}
                      </span>
                      <span className="text-[9px] text-slate-400 block mt-0.5">
                        {p === 'fast' ? 'Panorâmico' : p === 'detailed' ? 'Passo a passo' : 'Equilibrado'}
                      </span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Toggle Auto Synapses */}
              <div className="flex items-center gap-2.5 pt-1">
                <input
                  type="checkbox"
                  id="autoSynapseToggle"
                  checked={autoCreateSynapses}
                  onChange={(e) => setAutoCreateSynapses(e.target.checked)}
                  className="rounded border-white/20 text-amber-500 focus:ring-0 bg-slate-800"
                />
                <label htmlFor="autoSynapseToggle" className="text-xs text-slate-300 font-medium cursor-pointer">
                  Construir nós e conexões sinápticas automaticamente no Mapa Mental
                </label>
              </div>

              {/* Submit CTA */}
              <div className="pt-2">
                <button
                  type="submit"
                  disabled={isInitializingSession || (!selectedNoteIds.length && !rawText.trim())}
                  className="w-full glass-btn-gold py-3 rounded-xl text-xs font-bold flex items-center justify-center gap-2 shadow-xl disabled:opacity-50"
                >
                  {isInitializingSession ? (
                    <>
                      <Loader2 size={15} className="animate-spin text-amber-400" />
                      <span>Indexando Slides & Mapeando Micro-Conceitos...</span>
                    </>
                  ) : (
                    <>
                      <Brain size={15} className="text-amber-400" />
                      <span>Iniciar Estudo Guiado</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          ) : (
            /* Sessions List */
            <div className="space-y-2.5">
              {isLoadingSessions ? (
                <div className="text-center py-12 text-slate-400 text-xs flex flex-col items-center gap-2">
                  <Loader2 size={20} className="animate-spin text-amber-400" />
                  <span>Carregando sessões...</span>
                </div>
              ) : sessions.length === 0 ? (
                <div className="glass-card p-6 rounded-2xl text-center border border-white/10 space-y-3">
                  <div className="w-12 h-12 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center mx-auto text-amber-400">
                    <GraduationCap size={24} />
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-slate-200">Nenhuma sessão ativa</h4>
                    <p className="text-xs text-slate-400 mt-1">
                      Carregue seus slides e materiais. A IA ensinará micro-conceito por micro-conceito, abrindo os slides na tela e ilustrando com diagramas!
                    </p>
                  </div>
                  <button
                    onClick={() => setShowBuilder(true)}
                    className="glass-btn-gold px-4 py-2 rounded-xl text-xs font-semibold shadow-md inline-flex items-center gap-1.5"
                  >
                    <Plus size={14} /> Começar Primeiro Estudo
                  </button>
                </div>
              ) : (
                sessions.map((sess) => (
                  <div
                    key={sess.id}
                    onClick={() => loadSession(sess.id)}
                    className="glass-card p-3.5 rounded-2xl border border-white/10 hover:border-amber-400/40 transition-all cursor-pointer group space-y-2"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex flex-col">
                        <span className="font-semibold text-xs text-slate-100 group-hover:text-amber-300 transition-colors line-clamp-1">
                          {sess.title}
                        </span>
                        <span className="text-[10px] text-slate-400">
                          {sess.total_topics} tópicos • Rigor: {sess.depth_persona}
                        </span>
                      </div>
                      <span className={`text-[9px] font-bold uppercase px-2 py-0.5 rounded-full ${
                        sess.current_phase === 'depth'
                          ? 'bg-purple-500/20 text-purple-300 border border-purple-500/30'
                          : 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                      }`}>
                        {sess.current_phase === 'depth' ? 'Profundeza' : 'Superfície'}
                      </span>
                    </div>

                    {/* Progress Bar */}
                    <div className="space-y-1">
                      <div className="flex justify-between text-[10px] text-slate-500">
                        <span>Progresso Superfície</span>
                        <span>{sess.validated_surface_topics} / {sess.total_topics} validados</span>
                      </div>
                      <div className="w-full bg-slate-900 rounded-full h-1.5 overflow-hidden border border-white/5">
                        <div 
                          className="bg-amber-400 h-full transition-all duration-300"
                          style={{ width: `${sess.total_topics ? (sess.validated_surface_topics / sess.total_topics) * 100 : 0}%` }}
                        />
                      </div>
                    </div>

                    <div className="flex items-center justify-between pt-1 text-[10px] text-slate-500">
                      <span>{new Date(sess.updated_at).toLocaleDateString()}</span>
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            if (confirm(`Deseja excluir a sessão de estudo "${sess.title}"?`)) {
                              deleteSession(sess.id);
                            }
                          }}
                          className="p-1 text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 rounded transition"
                          title="Excluir Sessão"
                        >
                          <Trash2 size={12} />
                        </button>
                        <span className="text-amber-400 flex items-center gap-0.5 font-semibold">
                          Continuar <ChevronRight size={12} />
                        </span>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      ) : (
        /* Active Study Session Mode */
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Active Topic & Micro-concept Bar */}
          <div className="px-4 py-2 bg-slate-900/80 border-b border-white/10 shrink-0 space-y-1.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setShowRoadmap(!showRoadmap)}
                  className="flex items-center gap-1.5 text-xs font-semibold text-slate-200 hover:text-amber-300 transition"
                >
                  <Layers size={13} className="text-amber-400" />
                  <span>Trilha de Raciocínio ({activeSession.roadmap.length} tópicos)</span>
                  {showRoadmap ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                </button>
              </div>

              <div className="flex items-center gap-1.5">
                {activeSession.big_insight && (
                  <button
                    onClick={() => setShowBigInsight(!showBigInsight)}
                    className="p-1 rounded-lg text-xs font-medium text-purple-300 bg-purple-500/15 border border-purple-500/30 hover:bg-purple-500/25 transition flex items-center gap-1"
                    title="A Grande Sacada do Material"
                  >
                    <Compass size={12} />
                    <span className="text-[10px]">A Grande Sacada</span>
                  </button>
                )}
                <button
                  onClick={() => handleRebuildRoadmapClick()}
                  disabled={isInitializingSession}
                  className="p-1 text-[10px] text-amber-300 bg-amber-500/10 border border-amber-500/20 hover:bg-amber-500/20 rounded transition flex items-center gap-1"
                  title="Reconstruir trilha profunda indexando todos os slides e micro-conceitos com 100% de cobertura"
                >
                  <RotateCw size={11} className={isInitializingSession ? 'animate-spin' : ''} />
                  <span className="hidden sm:inline">Reconstruir Trilha</span>
                </button>
                <button
                  onClick={clearActiveSession}
                  className="text-[10px] text-slate-400 hover:text-slate-200 px-2 py-0.5 rounded bg-white/5 hover:bg-white/10 transition"
                  title="Trocar de Sessão"
                >
                  Sessões
                </button>
              </div>
            </div>

            {/* Checklist de Micro-conceitos do Tópico Ativo */}
            {currentTopic && subconcepts.length > 0 && (
              <div className="p-2.5 rounded-xl bg-slate-950/60 border border-white/10 text-xs space-y-2">
                <div className="flex items-center justify-between text-[11px]">
                  <span className="font-semibold text-slate-200 truncate flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                    <span>Capítulo {activeSession.current_topic_index + 1}: {currentTopic.title}</span>
                  </span>
                  <div className="flex items-center gap-1.5">
                    <span className="text-[10px] text-amber-400 font-mono">
                      Bloco {currentSubIdx + 1} de {subconcepts.length}
                    </span>
                    {activeSession.surface_pace && (
                      <span className="text-[9px] uppercase px-1.5 py-0.2 rounded bg-white/5 border border-white/10 text-slate-400">
                        {activeSession.surface_pace === 'fast' ? '⚡ Expresso' : activeSession.surface_pace === 'detailed' ? '🔬 Detalhado' : '⚖️ Padrão'}
                      </span>
                    )}
                  </div>
                </div>

                {/* Micro-conceitos Clickable Progress Pills */}
                <div className="flex items-center gap-1.5 pt-0.5">
                  {subconcepts.map((sub, sIdx) => {
                    const isPassed = activeSession.current_phase === 'depth' ? sub.depth_passed : sub.surface_passed;
                    const isCurrent = sIdx === currentSubIdx;
                    return (
                      <button
                        key={sub.id || sIdx}
                        onClick={() => jumpToStep(activeSession.current_topic_index, sIdx, activeSession.current_phase as any)}
                        className={`flex-1 h-2 rounded-full transition-all cursor-pointer ${
                          isPassed 
                            ? 'bg-emerald-400 hover:bg-emerald-300 shadow-[0_0_8px_rgba(52,211,153,0.3)]' 
                            : isCurrent 
                            ? 'bg-amber-400 ring-2 ring-amber-400/50 animate-pulse' 
                            : 'bg-slate-800 hover:bg-slate-700'
                        }`}
                        title={`Bloco ${sIdx + 1}: ${sub.title} (${isPassed ? 'Validado' : isCurrent ? 'Ativo' : 'Pendente'}) - Clique para saltar`}
                      />
                    );
                  })}
                </div>

                {currentSub && (
                  <div className="text-[10px] text-slate-300 flex items-center justify-between pt-0.5">
                    <span className="truncate text-slate-300">
                      🎯 <b>Foco:</b> {currentSub.title}
                    </span>
                    {currentSub.source_title && (
                      <button
                        onClick={() => handleNavigateToSlideInternal(currentSub.page_numbers?.[0] || 1)}
                        className="text-[9px] text-amber-400 hover:text-amber-200 bg-amber-500/10 hover:bg-amber-500/20 px-2 py-0.5 rounded-md border border-amber-500/25 shrink-0 ml-1 transition flex items-center gap-1 font-mono cursor-pointer"
                        title={`Abrir ${currentSub.source_title} (página ${currentSub.page_numbers?.[0] || 1})`}
                      >
                        <BookOpen size={10} className="text-amber-400" />
                        <span>{currentSub.source_title}</span>
                        {currentSub.page_numbers && currentSub.page_numbers.length > 0 && (
                          <span className="text-slate-400 text-[8px]">
                            (Págs. {Math.min(...currentSub.page_numbers)}-{Math.max(...currentSub.page_numbers)})
                          </span>
                        )}
                      </button>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Expandable Big Insight Card */}
            {showBigInsight && activeSession.big_insight && (
              <div className="p-3 rounded-xl bg-gradient-to-r from-purple-950/60 to-slate-900/90 border border-purple-400/40 text-xs shadow-xl animate-in fade-in duration-200">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-purple-300 flex items-center gap-1">
                    <Compass size={12} /> A Grande Sacada (The Big Insight)
                  </span>
                  <button onClick={() => setShowBigInsight(false)} className="text-slate-400 hover:text-slate-200">
                    <X size={12} />
                  </button>
                </div>
                <p className="text-slate-200 leading-relaxed italic text-[11px]">
                  "{activeSession.big_insight}"
                </p>
              </div>
            )}

            {/* Expandable Roadmap List */}
            {showRoadmap && (
              <div className="p-2.5 rounded-xl bg-slate-950/80 border border-white/10 space-y-2 max-h-60 overflow-y-auto text-xs animate-in fade-in duration-200">
                <div className="flex items-center justify-between pb-1 border-b border-white/5 text-[11px] text-slate-400">
                  <span>Trilha de Aprendizado (Clique para navegar)</span>
                  <div className="flex items-center gap-1">
                    <span className="text-[10px]">Ritmo:</span>
                    {(['fast', 'standard', 'detailed'] as const).map((paceKey) => (
                      <button
                        key={paceKey}
                        onClick={() => handleRebuildRoadmapClick(paceKey)}
                        className={`text-[9px] px-1.5 py-0.5 rounded transition ${
                          activeSession.surface_pace === paceKey
                            ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30 font-bold'
                            : 'text-slate-500 hover:text-slate-300'
                        }`}
                      >
                        {paceKey === 'fast' ? '⚡ Expresso' : paceKey === 'detailed' ? '🔬 Detalhado' : '⚖️ Padrão'}
                      </button>
                    ))}
                  </div>
                </div>

                {activeSession.roadmap.map((topic, idx) => {
                  const isCurrent = activeSession.current_topic_index === idx;
                  const isSurfaceValid = topic.surface_status === 'validated';
                  const isDepthValid = topic.depth_status === 'validated';
                  const topicSubs = topic.subconcepts || [];

                  return (
                    <div
                      key={topic.id}
                      className={`p-2.5 rounded-xl border transition ${
                        isCurrent
                          ? 'bg-amber-500/15 border-amber-500/40 text-white'
                          : 'bg-white/[0.02] border-white/5 text-slate-300 hover:border-white/20'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <button
                          onClick={() => jumpToStep(idx, 0, activeSession.current_phase as any)}
                          className="font-semibold text-xs truncate text-left hover:text-amber-300 transition flex items-center gap-1"
                        >
                          <span>{idx + 1}. {topic.title}</span>
                          {topic.covered_pages && topic.covered_pages.length > 0 && (
                            <span className="text-[9px] text-slate-500 font-normal">
                              ({topic.covered_pages.length} págs)
                            </span>
                          )}
                        </button>
                        <div className="flex items-center gap-1 shrink-0 text-[10px]">
                          <button
                            onClick={() => jumpToStep(idx, 0, 'surface')}
                            className={`px-1.5 py-0.2 rounded transition ${
                              isSurfaceValid ? 'bg-emerald-500/20 text-emerald-300' : 'bg-slate-800 text-slate-500 hover:text-slate-300'
                            }`}
                            title="Saltar para a Superfície deste capítulo"
                          >
                            Sup: {isSurfaceValid ? '✓' : topic.surface_status}
                          </button>
                          <button
                            onClick={() => jumpToStep(idx, 0, 'depth')}
                            className={`px-1.5 py-0.2 rounded transition ${
                              isDepthValid 
                                ? 'bg-purple-500/20 text-purple-300' 
                                : topic.depth_status === 'locked' 
                                ? 'bg-slate-900 text-slate-600' 
                                : 'bg-slate-800 text-slate-500 hover:text-purple-300'
                            }`}
                            title="Saltar para a Profundeza deste capítulo"
                          >
                            Prof: {isDepthValid ? '✓' : topic.depth_status}
                          </button>
                        </div>
                      </div>

                      {topicSubs.length > 0 && (
                        <div className="mt-1.5 pt-1.5 border-t border-white/5 space-y-1">
                          {topicSubs.map((sub, sIdx) => {
                            const isSubPassed = activeSession.current_phase === 'depth' ? sub.depth_passed : sub.surface_passed;
                            const isSubActive = isCurrent && topic.current_subconcept_index === sIdx;
                            return (
                              <button
                                key={sub.id || sIdx}
                                onClick={() => jumpToStep(idx, sIdx, activeSession.current_phase as any)}
                                className={`w-full flex items-center justify-between text-[10px] text-left p-1 rounded hover:bg-white/5 transition ${
                                  isSubActive ? 'bg-amber-500/10 text-amber-200' : ''
                                }`}
                              >
                                <div className="flex items-center gap-1.5 truncate">
                                  {isSubPassed ? (
                                    <CheckSquare size={11} className="text-emerald-400 shrink-0" />
                                  ) : (
                                    <Square size={11} className="text-slate-600 shrink-0" />
                                  )}
                                  <span className={`truncate ${isSubPassed ? 'line-through text-slate-500' : 'text-slate-300'}`}>
                                    {sub.title}
                                  </span>
                                </div>
                                {sub.page_numbers?.length > 0 && (
                                  <span className="text-[9px] text-slate-500 font-mono shrink-0 ml-1">
                                    Pág. {sub.page_numbers.join(', ')}
                                  </span>
                                )}
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Socratic Messages Stream */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {activeSession.messages.map((msg, index) => {
              const isAssistant = msg.role === 'assistant';
              const isInserted = Boolean(insertedMessageIds[msg.id]);
              const hasDoubtThreads = Boolean(msg.doubt_threads && msg.doubt_threads.length > 0);
              const isDoubtDrawerOpen = openDoubtDrawerMsgId === msg.id;

              return (
                <div key={msg.id || index} id={`msg-${msg.id}`} className={`space-y-2 ${isAssistant ? '' : 'flex justify-end'}`}>
                  {isAssistant ? (
                    <div className={`glass-card p-4 rounded-2xl border transition-all duration-200 space-y-3 relative group shadow-lg ${
                      isDoubtDrawerOpen ? 'border-sky-500/40 shadow-[0_0_20px_rgba(14,165,233,0.12)]' : 'border-white/10'
                    }`}>
                      {/* Slide Reference Banner with Quick Navigation */}
                      {msg.slide_reference && (
                        <div className="flex items-center justify-between p-2 rounded-xl bg-purple-950/40 border border-purple-500/30 text-[11px] text-purple-200">
                          <div className="flex items-center gap-2 truncate">
                            <BookOpen size={14} className="text-purple-400 shrink-0" />
                            <span className="font-semibold truncate">
                              Slide: {msg.slide_reference.source_title || 'PDF'}
                              {msg.slide_reference.page_number ? ` • Pág. ${msg.slide_reference.page_number}` : ''}
                            </span>
                          </div>
                          {onNavigateToSlide && (
                            <button
                              onClick={() => handleNavigateToSlideInternal(msg.slide_reference!.page_number || 1, msg)}
                              className="px-2.5 py-1 rounded-lg bg-purple-500/25 hover:bg-purple-500/40 text-purple-200 hover:text-white font-medium text-[10px] flex items-center gap-1.5 transition shrink-0 cursor-pointer shadow-sm border border-purple-500/40"
                              title="Abrir este slide no visualizador de PDFs à esquerda e fazer anotações"
                            >
                              <span>Abrir Slide</span>
                              <ExternalLink size={11} />
                            </button>
                          )}
                        </div>
                      )}

                      {/* Formula Part 1: Contextualization */}
                      {msg.contextualization && (
                        <div className="text-xs text-amber-300/90 bg-amber-500/10 border-l-2 border-amber-400 px-3 py-2 rounded-r-xl leading-relaxed text-[11px]">
                          <span className="font-bold block text-[10px] uppercase tracking-wider text-amber-400 mb-0.5">
                            🔗 Contextualização & Retomada da Problemática
                          </span>
                          {renderMarkdownWithPageChips(msg.contextualization, msg)}
                        </div>
                      )}

                      {/* Formula Part 2: Step Explanation with KaTeX math */}
                      {msg.explanation && (
                        <div className="text-xs text-slate-200 leading-relaxed prose prose-invert max-w-none text-[12px]">
                          {renderMarkdownWithPageChips(msg.explanation, msg)}
                        </div>
                      )}

                      {/* Visual Component: Mermaid Diagram */}
                      {msg.diagram_mermaid && (
                        <MermaidDiagram 
                           chart={msg.diagram_mermaid} 
                          title="Diagrama / Modelo Formal" 
                          onInsertIntoNote={onInsertIntoNote}
                        />
                      )}

                      {/* Step-by-Step Example / Execution Trace */}
                      {msg.step_by_step_example && (
                        <div className="p-3 rounded-xl bg-slate-950/70 border border-slate-700/60 text-xs space-y-1">
                          <span className="text-[10px] font-bold uppercase tracking-wider text-sky-400 block mb-1">
                            📋 Exemplo Prático & Rastreio Passo a Passo
                          </span>
                          <div className="text-slate-300 text-[11px] leading-relaxed font-mono">
                            {renderMarkdownWithPageChips(msg.step_by_step_example, msg)}
                          </div>
                        </div>
                      )}

                      {/* Formula Part 3: Socratic Question */}
                      {msg.question && (
                        <div className="p-3 rounded-xl bg-gradient-to-br from-amber-500/15 via-purple-500/10 to-transparent border border-amber-400/40 text-xs shadow-md">
                          <span className="text-[10px] font-bold uppercase tracking-wider text-amber-300 block mb-1">
                            🎯 Pergunta Socrática
                          </span>
                          <span className="text-slate-100 font-medium leading-relaxed block">
                            {msg.question}
                          </span>
                        </div>
                      )}

                      {/* Fallback content if structured fields missing */}
                      {!msg.contextualization && !msg.explanation && !msg.question && (
                        <div className="text-xs text-slate-200 leading-relaxed prose prose-invert max-w-none">
                          {renderMarkdownWithPageChips(msg.content, msg)}
                        </div>
                      )}

                      {/* Transparent "Em Construção" Feedback Card */}
                      {msg.construction_feedback && (msg.construction_feedback.what_was_right || msg.construction_feedback.what_is_missing) && (
                        <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-400/30 text-xs space-y-2 shadow-md animate-in fade-in duration-200">
                          <div className="flex items-center justify-between">
                            <span className="font-bold text-[10px] uppercase tracking-wider text-amber-300 flex items-center gap-1.5">
                              <AlertCircle size={12} className="text-amber-400" />
                              <span>Raciocínio em Construção</span>
                            </span>
                            {msg.attempts ? (
                              <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30">
                                Tentativa {msg.attempts} de 2
                              </span>
                            ) : null}
                          </div>
                          {msg.construction_feedback.what_was_right && (
                            <div className="text-[11px] text-emerald-300 bg-emerald-500/10 p-2 rounded-lg border border-emerald-500/20">
                              <strong className="block text-emerald-400 font-semibold mb-0.5">✓ O que você já acertou:</strong>
                              <span>{msg.construction_feedback.what_was_right}</span>
                            </div>
                          )}
                          {msg.construction_feedback.what_is_missing && (
                            <div className="text-[11px] text-amber-200 bg-amber-500/10 p-2 rounded-lg border border-amber-500/20">
                              <strong className="block text-amber-300 font-semibold mb-0.5">⚠️ O que ainda falta complementar:</strong>
                              <span>{msg.construction_feedback.what_is_missing}</span>
                            </div>
                          )}
                        </div>
                      )}

                      {/* Validated Synapse Card */}
                      {msg.topic_validated && msg.student_synthesis && (
                        <div className="p-3 rounded-xl bg-emerald-500/15 border border-emerald-400/40 text-xs text-emerald-200 space-y-1 shadow-[0_0_15px_rgba(16,185,129,0.15)] animate-in fade-in duration-300">
                          <div className="flex items-center justify-between">
                            <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-300 flex items-center gap-1">
                              <CheckCircle2 size={12} /> Sinapse Validada
                            </span>
                            {msg.synapse_comment_id && (
                              <span className="text-[9px] font-mono bg-emerald-500/20 text-emerald-300 px-1.5 py-0.2 rounded-full border border-emerald-500/30">
                                Nó #{msg.synapse_comment_id} no Mapa
                              </span>
                            )}
                          </div>
                          <p className="text-slate-100 text-[11px] leading-relaxed italic">
                            "{msg.student_synthesis}"
                          </p>
                        </div>
                      )}

                      {/* 1-Click Action Buttons */}
                      <div className="flex items-center justify-between pt-1 border-t border-white/5 text-[10px] text-slate-400">
                        <span className="font-mono text-[9px]">
                          {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>

                        <div className="flex items-center gap-2">
                          {/* Levantar a Mão / Dúvidas de Sala de Aula */}
                          <button
                            type="button"
                            onClick={() => setOpenDoubtDrawerMsgId(isDoubtDrawerOpen ? null : msg.id)}
                            className={`flex items-center gap-1 px-2 py-1 rounded-lg transition font-medium text-[10px] ${
                              hasDoubtThreads
                                ? 'bg-sky-500/20 text-sky-200 border border-sky-500/40 hover:bg-sky-500/30 shadow-[0_0_10px_rgba(14,165,233,0.15)]'
                                : isDoubtDrawerOpen
                                ? 'bg-sky-500/15 text-sky-300 border border-sky-500/30'
                                : 'hover:bg-sky-500/10 text-slate-300 hover:text-sky-300 border border-transparent'
                            }`}
                            title="Tirar dúvida pontual com o professor sem avançar o conteúdo"
                          >
                            <Hand size={11} className={hasDoubtThreads ? 'text-sky-400' : 'text-slate-400'} />
                            <span>{hasDoubtThreads ? `Dúvidas (${msg.doubt_threads!.length})` : 'Levantar a Mão'}</span>
                            {isDoubtDrawerOpen ? <ChevronDown size={10} /> : <ChevronRight size={10} />}
                          </button>

                          {/* Generate Visual Diagram on Demand */}
                          {!msg.diagram_mermaid && (
                            <button
                              onClick={() => handleGenerateVisualClick(msg.id)}
                              disabled={generatingVisualForMsgId === msg.id}
                              className="flex items-center gap-1 px-2 py-1 rounded-lg text-slate-400 hover:text-purple-300 hover:bg-purple-500/10 transition font-medium text-[10px]"
                              title="Gerar diagrama visual Mermaid sob demanda para este conceito"
                            >
                              {generatingVisualForMsgId === msg.id ? (
                                <Loader2 size={11} className="animate-spin text-purple-400" />
                              ) : (
                                <Palette size={11} className="text-purple-400" />
                              )}
                              <span>{generatingVisualForMsgId === msg.id ? 'Gerando...' : 'Gerar Diagrama'}</span>
                            </button>
                          )}

                          {/* Insert Into Note Button */}
                          {onInsertIntoNote && (
                            <button
                              onClick={() => handleInsertSnippet(msg)}
                              className={`flex items-center gap-1 px-2.5 py-1 rounded-lg transition font-medium ${
                                isInserted
                                  ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                                  : 'hover:bg-white/10 text-slate-300 hover:text-amber-300 border border-transparent'
                              }`}
                              title="Inserir síntese formatada no editor da nota de resumo"
                            >
                              {isInserted ? <Check size={11} /> : <FileDown size={11} className="text-amber-400" />}
                              <span>{isInserted ? 'Inserido na Nota' : 'Inserir na Nota'}</span>
                            </button>
                          )}

                          {/* Crystallize Synapse Button */}
                          <button
                            onClick={async () => {
                              await crystallizeSynapse(msg.id);
                            }}
                            disabled={Boolean(msg.synapse_comment_id)}
                            className={`flex items-center gap-1 px-2.5 py-1 rounded-lg transition font-medium ${
                              msg.synapse_comment_id
                                ? 'bg-purple-500/15 text-purple-300 border border-purple-500/30'
                                : 'hover:bg-purple-500/20 text-slate-300 hover:text-purple-300 border border-transparent'
                            }`}
                            title={msg.synapse_comment_id ? 'Sinapse já conectada no Mapa Mental' : 'Criar nó e conexão no Mapa Mental'}
                          >
                            <Brain size={11} className="text-purple-400" />
                            <span>{msg.synapse_comment_id ? `Sinapse #${msg.synapse_comment_id}` : 'Criar Sinapse'}</span>
                          </button>
                        </div>
                      </div>

                      {/* Option A: Expandable Accordion Drawer for Classroom Doubts */}
                      {isDoubtDrawerOpen && (
                        <div className="mt-3 pt-3 border-t border-sky-500/30 bg-gradient-to-b from-sky-950/40 via-slate-900/90 to-slate-950/95 -mx-4 -mb-4 p-4 rounded-b-2xl space-y-3 animate-in fade-in duration-200">
                          <div className="flex items-center justify-between border-b border-sky-500/20 pb-2">
                            <div className="flex items-center gap-2">
                              <div className="p-1.5 rounded-lg bg-sky-500/20 text-sky-300 border border-sky-500/30">
                                <Hand size={13} className="text-sky-400" />
                              </div>
                              <div>
                                <h4 className="text-xs font-bold text-sky-200 flex items-center gap-1.5">
                                  Dúvidas de Sala de Aula
                                </h4>
                                <p className="text-[10px] text-sky-300/70">
                                  Discussão pontual e direta • Não consome tentativas nem avança a trilha
                                </p>
                              </div>
                            </div>
                            <button
                              type="button"
                              onClick={() => setOpenDoubtDrawerMsgId(null)}
                              className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition text-xs"
                              title="Recolher gaveta de dúvidas"
                            >
                              <X size={14} />
                            </button>
                          </div>

                          {/* Existing doubt threads */}
                          {msg.doubt_threads && msg.doubt_threads.length > 0 ? (
                            <div className="space-y-3">
                              {msg.doubt_threads.map((thread) => {
                                const isResolved = thread.status === 'resolved';
                                const isThreadInserted = Boolean(insertedThreadIds[thread.id]);
                                const isReplyingThisThread = isAskingDoubt && raisingHandForMessageId === msg.id;

                                return (
                                  <div
                                    key={thread.id}
                                    className={`p-3 rounded-xl border space-y-2.5 transition ${
                                      isResolved
                                        ? 'bg-slate-900/60 border-slate-700/50'
                                        : 'bg-sky-950/30 border-sky-500/30 shadow-md'
                                    }`}
                                  >
                                    {/* Thread Header */}
                                    <div className="flex items-center justify-between gap-2">
                                      <div className="flex items-center gap-2 min-w-0">
                                        <span className={`text-[9px] px-2 py-0.5 rounded-full font-semibold border shrink-0 flex items-center gap-1 ${
                                          isResolved
                                            ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
                                            : 'bg-sky-500/20 text-sky-300 border-sky-500/30'
                                        }`}>
                                          {isResolved ? <CheckCircle2 size={10} /> : <HelpCircle size={10} />}
                                          {isResolved ? 'Resolvida' : 'Em Discussão'}
                                        </span>
                                        <span className="text-[11px] font-semibold text-slate-200 truncate" title={thread.title}>
                                          {thread.title}
                                        </span>
                                      </div>

                                      <div className="flex items-center gap-1 shrink-0">
                                        {/* Insert doubt into note button */}
                                        {onInsertIntoNote && (
                                          <button
                                            type="button"
                                            onClick={() => handleInsertDoubtSnippet(thread)}
                                            className={`px-2 py-1 rounded-lg text-[10px] font-medium flex items-center gap-1 transition ${
                                              isThreadInserted
                                                ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                                                : 'bg-white/5 hover:bg-white/10 text-slate-300 hover:text-amber-300 border border-white/10'
                                            }`}
                                            title="Inserir esta dúvida e explicação na sua nota de anotações"
                                          >
                                            {isThreadInserted ? <Check size={10} /> : <FileDown size={10} className="text-amber-400" />}
                                            <span>{isThreadInserted ? 'Inserido' : 'Inserir na Nota'}</span>
                                          </button>
                                        )}

                                        {/* Mark as resolved button */}
                                        {!isResolved && (
                                          <button
                                            type="button"
                                            onClick={() => handleResolveDoubtThread(msg.id, thread.id)}
                                            className="px-2 py-1 rounded-lg text-[10px] font-medium bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-200 border border-emerald-500/30 flex items-center gap-1 transition"
                                            title="Marcar dúvida como esclarecida"
                                          >
                                            <CheckCheck size={10} className="text-emerald-400" />
                                            <span>Esclarecida</span>
                                          </button>
                                        )}
                                      </div>
                                    </div>

                                    {/* Thread Messages */}
                                    <div className="space-y-2 pt-1 border-t border-white/5">
                                      {thread.messages.map((dmsg, dIdx) => {
                                        const isDoubtAssistant = dmsg.role === 'assistant';
                                        return (
                                          <div
                                            key={dmsg.id || dIdx}
                                            className={`p-2.5 rounded-xl text-[11px] leading-relaxed ${
                                              isDoubtAssistant
                                                ? 'bg-slate-900/90 border border-slate-700/60 text-slate-200'
                                                : 'bg-sky-500/15 border border-sky-400/30 text-sky-100 ml-3'
                                            }`}
                                          >
                                            <div className="flex items-center justify-between mb-1 text-[9px] text-slate-400 font-mono">
                                              <span className="font-semibold text-sky-300">
                                                {isDoubtAssistant ? '👨‍🏫 Professor (Explicação Direta)' : '🙋‍♂️ Sua Dúvida'}
                                              </span>
                                              <span>{new Date(dmsg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                                            </div>

                                            {/* Content with Page Chips & Math */}
                                            <div className="prose prose-invert max-w-none text-[11px]">
                                              {renderMarkdownWithPageChips(dmsg.content, msg)}
                                            </div>

                                            {/* Mermaid diagram if generated in doubt response */}
                                            {dmsg.diagram_mermaid && (
                                              <div className="mt-2">
                                                <MermaidDiagram
                                                  chart={dmsg.diagram_mermaid}
                                                  title="Diagrama Ilustrativo da Dúvida"
                                                  onInsertIntoNote={onInsertIntoNote}
                                                />
                                              </div>
                                            )}
                                          </div>
                                        );
                                      })}
                                    </div>

                                    {/* Follow-up input for active thread */}
                                    {!isResolved && (
                                      <div className="pt-2 border-t border-white/5 flex items-end gap-1.5">
                                        <textarea
                                          rows={1}
                                          value={threadReplyInputs[thread.id] || ''}
                                          onChange={(e) => setThreadReplyInputs((prev) => ({ ...prev, [thread.id]: e.target.value }))}
                                          onKeyDown={(e) => {
                                            if (e.key === 'Enter' && !e.shiftKey) {
                                              e.preventDefault();
                                              handleSendRaiseHand(msg.id, thread.id);
                                            }
                                          }}
                                          placeholder="Fazer réplica ou perguntar mais detalhes..."
                                          disabled={isReplyingThisThread}
                                          className="flex-1 glass-input text-xs text-slate-100 p-2 rounded-lg resize-none focus:ring-1 focus:ring-sky-400/50 bg-slate-950/70 border-sky-500/20 text-[11px]"
                                        />
                                        <button
                                          type="button"
                                          onClick={() => handleSendRaiseHand(msg.id, thread.id)}
                                          disabled={isReplyingThisThread || !threadReplyInputs[thread.id]?.trim()}
                                          className="px-2.5 py-2 rounded-lg bg-sky-500/30 hover:bg-sky-500/40 text-sky-200 border border-sky-500/40 text-[11px] font-medium transition disabled:opacity-40 shrink-0 flex items-center gap-1"
                                          title="Enviar réplica"
                                        >
                                          {isReplyingThisThread ? (
                                            <Loader2 size={12} className="animate-spin" />
                                          ) : (
                                            <Send size={12} />
                                          )}
                                        </button>
                                      </div>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          ) : (
                            <div className="p-3 rounded-xl bg-sky-950/20 border border-sky-500/20 text-center text-xs text-slate-400">
                              Nenhuma dúvida levantada para este bloco ainda. Digite sua pergunta abaixo.
                            </div>
                          )}

                          {/* Live Loading Feedback while asking doubt */}
                          {isAskingDoubt && raisingHandForMessageId === msg.id && (
                            <div className="p-3 rounded-xl bg-sky-950/40 border border-sky-400/30 flex items-center gap-2 text-xs text-sky-200 animate-pulse">
                              <Loader2 size={14} className="animate-spin text-sky-400 shrink-0" />
                              <span>O professor está consultando os slides e preparando a explicação da sua dúvida...</span>
                            </div>
                          )}

                          {/* Form to raise a new doubt */}
                          <div className="p-3 rounded-xl bg-slate-900/80 border border-sky-500/30 space-y-2">
                            <span className="text-[10px] font-bold text-sky-300 uppercase tracking-wider flex items-center gap-1.5">
                              <Lightbulb size={11} className="text-amber-400" />
                              Nova Dúvida Pontual sobre esta Explicação
                            </span>
                            <div className="flex items-end gap-2">
                              <textarea
                                rows={2}
                                value={newDoubtInputByMsgId[msg.id] || ''}
                                onChange={(e) => setNewDoubtInputByMsgId((prev) => ({ ...prev, [msg.id]: e.target.value }))}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter' && !e.shiftKey) {
                                    e.preventDefault();
                                    handleSendRaiseHand(msg.id);
                                  }
                                }}
                                placeholder="Ex: Professor, não entendi como esse fecho se aplica ao slide. Poderia me dar um exemplo direto?"
                                disabled={isAskingDoubt && raisingHandForMessageId === msg.id}
                                className="flex-1 glass-input text-xs text-slate-100 p-2.5 rounded-xl resize-none focus:ring-1 focus:ring-sky-400/50 bg-slate-950/90 border-sky-500/30 text-[11px]"
                              />
                              <button
                                type="button"
                                onClick={() => handleSendRaiseHand(msg.id)}
                                disabled={(isAskingDoubt && raisingHandForMessageId === msg.id) || !newDoubtInputByMsgId[msg.id]?.trim()}
                                className="px-3 py-2.5 rounded-xl bg-gradient-to-r from-sky-500 to-blue-600 hover:from-sky-400 hover:to-blue-500 text-white font-medium text-xs shadow-lg disabled:opacity-40 transition-transform hover:scale-105 active:scale-95 shrink-0 flex items-center gap-1.5"
                                title="Perguntar ao professor (Enter)"
                              >
                                {isAskingDoubt && raisingHandForMessageId === msg.id ? (
                                  <Loader2 size={13} className="animate-spin" />
                                ) : (
                                  <Send size={13} />
                                )}
                                <span>Perguntar</span>
                              </button>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  ) : (
                    /* Student User Message */
                    <div className="max-w-[85%] bg-amber-500/20 border border-amber-400/30 text-slate-100 p-3 rounded-2xl rounded-tr-sm text-xs leading-relaxed shadow-md">
                      <div className="flex items-center justify-between mb-1">
                        <span className="font-semibold text-[10px] uppercase text-amber-300">
                          Sua Linha de Raciocínio
                        </span>
                        {msg.student_intent && (
                          <span className={`text-[9px] px-1.5 py-0.2 rounded-full border ${
                            msg.student_intent === 'mastered_subconcept' 
                              ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30' 
                              : msg.student_intent === 'doubt_or_question'
                              ? 'bg-sky-500/20 text-sky-300 border-sky-500/30'
                              : 'bg-amber-500/20 text-amber-300 border-amber-500/30'
                          }`}>
                            {msg.student_intent === 'mastered_subconcept' ? 'Domínio' : msg.student_intent === 'doubt_or_question' ? 'Dúvida' : 'Em Construção'}
                          </span>
                        )}
                      </div>
                      {msg.content}
                    </div>
                  )}
                </div>
              );
            })}

            {isSendingTurn && (
              <div className="glass-card p-4 rounded-2xl border border-white/10 flex items-center gap-2 text-xs text-amber-300">
                <Loader2 size={16} className="animate-spin text-amber-400" />
                <span>Consultando slides, analisando raciocínio e preparando resposta socrática...</span>
              </div>
            )}

            {/* Chapter Completion Decision Card */}
            {activeSession.current_phase === 'surface' && (currentTopic?.chapter_surface_completed || (subconcepts.length > 0 && subconcepts.every(s => s.surface_passed))) && (
              <div className="glass-card p-4 rounded-2xl bg-gradient-to-r from-purple-950/70 via-slate-900 to-amber-950/40 border border-amber-400/40 shadow-xl space-y-2.5 animate-in fade-in duration-300">
                <div className="flex items-center gap-2">
                  <Sparkles size={16} className="text-amber-400 shrink-0" />
                  <span className="font-bold text-xs text-slate-100">
                    Capítulo Concluído na Superfície!
                  </span>
                </div>
                <p className="text-[11px] text-slate-300 leading-relaxed">
                  Você consolidou todos os blocos de <strong>{currentTopic?.title}</strong>. Como deseja prosseguir seu estudo?
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                  <button
                    onClick={() => jumpToStep(activeSession.current_topic_index, 0, 'depth')}
                    disabled={isSendingTurn}
                    className="px-3 py-2 rounded-xl bg-purple-500/20 hover:bg-purple-500/30 border border-purple-500/40 text-purple-200 text-[11px] font-bold flex items-center justify-center gap-1.5 transition shadow"
                  >
                    <Brain size={13} className="text-purple-400" />
                    <span>Mergulhar na Profundeza</span>
                  </button>
                  {activeSession.current_topic_index + 1 < activeSession.roadmap.length && (
                    <button
                      onClick={() => jumpToStep(activeSession.current_topic_index + 1, 0, 'surface')}
                      disabled={isSendingTurn}
                      className="px-3 py-2 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/40 text-amber-200 text-[11px] font-bold flex items-center justify-center gap-1.5 transition shadow"
                    >
                      <ChevronRight size={13} className="text-amber-400" />
                      <span>Próximo Capítulo (Superfície)</span>
                    </button>
                  )}
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Bottom Response Bar */}
          <div className="p-3 border-t border-white/10 bg-slate-900/60 shrink-0 space-y-2">
            <div className="flex items-center justify-between text-[11px] text-slate-400">
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={handleRaiseHandBottomClick}
                  disabled={isSendingTurn || isAskingDoubt}
                  className="hover:text-sky-300 flex items-center gap-1 text-[11px] transition disabled:opacity-50 text-sky-400 font-medium cursor-pointer"
                  title="Levantar a mão para tirar dúvida pontual sobre a explicação atual sem avançar a trilha"
                >
                  <Hand size={12} className="text-sky-400" />
                  <span>Levantar a Mão</span>
                </button>

                <button
                  type="button"
                  onClick={() => handleSendResponse('ask_hint')}
                  disabled={isSendingTurn}
                  className="hover:text-amber-300 flex items-center gap-1 text-[11px] transition disabled:opacity-50 text-amber-400"
                >
                  <Lightbulb size={12} className="text-amber-400" />
                  <span>Pedir Pista</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    const nextSubIdx = currentSubIdx + 1;
                    if (nextSubIdx < subconcepts.length) {
                      jumpToStep(activeSession.current_topic_index, nextSubIdx, activeSession.current_phase as any);
                    } else if (activeSession.current_topic_index + 1 < activeSession.roadmap.length) {
                      jumpToStep(activeSession.current_topic_index + 1, 0, activeSession.current_phase as any);
                    }
                  }}
                  disabled={isSendingTurn}
                  className="hover:text-amber-300 flex items-center gap-1 text-[11px] transition disabled:opacity-50 text-slate-400 hover:text-slate-200"
                  title="Pular direto para o próximo bloco de estudo"
                >
                  <FastForward size={12} className="text-amber-400" />
                  <span>Avançar Bloco</span>
                </button>
              </div>

              {activeSession.current_phase === 'surface' && (
                <button
                  type="button"
                  onClick={() => handleSendResponse('advance_phase')}
                  disabled={isSendingTurn}
                  className="hover:text-purple-300 flex items-center gap-1 text-[11px] transition disabled:opacity-50 text-purple-400"
                >
                  <Unlock size={11} />
                  <span>Aprofundar Tópicos</span>
                </button>
              )}
            </div>

            <div className="relative flex items-end gap-2">
              <textarea
                rows={2}
                value={studentInput}
                onChange={(e) => setStudentInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Responda à pergunta ou tire uma dúvida sobre o slide..."
                disabled={isSendingTurn}
                className="flex-1 glass-input text-xs text-slate-100 p-2.5 rounded-xl resize-none focus:ring-1 focus:ring-amber-400/50"
              />
              <button
                onClick={() => handleSendResponse('answer')}
                disabled={isSendingTurn || !studentInput.trim()}
                className="glass-btn-gold p-2.5 rounded-xl shadow-lg disabled:opacity-40 transition-transform hover:scale-105 active:scale-95 shrink-0"
                title="Enviar Resposta ou Dúvida (Enter)"
              >
                <Send size={15} />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
