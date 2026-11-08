import React, { useState, useEffect, useCallback, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {
  Users,
  CheckSquare,
  CalendarDays,
  BookOpen,
  Play,
  Pause,
  RotateCcw,
  CheckCircle2,
  Lock,
  Plus,
  Shield,
  KeyRound,
  LogOut,
  ListChecks,
  Clock,
  Sparkles,
  AlertCircle,
  FileText,
  Search,
  RefreshCw,
  X,
  Check,
  Pencil,
  Trash2,
  Eye,
  ChevronRight,
  Bold,
  Italic,
  List,
  ListOrdered,
  Quote,
  Code,
  Table as TableIcon,
  Columns,
  Save
} from 'lucide-react';
import {
  teamFetch,
  teamLogin,
  teamLogout,
  getTeamToken,
  getStoredTeamMember,
  type TeamMemberInfo
} from '../security/teamAuthClient';

const normalizeMarkdownNewlines = (raw: string): string => {
  if (!raw) return '';
  return raw.replace(/(?<!\n)\n(?!\n)/g, '  \n');
};

export const MarkdownRenderer: React.FC<{ content: string; className?: string }> = ({ content, className = '' }) => {
  return (
    <div
      className={`prose prose-invert max-w-none text-slate-200
        prose-headings:text-slate-100 prose-headings:font-bold
        prose-h1:text-xl prose-h1:text-amber-300 prose-h1:border-b prose-h1:border-white/10 prose-h1:pb-2 prose-h1:mt-5 prose-h1:mb-3
        prose-h2:text-lg prose-h2:text-slate-100 prose-h2:border-b prose-h2:border-white/5 prose-h2:pb-1.5 prose-h2:mt-4 prose-h2:mb-2
        prose-h3:text-sm prose-h3:text-slate-200 prose-h3:mt-3 prose-h3:mb-1.5
        prose-p:text-slate-300 prose-p:text-xs sm:prose-p:text-sm prose-p:leading-relaxed prose-p:my-2
        prose-strong:text-amber-200 prose-strong:font-bold
        prose-em:text-slate-200 prose-em:italic
        prose-ul:list-disc prose-ul:pl-5 prose-ul:my-2 prose-ul:text-slate-300
        prose-ol:list-decimal prose-ol:pl-5 prose-ol:my-2 prose-ol:text-slate-300
        prose-li:my-1 prose-li:text-xs sm:prose-li:text-sm
        prose-blockquote:border-l-4 prose-blockquote:border-amber-400 prose-blockquote:bg-amber-500/[0.04] prose-blockquote:p-3 prose-blockquote:rounded-r-xl prose-blockquote:text-slate-300 prose-blockquote:my-3 prose-blockquote:not-italic
        prose-code:text-amber-300 prose-code:bg-white/[0.07] prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded prose-code:text-xs prose-code:font-mono prose-code:before:content-none prose-code:after:content-none
        prose-pre:bg-slate-950/90 prose-pre:border prose-pre:border-white/10 prose-pre:p-4 prose-pre:rounded-xl prose-pre:overflow-x-auto prose-pre:text-xs
        prose-table:w-full prose-table:border-collapse prose-table:my-3 prose-table:text-xs
        prose-th:bg-white/[0.06] prose-th:border prose-th:border-white/10 prose-th:p-2.5 prose-th:text-slate-200 prose-th:font-semibold prose-th:text-left
        prose-td:border prose-td:border-white/[0.08] prose-td:p-2.5 prose-td:text-slate-300
        prose-hr:border-white/10 prose-hr:my-4
        prose-a:text-amber-400 prose-a:underline hover:prose-a:text-amber-300
        ${className}`}
    >
      <ReactMarkdown remarkPlugins={[remarkGfm]}>
        {normalizeMarkdownNewlines(content)}
      </ReactMarkdown>
    </div>
  );
};

const MarkdownToolbar: React.FC<{
  textareaRef: React.RefObject<HTMLTextAreaElement | null>;
  content: string;
  onChange: (val: string) => void;
}> = ({ textareaRef, content, onChange }) => {
  const insert = (prefix: string, suffix: string = '') => {
    const el = textareaRef.current;
    if (!el) {
      onChange(content + prefix + suffix);
      return;
    }
    const start = el.selectionStart;
    const end = el.selectionEnd;
    const selection = content.substring(start, end);
    const replacement = prefix + (selection || 'texto') + suffix;
    const nextVal = content.substring(0, start) + replacement + content.substring(end);
    onChange(nextVal);
    setTimeout(() => {
      el.focus();
      el.setSelectionRange(start + prefix.length, start + prefix.length + (selection ? selection.length : 'texto'.length));
    }, 50);
  };

  return (
    <div className="flex flex-wrap items-center gap-1 p-2 bg-white/[0.03] border-b border-white/[0.08] text-slate-300">
      <button
        type="button"
        onClick={() => insert('# ')}
        title="Título 1 (#)"
        className="px-2 py-1 rounded hover:bg-white/[0.08] text-xs font-bold text-amber-300"
      >
        H1
      </button>
      <button
        type="button"
        onClick={() => insert('## ')}
        title="Título 2 (##)"
        className="px-2 py-1 rounded hover:bg-white/[0.08] text-xs font-bold text-amber-300"
      >
        H2
      </button>
      <button
        type="button"
        onClick={() => insert('### ')}
        title="Título 3 (###)"
        className="px-2 py-1 rounded hover:bg-white/[0.08] text-xs font-bold text-amber-300"
      >
        H3
      </button>
      <div className="w-[1px] h-4 bg-white/10 mx-1" />
      <button
        type="button"
        onClick={() => insert('**', '**')}
        title="Negrito (**)"
        className="p-1.5 rounded hover:bg-white/[0.08]"
      >
        <Bold size={13} />
      </button>
      <button
        type="button"
        onClick={() => insert('*', '*')}
        title="Itálico (*)"
        className="p-1.5 rounded hover:bg-white/[0.08]"
      >
        <Italic size={13} />
      </button>
      <div className="w-[1px] h-4 bg-white/10 mx-1" />
      <button
        type="button"
        onClick={() => insert('- ')}
        title="Lista de Itens (-)"
        className="p-1.5 rounded hover:bg-white/[0.08]"
      >
        <List size={13} />
      </button>
      <button
        type="button"
        onClick={() => insert('1. ')}
        title="Lista Numerada (1.)"
        className="p-1.5 rounded hover:bg-white/[0.08]"
      >
        <ListOrdered size={13} />
      </button>
      <button
        type="button"
        onClick={() => insert('- [ ] ')}
        title="Checklist / Tarefa (- [ ])"
        className="p-1.5 rounded hover:bg-white/[0.08]"
      >
        <CheckSquare size={13} />
      </button>
      <div className="w-[1px] h-4 bg-white/10 mx-1" />
      <button
        type="button"
        onClick={() => insert('> ')}
        title="Citação / Destaque (>)"
        className="p-1.5 rounded hover:bg-white/[0.08]"
      >
        <Quote size={13} />
      </button>
      <button
        type="button"
        onClick={() => insert('`', '`')}
        title="Código inline (`)"
        className="p-1.5 rounded hover:bg-white/[0.08]"
      >
        <Code size={13} />
      </button>
      <button
        type="button"
        onClick={() => insert('\n| Coluna 1 | Coluna 2 |\n| :--- | :--- |\n| Item 1 | Item 2 |\n')}
        title="Tabela Markdown"
        className="p-1.5 rounded hover:bg-white/[0.08]"
      >
        <TableIcon size={13} />
      </button>
      <button
        type="button"
        onClick={() => insert('\n---\n')}
        title="Divisor Horizontal (---)"
        className="px-2 py-1 rounded hover:bg-white/[0.08] text-xs font-mono"
      >
        —
      </button>
    </div>
  );
};

interface TeamTask {
  id: number;
  name: string;
  description?: string;
  category: string;
  priority: string;
  difficulty: string;
  estimated_hours: number;
  status: string;
  time_spent_seconds: number;
  timer_status: string;
  assigned_by_leader: boolean;
  scheduled_date?: string;
  linked_note_id?: number;
  execution_notes?: string;
  created_at: string;
}

interface ChecklistItem {
  id: string;
  text: string;
  done: boolean;
}

interface TimelineBlock {
  id: number;
  date_str: string;
  title: string;
  notes?: string;
  block_type: string;
  start_minute: number;
  end_minute: number;
  color: string;
  priority: string;
  status: string;
  is_locked: boolean;
  assigned_by_leader: boolean;
  actual_seconds_spent: number;
  checklist?: ChecklistItem[];
  linked_note_id?: number;
}

interface TeamNote {
  id: number;
  title: string;
  content: string;
  notebook_id?: number;
  is_team_shared: boolean;
  allow_member_edit: boolean;
  created_by_leader: boolean;
  updated_at: string;
}

interface RoutineTemplateItem {
  id: number;
  title: string;
  description?: string;
  category: string;
  start_time_str: string;
  end_time_str: string;
  days_of_week?: string;
  color?: string;
  is_active?: boolean;
  member_id?: number | null;
  assigned_by_leader?: boolean;
  checklist?: { id?: string; text: string; done: boolean }[];
  linked_note_id?: number;
}

function formatMinutesToTime(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
}

function formatSeconds(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

export default function TeamPortal() {
  const [member, setMember] = useState<TeamMemberInfo | null>(getStoredTeamMember());
  const [activeTab, setActiveTab] = useState<'tasks' | 'timeline' | 'notes' | 'vault'>('tasks');

  // Login form state
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [deviceName, setDeviceName] = useState('');
  const [loginError, setLoginError] = useState<string | null>(null);
  const [loginMessage, setLoginMessage] = useState<string | null>(null);
  const [isLoggingIn, setIsLoggingIn] = useState(false);

  // Tasks state
  const [tasks, setTasks] = useState<TeamTask[]>([]);
  const [tasksLoading, setTasksLoading] = useState(false);
  const [taskFilter, setTaskFilter] = useState<'all' | 'pending' | 'in_progress' | 'completed'>('all');
  const [taskSearch, setTaskSearch] = useState('');
  const [isNewTaskModalOpen, setIsNewTaskModalOpen] = useState(false);
  const [newTaskName, setNewTaskName] = useState('');
  const [newTaskDesc, setNewTaskDesc] = useState('');
  const [newTaskHours, setNewTaskHours] = useState(2);
  const [newTaskPriority, setNewTaskPriority] = useState('Média');

  // Task details modal state
  const [selectedTaskForDetails, setSelectedTaskForDetails] = useState<TeamTask | null>(null);

  // Execution notes modal
  const [editingNotesTaskId, setEditingNotesTaskId] = useState<number | null>(null);
  const [executionNotesText, setExecutionNotesText] = useState('');

  // Timeline & Routine state
  const [todayStr] = useState(() => new Date().toISOString().slice(0, 10));
  const [selectedDate, setSelectedDate] = useState(todayStr);
  const [timelineBlocks, setTimelineBlocks] = useState<TimelineBlock[]>([]);
  const [timelineLoading, setTimelineLoading] = useState(false);
  const [activeChecklistBlock, setActiveChecklistBlock] = useState<TimelineBlock | null>(null);

  // Available Routines from Leader
  const [availableRoutines, setAvailableRoutines] = useState<RoutineTemplateItem[]>([]);
  const [routinesLoading, setRoutinesLoading] = useState(false);
  const [isRoutinesDrawerOpen, setIsRoutinesDrawerOpen] = useState(false);
  const [isApplyingAllRoutines, setIsApplyingAllRoutines] = useState(false);
  const [applyingRoutineId, setApplyingRoutineId] = useState<number | null>(null);

  // Manual Block Creation state
  const [isNewManualBlockModalOpen, setIsNewManualBlockModalOpen] = useState(false);
  const [newBlkTitle, setNewBlkTitle] = useState('');
  const [newBlkStart, setNewBlkStart] = useState('08:00');
  const [newBlkEnd, setNewBlkEnd] = useState('09:00');
  const [newBlkNotes, setNewBlkNotes] = useState('');
  const [isCreatingBlock, setIsCreatingBlock] = useState(false);

  // Block Editing state
  const [editingBlock, setEditingBlock] = useState<TimelineBlock | null>(null);
  const [editBlkTitle, setEditBlkTitle] = useState('');
  const [editBlkStart, setEditBlkStart] = useState('08:00');
  const [editBlkEnd, setEditBlkEnd] = useState('09:00');
  const [editBlkNotes, setEditBlkNotes] = useState('');
  const [isUpdatingBlock, setIsUpdatingBlock] = useState(false);

  // Notes state
  const [notes, setNotes] = useState<TeamNote[]>([]);
  const [notesLoading, setNotesLoading] = useState(false);
  const [selectedNote, setSelectedNote] = useState<TeamNote | null>(null);
  const [noteEditTitle, setNoteEditTitle] = useState('');
  const [noteEditContent, setNoteEditContent] = useState('');
  const [isEditingNote, setIsEditingNote] = useState(false);
  const [noteSearch, setNoteSearch] = useState('');
  const [noteFilter, setNoteFilter] = useState<'all' | 'pops' | 'personal'>('all');
  const [isNewNoteModalOpen, setIsNewNoteModalOpen] = useState(false);
  const [newNoteTitle, setNewNoteTitle] = useState('');
  const [newNoteContent, setNewNoteContent] = useState('');
  const [newNoteMode, setNewNoteMode] = useState<'edit' | 'preview'>('edit');
  const [noteEditorViewMode, setNoteEditorViewMode] = useState<'edit' | 'preview' | 'split'>('edit');
  const editNoteTextareaRef = useRef<HTMLTextAreaElement>(null);
  const newNoteTextareaRef = useRef<HTMLTextAreaElement>(null);

  // Password change modal
  const [isPasswordModalOpen, setIsPasswordModalOpen] = useState(false);
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [passwordSuccess, setPasswordSuccess] = useState<string | null>(null);

  const fetchTasks = useCallback(async () => {
    if (!getTeamToken()) return;
    setTasksLoading(true);
    try {
      const res = await teamFetch('/team-portal/tasks');
      if (res.ok) {
        const data = await res.json();
        setTasks(data);
        setSelectedTaskForDetails((curr) => {
          if (!curr) return null;
          return data.find((t: TeamTask) => t.id === curr.id) || curr;
        });
      }
    } catch (err) {
      console.error('Erro ao buscar demandas:', err);
    } finally {
      setTasksLoading(false);
    }
  }, []);

  const fetchTimeline = useCallback(async (date = selectedDate) => {
    if (!getTeamToken()) return;
    setTimelineLoading(true);
    try {
      const res = await teamFetch(`/team-portal/calendar/timeline/${date}`);
      if (res.ok) {
        const data = await res.json();
        setTimelineBlocks(data.blocks || []);
      }
    } catch (err) {
      console.error('Erro ao buscar timeline:', err);
    } finally {
      setTimelineLoading(false);
    }
  }, [selectedDate]);

  const fetchAvailableRoutines = useCallback(async () => {
    if (!getTeamToken()) return;
    setRoutinesLoading(true);
    try {
      const res = await teamFetch('/team-portal/calendar/routine');
      if (res.ok) {
        const data = await res.json();
        setAvailableRoutines(Array.isArray(data) ? data : []);
      }
    } catch (err) {
      console.error('Erro ao buscar fluxos do líder:', err);
    } finally {
      setRoutinesLoading(false);
    }
  }, []);

  const handleApplyRoutine = async (routineId: number) => {
    setApplyingRoutineId(routineId);
    try {
      const res = await teamFetch(`/team-portal/calendar/timeline/${selectedDate}/apply-routine/${routineId}`, {
        method: 'POST',
      });
      const data = await res.json();
      if (res.ok) {
        await fetchTimeline(selectedDate);
      } else {
        alert(data.detail || data.message || 'Falha ao aplicar fluxo.');
      }
    } catch (err: any) {
      alert(`Erro de conexão ao aplicar fluxo: ${err?.message || err}`);
    } finally {
      setApplyingRoutineId(null);
    }
  };

  const handleApplyAllRoutines = async () => {
    setIsApplyingAllRoutines(true);
    try {
      const res = await teamFetch(`/team-portal/calendar/timeline/${selectedDate}/apply-all-routines`, {
        method: 'POST',
      });
      if (res.ok) {
        const data = await res.json();
        setTimelineBlocks(data.blocks || []);
      } else {
        const data = await res.json();
        alert(data.detail || 'Falha ao carregar fluxos na timeline.');
      }
    } catch (err: any) {
      alert(`Erro de conexão: ${err?.message || err}`);
    } finally {
      setIsApplyingAllRoutines(false);
    }
  };

  const handleCreateManualBlock = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newBlkTitle.trim()) return;
    setIsCreatingBlock(true);
    try {
      const res = await teamFetch(`/team-portal/calendar/timeline/${selectedDate}/blocks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: newBlkTitle.trim(),
          start_time_str: newBlkStart,
          end_time_str: newBlkEnd,
          block_type: 'task',
          notes: newBlkNotes.trim() || undefined,
        }),
      });
      if (res.ok) {
        setIsNewManualBlockModalOpen(false);
        setNewBlkTitle('');
        setNewBlkNotes('');
        await fetchTimeline(selectedDate);
      } else {
        const errData = await res.json();
        alert(errData.detail || 'Erro ao criar bloco manual.');
      }
    } catch (err: any) {
      alert(`Erro de conexão: ${err?.message || err}`);
    } finally {
      setIsCreatingBlock(false);
    }
  };

  const handleOpenEditBlock = (b: TimelineBlock) => {
    setEditingBlock(b);
    setEditBlkTitle(b.title);
    setEditBlkStart(formatMinutesToTime(b.start_minute));
    setEditBlkEnd(formatMinutesToTime(b.end_minute));
    setEditBlkNotes(b.notes || '');
  };

  const handleSaveEditBlock = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingBlock) return;
    setIsUpdatingBlock(true);
    try {
      const body: any = {
        start_time_str: editBlkStart,
        end_time_str: editBlkEnd,
        notes: editBlkNotes.trim() || undefined,
      };
      if (!editingBlock.assigned_by_leader) {
        body.title = editBlkTitle.trim();
      }
      const res = await teamFetch(`/team-portal/calendar/timeline/blocks/${editingBlock.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (res.ok) {
        setEditingBlock(null);
        await fetchTimeline(selectedDate);
      } else {
        const errData = await res.json();
        alert(errData.detail || 'Falha ao atualizar bloco.');
      }
    } catch (err: any) {
      alert(`Erro de conexão: ${err?.message || err}`);
    } finally {
      setIsUpdatingBlock(false);
    }
  };

  const handleDeleteBlock = async (block: TimelineBlock) => {
    if (block.assigned_by_leader) {
      alert('Este bloco é um fluxo diário definido pelo Líder e não pode ser excluído da timeline.\nVocê pode executá-lo, pausá-lo, concluí-lo ou marcá-lo como pulado.');
      return;
    }
    if (!confirm(`Deseja realmente remover o bloco "${block.title}"?`)) return;
    try {
      const res = await teamFetch(`/team-portal/calendar/timeline/blocks/${block.id}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        await fetchTimeline(selectedDate);
      } else {
        const errData = await res.json();
        alert(errData.detail || 'Falha ao excluir bloco.');
      }
    } catch (err: any) {
      alert(`Erro de conexão ao excluir bloco: ${err?.message || err}`);
    }
  };

  const fetchNotesAndContainers = useCallback(async () => {
    if (!getTeamToken()) return;
    setNotesLoading(true);
    try {
      const res = await teamFetch('/team-portal/notes');
      if (res.ok) setNotes(await res.json());
    } catch (err) {
      console.error('Erro ao buscar notas:', err);
    } finally {
      setNotesLoading(false);
    }
  }, []);

  useEffect(() => {
    if (member && getTeamToken()) {
      if (activeTab === 'tasks') fetchTasks();
      if (activeTab === 'timeline') {
        fetchTimeline();
        fetchAvailableRoutines();
      }
      if (activeTab === 'notes') fetchNotesAndContainers();
    }
  }, [member, activeTab, fetchTasks, fetchTimeline, fetchAvailableRoutines, fetchNotesAndContainers]);

  useEffect(() => {
    async function checkCurrentStatus() {
      try {
        const res = await teamFetch('/team-auth/status');
        if (res.ok) {
          const data = await res.json();
          if (data.authorized && data.member) {
            const m: TeamMemberInfo = {
              id: data.member.id,
              username: data.member.username,
              full_name: data.member.display_name,
              role: data.member.role_title || 'Membro',
            };
            setMember(m);
          }
        }
      } catch {
        // Silencia falhas na verificação inicial
      }
    }
    checkCurrentStatus();
  }, []);

  useEffect(() => {
    const handleUnauthorized = () => {
      setMember(null);
    };
    window.addEventListener('synaptix:team-unauthorized', handleUnauthorized);
    return () => window.removeEventListener('synaptix:team-unauthorized', handleUnauthorized);
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError(null);
    setLoginMessage(null);
    setIsLoggingIn(true);
    try {
      const res = await teamLogin(username, password, deviceName || undefined);
      if (res.success && res.member) {
        setMember(res.member);
        if (res.member.must_change_password) {
          setIsPasswordModalOpen(true);
        }
      } else if (res.pending_approval) {
        const msg = typeof res.message === 'string' ? res.message : 'Dispositivo aguardando aprovação do Líder.';
        setLoginMessage(msg);
      } else {
        const msg = typeof res.message === 'string' ? res.message : 'Falha na autenticação.';
        setLoginError(msg);
      }
    } catch (err: any) {
      setLoginError(typeof err?.message === 'string' ? err.message : 'Erro de conexão ao autenticar.');
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleLogout = async () => {
    await teamLogout();
    setMember(null);
    setTasks([]);
    setTimelineBlocks([]);
    setNotes([]);
  };

  // Task actions
  const handleStartTask = async (id: number) => {
    const res = await teamFetch(`/team-portal/tasks/${id}/start`, { method: 'POST' });
    if (res.ok) fetchTasks();
  };

  const handlePauseTask = async (id: number) => {
    const res = await teamFetch(`/team-portal/tasks/${id}/pause`, { method: 'POST' });
    if (res.ok) fetchTasks();
  };

  const handleResetTask = async (id: number) => {
    if (!confirm('Deseja realmente zerar o cronômetro desta demanda?')) return;
    const res = await teamFetch(`/team-portal/tasks/${id}/reset`, { method: 'POST' });
    if (res.ok) fetchTasks();
  };

  const handleCompleteTask = async (id: number) => {
    const res = await teamFetch(`/team-portal/tasks/${id}/complete`, { method: 'POST' });
    if (res.ok) fetchTasks();
  };

  const handleCreatePersonalTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTaskName.trim()) return;
    const res = await teamFetch('/team-portal/tasks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: newTaskName,
        description: newTaskDesc,
        estimated_hours: newTaskHours,
        priority: newTaskPriority,
        category: 'Operacional',
      }),
    });
    if (res.ok) {
      setIsNewTaskModalOpen(false);
      setNewTaskName('');
      setNewTaskDesc('');
      fetchTasks();
    }
  };

  const handleSaveExecutionNotes = async () => {
    if (!editingNotesTaskId) return;
    const res = await teamFetch(`/team-portal/tasks/${editingNotesTaskId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ execution_notes: executionNotesText }),
    });
    if (res.ok) {
      setEditingNotesTaskId(null);
      setExecutionNotesText('');
      fetchTasks();
    }
  };

  // Timeline Block Actions
  const handleToggleChecklist = async (block: TimelineBlock, itemIndex: number) => {
    if (!block.checklist) return;
    const updated = block.checklist.map((item, idx) =>
      idx === itemIndex ? { ...item, done: !item.done } : item
    );
    const res = await teamFetch(`/team-portal/calendar/timeline/blocks/${block.id}/checklist`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ checklist: updated }),
    });
    if (res.ok) {
      const data = await res.json();
      setActiveChecklistBlock(data);
      setTimelineBlocks((prev) => prev.map((b) => (b.id === block.id ? data : b)));
    }
  };

  const handleStartBlock = async (id: number) => {
    const res = await teamFetch(`/team-portal/calendar/timeline/blocks/${id}/start`, { method: 'POST' });
    if (res.ok) fetchTimeline();
  };

  const handleCompleteBlock = async (id: number) => {
    const res = await teamFetch(`/team-portal/calendar/timeline/blocks/${id}/complete`, { method: 'POST' });
    if (res.ok) fetchTimeline();
  };

  // Notes actions
  const handleSaveNote = async () => {
    if (!selectedNote) return;
    const bodyPayload: any = { content: noteEditContent };
    if (!selectedNote.is_team_shared && noteEditTitle.trim()) {
      bodyPayload.title = noteEditTitle.trim();
    }
    const res = await teamFetch(`/team-portal/notes/${selectedNote.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(bodyPayload),
    });
    if (res.ok) {
      const updated = await res.json();
      setSelectedNote(updated);
      setIsEditingNote(false);
      fetchNotesAndContainers();
    } else {
      alert('Falha ao salvar nota.');
    }
  };

  const handleCreatePersonalNote = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newNoteTitle.trim()) return;
    const res = await teamFetch('/team-portal/notes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: newNoteTitle.trim(),
        content: newNoteContent,
        type: 'markdown',
      }),
    });
    if (res.ok) {
      const created = await res.json();
      setIsNewNoteModalOpen(false);
      setNewNoteTitle('');
      setNewNoteContent('');
      await fetchNotesAndContainers();
      setSelectedNote(created);
      setNoteEditContent(created.content);
      setNoteEditTitle(created.title);
      setIsEditingNote(false);
    } else {
      alert('Falha ao criar nota pessoal.');
    }
  };

  const handleDeleteNote = async (noteId: number, title: string) => {
    if (!confirm(`Deseja realmente excluir a nota "${title}"?`)) return;
    const res = await teamFetch(`/team-portal/notes/${noteId}`, { method: 'DELETE' });
    if (res.ok) {
      if (selectedNote?.id === noteId) {
        setSelectedNote(null);
      }
      fetchNotesAndContainers();
    } else {
      alert('Falha ao excluir nota.');
    }
  };

  const handleOpenLinkedPop = (noteId: number) => {
    setSelectedTaskForDetails(null);
    setActiveTab('notes');
    const note = notes.find((n) => n.id === noteId);
    if (note) {
      setSelectedNote(note);
      setNoteEditContent(note.content);
      setNoteEditTitle(note.title);
      setIsEditingNote(false);
    }
  };

  const filteredNotes = notes.filter((n) => {
    if (noteFilter === 'pops' && !n.is_team_shared) return false;
    if (noteFilter === 'personal' && n.is_team_shared) return false;
    if (noteSearch.trim()) {
      const q = noteSearch.toLowerCase();
      const matchTitle = n.title.toLowerCase().includes(q);
      const matchContent = (n.content || '').toLowerCase().includes(q);
      return matchTitle || matchContent;
    }
    return true;
  });

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordError(null);
    setPasswordSuccess(null);
    const res = await teamFetch('/team-auth/change-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ old_password: oldPassword, new_password: newPassword }),
    });
    const data = await res.json();
    if (res.ok) {
      setPasswordSuccess('Senha alterada com sucesso!');
      setTimeout(() => {
        setIsPasswordModalOpen(false);
        setOldPassword('');
        setNewPassword('');
        setPasswordSuccess(null);
      }, 1500);
    } else {
      setPasswordError(data.detail || 'Falha ao alterar senha.');
    }
  };

  // Render Login Card if not authenticated
  if (!member || !getTeamToken()) {
    return (
      <div className="min-h-screen bg-[#070c1b] text-slate-100 flex flex-col items-center justify-center p-4 relative">
        <div className="fixed inset-0 pointer-events-none overflow-hidden -z-10">
          <div className="absolute top-[20%] left-[20%] w-[45vw] h-[45vw] max-w-[500px] rounded-full bg-blue-600/10 blur-[130px]" />
          <div className="absolute bottom-[20%] right-[20%] w-[45vw] h-[45vw] max-w-[500px] rounded-full bg-amber-500/[0.08] blur-[150px]" />
        </div>

        <div className="w-full max-w-md bg-white/[0.03] backdrop-blur-xl border border-white/[0.08] rounded-2xl p-8 shadow-2xl">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 rounded-xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-300">
              <Users size={20} />
            </div>
            <div>
              <h1 className="text-xl font-bold bg-gradient-to-r from-amber-200 to-amber-500 bg-clip-text text-transparent">
                Synaptix Equipe
              </h1>
              <p className="text-xs text-slate-400">Portal Dedicado para Liderados</p>
            </div>
          </div>

          {loginError && (
            <div className="mb-4 p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-2">
              <AlertCircle size={15} className="shrink-0" />
              <span className="break-words">{typeof loginError === 'string' ? loginError : JSON.stringify(loginError)}</span>
            </div>
          )}

          {loginMessage && (
            <div className="mb-4 p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-200 text-xs flex items-center gap-2">
              <Shield size={15} className="shrink-0" />
              <span className="break-words">{typeof loginMessage === 'string' ? loginMessage : JSON.stringify(loginMessage)}</span>
            </div>
          )}

          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">Usuário</label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
                placeholder="ex: ana.silva"
                className="w-full px-3.5 py-2.5 rounded-xl bg-white/[0.04] border border-white/[0.1] text-sm text-slate-200 focus:outline-none focus:border-amber-400/50"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">Senha</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                placeholder="••••••••"
                className="w-full px-3.5 py-2.5 rounded-xl bg-white/[0.04] border border-white/[0.1] text-sm text-slate-200 focus:outline-none focus:border-amber-400/50"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">Nome do Dispositivo (Opcional)</label>
              <input
                type="text"
                value={deviceName}
                onChange={(e) => setDeviceName(e.target.value)}
                placeholder="ex: Notebook Dell Ana"
                className="w-full px-3.5 py-2.5 rounded-xl bg-white/[0.04] border border-white/[0.1] text-sm text-slate-200 focus:outline-none focus:border-amber-400/50"
              />
            </div>

            <button
              type="submit"
              disabled={isLoggingIn}
              className="w-full py-2.5 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 font-bold text-sm shadow-lg shadow-amber-500/20 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {isLoggingIn ? <RefreshCw className="animate-spin" size={16} /> : <Shield size={16} />}
              <span>Entrar no Portal</span>
            </button>
          </form>

          <div className="mt-6 pt-4 border-t border-white/[0.06] text-center">
            <p className="text-[11px] text-slate-500">
              Ambiente 100% isolado com criptografia em repouso e chaves ECDSA por dispositivo.
            </p>
          </div>
        </div>
      </div>
    );
  }

  // Filtered tasks
  const filteredTasks = tasks.filter((t) => {
    if (taskFilter === 'pending' && t.status !== 'pending') return false;
    if (taskFilter === 'in_progress' && t.status !== 'in_progress') return false;
    if (taskFilter === 'completed' && t.status !== 'completed') return false;
    if (taskSearch) {
      const q = taskSearch.toLowerCase();
      return t.name.toLowerCase().includes(q) || (t.category && t.category.toLowerCase().includes(q));
    }
    return true;
  });

  return (
    <div className="min-h-screen bg-[#070c1b] text-slate-100 flex flex-col relative font-sans">
      {/* Ambient background */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden -z-10">
        <div className="absolute top-[-10%] left-[10%] w-[50vw] h-[50vw] max-w-[600px] rounded-full bg-blue-600/10 blur-[140px]" />
        <div className="absolute bottom-[0%] right-[10%] w-[45vw] h-[45vw] max-w-[550px] rounded-full bg-amber-500/[0.07] blur-[150px]" />
      </div>

      {/* Top Bar Portal Equipe */}
      <header className="sticky top-0 z-40 px-6 h-[64px] flex items-center justify-between border-b border-white/[0.08] bg-[#070c1b]/80 backdrop-blur-md">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-400 shadow-[0_0_15px_rgba(234,179,8,0.15)]">
            <Users size={18} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-extrabold text-lg tracking-tight bg-gradient-to-r from-yellow-200 via-amber-300 to-amber-500 bg-clip-text text-transparent">
                Portal da Equipe
              </span>
              <span className="text-[10px] uppercase font-bold px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-300">
                Isolado
              </span>
            </div>
            <p className="text-[11px] text-slate-400 hidden sm:block">
              {member.full_name} ({member.role})
            </p>
          </div>
        </div>

        {/* Tab Pills */}
        <div className="flex items-center gap-1.5 bg-white/[0.04] p-1 rounded-xl border border-white/[0.08]">
          <button
            onClick={() => setActiveTab('tasks')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              activeTab === 'tasks'
                ? 'bg-amber-500/20 text-amber-200 border border-amber-500/40 shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <CheckSquare size={14} />
            <span className="hidden sm:inline">Minhas Demandas</span>
          </button>

          <button
            onClick={() => setActiveTab('timeline')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              activeTab === 'timeline'
                ? 'bg-amber-500/20 text-amber-200 border border-amber-500/40 shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <CalendarDays size={14} />
            <span className="hidden sm:inline">Fluxo Diário & 24h</span>
          </button>

          <button
            onClick={() => setActiveTab('notes')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              activeTab === 'notes'
                ? 'bg-amber-500/20 text-amber-200 border border-amber-500/40 shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <BookOpen size={14} />
            <span className="hidden sm:inline">Notas & POPs</span>
          </button>
        </div>

        {/* User Actions */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => setIsPasswordModalOpen(true)}
            title="Alterar Senha"
            className="p-2 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] text-slate-400 hover:text-slate-200 border border-white/[0.08] transition-all"
          >
            <KeyRound size={16} />
          </button>
          <button
            onClick={handleLogout}
            title="Sair do Portal"
            className="p-2 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 border border-rose-500/30 transition-all"
          >
            <LogOut size={16} />
          </button>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 p-6 max-w-7xl mx-auto w-full">
        {/* ===================== TAB 1: DEMANDAS ===================== */}
        {activeTab === 'tasks' && (
          <div className="space-y-6">
            {/* Header / Filter Toolbar */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4 bg-white/[0.02] p-4 rounded-2xl border border-white/[0.08]">
              <div className="flex items-center gap-2 flex-1">
                <div className="relative flex-1 max-w-md">
                  <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    placeholder="Filtrar demandas por título ou categoria..."
                    value={taskSearch}
                    onChange={(e) => setTaskSearch(e.target.value)}
                    className="w-full pl-9 pr-3 py-2 rounded-xl bg-white/[0.04] border border-white/[0.08] text-xs text-slate-200 focus:outline-none focus:border-amber-400/50"
                  />
                </div>
                <div className="flex items-center gap-1 bg-white/[0.04] p-1 rounded-xl border border-white/[0.08]">
                  {(['all', 'pending', 'in_progress', 'completed'] as const).map((filter) => (
                    <button
                      key={filter}
                      onClick={() => setTaskFilter(filter)}
                      className={`px-2.5 py-1 rounded-lg text-xs font-semibold capitalize transition-all ${
                        taskFilter === filter
                          ? 'bg-amber-500/20 text-amber-200 border border-amber-500/40'
                          : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      {filter === 'all' ? 'Todas' : filter === 'in_progress' ? 'Em Andamento' : filter === 'pending' ? 'Pendentes' : 'Concluídas'}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={fetchTasks}
                  title="Atualizar lista"
                  className="p-2 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] text-slate-300 border border-white/[0.08]"
                >
                  <RefreshCw size={15} className={tasksLoading ? 'animate-spin' : ''} />
                </button>
                <button
                  onClick={() => setIsNewTaskModalOpen(true)}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs shadow-md shadow-amber-500/20 transition-all"
                >
                  <Plus size={15} />
                  <span>Nova Demanda Própria</span>
                </button>
              </div>
            </div>

            {/* Task Grid */}
            {tasksLoading ? (
              <div className="py-20 text-center text-slate-400">
                <RefreshCw size={24} className="animate-spin mx-auto mb-2 text-amber-400" />
                <p className="text-xs">Carregando suas demandas...</p>
              </div>
            ) : filteredTasks.length === 0 ? (
              <div className="py-20 text-center text-slate-500 bg-white/[0.01] rounded-2xl border border-white/[0.06]">
                <CheckSquare size={36} className="mx-auto mb-2 opacity-40" />
                <p className="text-sm font-medium">Nenhuma demanda encontrada no filtro selecionado.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {filteredTasks.map((t) => {
                  const isRunning = t.timer_status === 'running';
                  return (
                    <div
                      key={t.id}
                      className={`relative flex flex-col justify-between p-5 rounded-2xl border transition-all ${
                        isRunning
                          ? 'bg-amber-500/[0.06] border-amber-500/40 shadow-[0_0_20px_rgba(234,179,8,0.1)]'
                          : t.status === 'completed'
                          ? 'bg-white/[0.01] border-white/[0.05] opacity-75'
                          : 'bg-white/[0.02] border-white/[0.08] hover:border-white/[0.15]'
                      }`}
                    >
                      <div>
                        {/* Tags / Header */}
                        <div className="flex items-center justify-between gap-2 mb-2">
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-white/[0.06] text-slate-300 border border-white/[0.08]">
                            {t.category || 'Geral'}
                          </span>

                          <div className="flex items-center gap-1.5">
                            {t.priority && (
                              <span
                                className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                                  t.priority === 'Alta' || t.priority === 'Crítica'
                                    ? 'bg-rose-500/15 border-rose-500/30 text-rose-300'
                                    : t.priority === 'Média'
                                    ? 'bg-amber-500/15 border-amber-500/30 text-amber-300'
                                    : 'bg-slate-500/15 border-slate-500/30 text-slate-400'
                                }`}
                              >
                                {t.priority}
                              </span>
                            )}
                            {t.assigned_by_leader && (
                              <span
                                title="Demanda atribuída pelo Líder (escopo fixado)"
                                className="flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-500/15 border border-amber-500/30 text-amber-300"
                              >
                                <Lock size={10} />
                                <span>Líder</span>
                              </span>
                            )}
                            <span
                              className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                                t.status === 'completed'
                                  ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                                  : isRunning
                                  ? 'bg-amber-500/20 border-amber-500/50 text-amber-300 animate-pulse'
                                  : 'bg-slate-500/10 border-slate-500/20 text-slate-400'
                              }`}
                            >
                              {t.status === 'completed'
                                ? 'Concluída'
                                : isRunning
                                ? 'Em Andamento'
                                : 'Pendente'}
                            </span>
                          </div>
                        </div>

                        {/* Title & Desc Clickable Area */}
                        <div
                          onClick={() => setSelectedTaskForDetails(t)}
                          className="cursor-pointer group mb-3"
                          title="Clique para ver todas as instruções desta demanda"
                        >
                          <h3 className="font-bold text-sm text-slate-100 group-hover:text-amber-300 transition-colors flex items-center justify-between gap-1 mb-1.5">
                            <span>{t.name}</span>
                            <ChevronRight size={14} className="text-slate-500 group-hover:text-amber-400 group-hover:translate-x-0.5 transition-all shrink-0" />
                          </h3>

                          {t.description ? (
                            <div>
                              <p className="text-xs text-slate-400 line-clamp-3 leading-relaxed mb-1.5">
                                {t.description}
                              </p>
                              <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-400/90 hover:text-amber-300">
                                <Eye size={12} />
                                <span>Ver instruções completas</span>
                              </span>
                            </div>
                          ) : (
                            <p className="text-xs text-slate-500 italic">Sem descrição detalhada.</p>
                          )}
                        </div>

                        {/* Linked Note / POP indicator */}
                        {t.linked_note_id && (
                          <button
                            type="button"
                            onClick={() => handleOpenLinkedPop(t.linked_note_id!)}
                            className="w-full flex items-center justify-between gap-1.5 text-[11px] text-amber-300 mb-3 bg-amber-500/[0.08] hover:bg-amber-500/[0.15] p-2 rounded-xl border border-amber-500/25 transition-all text-left"
                          >
                            <div className="flex items-center gap-1.5 truncate">
                              <FileText size={12} className="text-amber-400 shrink-0" />
                              <span className="truncate">Consultar POP Vinculado</span>
                            </div>
                            <ChevronRight size={12} className="shrink-0 text-amber-400" />
                          </button>
                        )}
                      </div>

                      {/* Footer: Timer and Actions */}
                      <div className="pt-3 border-t border-white/[0.06] space-y-3">
                        <div className="flex items-center justify-between text-xs text-slate-400">
                          <div className="flex items-center gap-1">
                            <Clock size={13} className="text-amber-400" />
                            <span className="font-mono font-bold text-slate-200">
                              {formatSeconds(t.time_spent_seconds)}
                            </span>
                          </div>
                          <span>Est: {t.estimated_hours}h</span>
                        </div>

                        {/* Controls */}
                        <div className="flex items-center gap-1.5">
                          {isRunning ? (
                            <button
                              onClick={() => handlePauseTask(t.id)}
                              className="flex-1 py-1.5 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 text-amber-200 border border-amber-500/40 text-xs font-bold flex items-center justify-center gap-1 transition-all"
                            >
                              <Pause size={13} />
                              <span>Pausar</span>
                            </button>
                          ) : (
                            <button
                              onClick={() => handleStartTask(t.id)}
                              className="flex-1 py-1.5 rounded-xl bg-white/[0.05] hover:bg-white/[0.1] text-slate-200 border border-white/[0.1] text-xs font-bold flex items-center justify-center gap-1 transition-all"
                            >
                              <Play size={13} className="text-emerald-400" />
                              <span>Iniciar</span>
                            </button>
                          )}

                          <button
                            onClick={() => handleResetTask(t.id)}
                            title="Zerar Cronômetro"
                            className="p-2 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] text-slate-400 hover:text-slate-200 border border-white/[0.08]"
                          >
                            <RotateCcw size={13} />
                          </button>

                          {t.status !== 'completed' && (
                            <button
                              onClick={() => handleCompleteTask(t.id)}
                              title="Marcar como Concluída"
                              className="p-2 rounded-xl bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-300 border border-emerald-500/30"
                            >
                              <CheckCircle2 size={13} />
                            </button>
                          )}

                          <button
                            onClick={() => setSelectedTaskForDetails(t)}
                            title="Ver instruções completas e relatório"
                            className="p-2 rounded-xl bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 border border-amber-500/30 transition-all flex items-center gap-1 text-xs font-semibold"
                          >
                            <Eye size={13} />
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ===================== TAB 2: FLUXO DIÁRIO & TIMELINE ===================== */}
        {activeTab === 'timeline' && (
          <div className="space-y-6">
            {/* Timeline Toolbar */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4 bg-white/[0.02] p-4 rounded-2xl border border-white/[0.08]">
              <div className="flex items-center gap-3">
                <input
                  type="date"
                  value={selectedDate}
                  onChange={(e) => {
                    setSelectedDate(e.target.value);
                    fetchTimeline(e.target.value);
                  }}
                  className="px-3 py-2 rounded-xl bg-white/[0.04] border border-white/[0.08] text-xs text-slate-200 focus:outline-none focus:border-amber-400/50"
                />
                <button
                  onClick={() => {
                    setSelectedDate(todayStr);
                    fetchTimeline(todayStr);
                  }}
                  className="px-3 py-2 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] text-xs font-semibold text-slate-300 border border-white/[0.08]"
                >
                  Hoje
                </button>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  onClick={() => {
                    fetchTimeline(selectedDate);
                    fetchAvailableRoutines();
                  }}
                  title="Atualizar timeline e fluxos"
                  className="p-2 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] text-slate-300 border border-white/[0.08]"
                >
                  <RefreshCw size={15} className={timelineLoading || routinesLoading ? 'animate-spin' : ''} />
                </button>

                <button
                  onClick={() => setIsRoutinesDrawerOpen(true)}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white/[0.05] hover:bg-white/[0.1] text-amber-300 border border-amber-500/30 text-xs font-semibold transition-all"
                  title="Ver catálogo de fluxos configurados pelo líder"
                >
                  <ListChecks size={14} />
                  <span>Fluxos do Líder ({availableRoutines.length})</span>
                </button>

                <button
                  onClick={() => setIsNewManualBlockModalOpen(true)}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white/[0.05] hover:bg-white/[0.1] text-slate-200 border border-white/[0.1] text-xs font-semibold transition-all"
                >
                  <Plus size={14} />
                  <span>+ Novo Bloco</span>
                </button>

                <button
                  onClick={handleApplyAllRoutines}
                  disabled={isApplyingAllRoutines}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 font-bold text-xs shadow-md shadow-amber-500/20 transition-all disabled:opacity-50"
                >
                  <Sparkles size={14} className={isApplyingAllRoutines ? 'animate-spin' : ''} />
                  <span>{isApplyingAllRoutines ? 'Carregando...' : 'Carregar Meus Fluxos'}</span>
                </button>
              </div>
            </div>

            {/* Timeline Blocks */}
            {timelineLoading ? (
              <div className="py-20 text-center text-slate-400">
                <RefreshCw size={24} className="animate-spin mx-auto mb-2 text-amber-400" />
                <p className="text-xs">Carregando timeline diária...</p>
              </div>
            ) : timelineBlocks.length === 0 ? (
              <div className="py-20 text-center text-slate-500 bg-white/[0.01] rounded-2xl border border-white/[0.06] p-6">
                <CalendarDays size={36} className="mx-auto mb-2 opacity-40" />
                <p className="text-sm font-medium mb-1 text-slate-300">Nenhum bloco agendado para esta data.</p>
                <p className="text-xs text-slate-500 mb-6 max-w-md mx-auto">
                  Você pode carregar automaticamente os fluxos diários definidos pelo seu Líder ou registrar blocos de tarefas manuais conforme sua conveniência.
                </p>
                <div className="flex flex-wrap items-center justify-center gap-3">
                  <button
                    onClick={handleApplyAllRoutines}
                    disabled={isApplyingAllRoutines}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-bold shadow-md shadow-amber-500/20 transition-all disabled:opacity-50"
                  >
                    <Sparkles size={14} />
                    <span>Carregar Meus Fluxos na Timeline</span>
                  </button>
                  <button
                    onClick={() => setIsNewManualBlockModalOpen(true)}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-white/[0.06] hover:bg-white/[0.1] text-slate-200 border border-white/[0.1] text-xs font-semibold transition-all"
                  >
                    <Plus size={14} />
                    <span>Adicionar Bloco Manual</span>
                  </button>
                  <button
                    onClick={() => setIsRoutinesDrawerOpen(true)}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-white/[0.03] hover:bg-white/[0.06] text-amber-300 border border-amber-500/20 text-xs font-semibold transition-all"
                  >
                    <ListChecks size={14} />
                    <span>Ver Fluxos do Líder ({availableRoutines.length})</span>
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                {timelineBlocks.map((b) => {
                  const checklist = b.checklist || [];
                  const doneCount = checklist.filter((i) => i.done).length;
                  const totalCount = checklist.length;

                  return (
                    <div
                      key={b.id}
                      className="flex flex-col sm:flex-row items-start sm:items-center justify-between p-4 rounded-2xl bg-white/[0.02] border border-white/[0.08] hover:border-white/[0.12] transition-all gap-4"
                    >
                      <div className="flex items-start sm:items-center gap-4 flex-1 min-w-0">
                        {/* Time Badge */}
                        <div className="w-24 shrink-0 text-center py-1.5 rounded-xl bg-white/[0.04] border border-white/[0.08]">
                          <span className="font-mono text-xs font-bold text-amber-300">
                            {formatMinutesToTime(b.start_minute)} - {formatMinutesToTime(b.end_minute)}
                          </span>
                        </div>

                        {/* Title and details */}
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <h4 className="font-bold text-sm text-slate-100 truncate">{b.title}</h4>
                            {b.assigned_by_leader ? (
                              <span
                                title="Fluxo diário atribuído pelo Líder (fixo na jornada)"
                                className="flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-500/15 border border-amber-500/30 text-amber-300"
                              >
                                <Lock size={10} />
                                <span>Fluxo Líder</span>
                              </span>
                            ) : (
                              <span
                                title="Bloco criado manualmente por você"
                                className="flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-500/15 border border-slate-500/30 text-slate-300"
                              >
                                <span>Manual</span>
                              </span>
                            )}
                            <span
                              className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                                b.status === 'completed'
                                  ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                                  : b.status === 'in_progress'
                                  ? 'bg-amber-500/20 border-amber-500/40 text-amber-300 animate-pulse'
                                  : 'bg-slate-500/10 border-slate-500/20 text-slate-400'
                              }`}
                            >
                              {b.status === 'completed' ? 'Concluído' : b.status === 'in_progress' ? 'Em Andamento' : 'Planejado'}
                            </span>
                          </div>

                          {b.notes && <p className="text-xs text-slate-400 mt-1 line-clamp-2">{b.notes}</p>}

                          {/* Checklist button / status */}
                          {totalCount > 0 && (
                            <button
                              onClick={() => setActiveChecklistBlock(b)}
                              className="mt-2 flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-lg bg-indigo-500/10 border border-indigo-500/30 text-indigo-300 hover:bg-indigo-500/20 transition-all"
                            >
                              <ListChecks size={13} />
                              <span>
                                Checklist ({doneCount}/{totalCount})
                              </span>
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Block Controls */}
                      <div className="flex items-center gap-1.5 self-end sm:self-center shrink-0">
                        {b.status !== 'completed' && (
                          <>
                            <button
                              onClick={() => handleStartBlock(b.id)}
                              className="p-2 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] text-emerald-300 border border-white/[0.08]"
                              title="Iniciar execução do bloco"
                            >
                              <Play size={14} />
                            </button>
                            <button
                              onClick={() => handleCompleteBlock(b.id)}
                              className="p-2 rounded-xl bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-300 border border-emerald-500/30"
                              title="Concluir bloco"
                            >
                              <CheckCircle2 size={14} />
                            </button>
                          </>
                        )}

                        <button
                          onClick={() => handleOpenEditBlock(b)}
                          className="p-2 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] text-slate-300 hover:text-amber-300 border border-white/[0.08] transition-all"
                          title="Editar horário e notas do bloco"
                        >
                          <Pencil size={14} />
                        </button>

                        <button
                          onClick={() => handleDeleteBlock(b)}
                          disabled={b.assigned_by_leader}
                          className={`p-2 rounded-xl border transition-all ${
                            b.assigned_by_leader
                              ? 'bg-white/[0.02] border-white/[0.04] text-slate-600 cursor-not-allowed opacity-40'
                              : 'bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 border-rose-500/30'
                          }`}
                          title={b.assigned_by_leader ? "Fluxo atribuído pelo Líder não pode ser excluído" : "Excluir bloco manual"}
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ===================== TAB 3: NOTAS & POPS ===================== */}
        {activeTab === 'notes' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 min-h-[650px]">
            {/* Notes List Column (4 cols on lg) */}
            <div className="lg:col-span-4 flex flex-col space-y-3 bg-white/[0.02] border border-white/[0.08] rounded-2xl p-4">
              {/* Header & Create Note */}
              <div className="flex items-center justify-between pb-3 border-b border-white/[0.06]">
                <div>
                  <h3 className="font-bold text-sm text-slate-100 flex items-center gap-1.5">
                    <BookOpen size={16} className="text-amber-400" />
                    <span>Notas & POPs da Equipe</span>
                  </h3>
                  <p className="text-[11px] text-slate-400">Totalmente isoladas e em Markdown</p>
                </div>
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={fetchNotesAndContainers}
                    title="Atualizar notas"
                    className="p-1.5 rounded-lg bg-white/[0.04] hover:bg-white/[0.08] text-slate-400 hover:text-slate-200"
                  >
                    <RefreshCw size={13} className={notesLoading ? 'animate-spin' : ''} />
                  </button>
                  <button
                    onClick={() => {
                      setNewNoteTitle('');
                      setNewNoteContent('');
                      setNewNoteMode('edit');
                      setIsNewNoteModalOpen(true);
                    }}
                    title="Criar nova nota pessoal"
                    className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-bold shadow-sm shadow-amber-500/20 transition-all"
                  >
                    <Plus size={13} />
                    <span>Nova Nota</span>
                  </button>
                </div>
              </div>

              {/* Search Bar */}
              <div className="relative">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                <input
                  type="text"
                  placeholder="Filtrar notas ou POPs..."
                  value={noteSearch}
                  onChange={(e) => setNoteSearch(e.target.value)}
                  className="w-full pl-8 pr-3 py-1.5 rounded-xl bg-white/[0.03] border border-white/[0.08] text-xs text-slate-200 focus:outline-none focus:border-amber-400/50"
                />
              </div>

              {/* Filter Pills */}
              <div className="flex items-center gap-1 p-1 bg-white/[0.02] rounded-xl border border-white/[0.05]">
                {(['all', 'pops', 'personal'] as const).map((f) => (
                  <button
                    key={f}
                    onClick={() => setNoteFilter(f)}
                    className={`flex-1 py-1 rounded-lg text-[11px] font-semibold transition-all ${
                      noteFilter === f
                        ? 'bg-amber-500/20 text-amber-200 border border-amber-500/40'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    {f === 'all' ? 'Todas' : f === 'pops' ? 'POPs da Equipe' : 'Minhas Notas'}
                  </button>
                ))}
              </div>

              {/* Note Cards List */}
              <div className="flex-1 overflow-y-auto space-y-2 pr-1 max-h-[500px]">
                {filteredNotes.length === 0 ? (
                  <div className="py-12 text-center text-slate-500">
                    <BookOpen size={28} className="mx-auto mb-1.5 opacity-40" />
                    <p className="text-xs">Nenhuma nota encontrada no filtro.</p>
                  </div>
                ) : (
                  filteredNotes.map((n) => {
                    const isSelected = selectedNote?.id === n.id;
                    return (
                      <div
                        key={n.id}
                        onClick={() => {
                          setSelectedNote(n);
                          setNoteEditContent(n.content);
                          setNoteEditTitle(n.title);
                          setIsEditingNote(false);
                          setNoteEditorViewMode('edit');
                        }}
                        className={`group relative p-3 rounded-xl border transition-all cursor-pointer ${
                          isSelected
                            ? 'bg-amber-500/15 border-amber-500/40 text-amber-200 shadow-sm'
                            : 'bg-white/[0.02] border-white/[0.06] hover:border-white/[0.14] text-slate-300'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2 mb-1">
                          <span className="font-semibold text-xs truncate">{n.title}</span>
                          <div className="flex items-center gap-1 shrink-0">
                            {n.is_team_shared ? (
                              <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-blue-500/15 border border-blue-500/30 text-blue-300 font-semibold">
                                POP Equipe
                              </span>
                            ) : (
                              <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-amber-500/15 border border-amber-500/30 text-amber-300 font-semibold">
                                Minha Nota
                              </span>
                            )}
                            {!n.is_team_shared && (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleDeleteNote(n.id, n.title);
                                }}
                                title="Excluir nota pessoal"
                                className="p-1 rounded opacity-0 group-hover:opacity-100 hover:bg-rose-500/20 text-slate-400 hover:text-rose-300 transition-all"
                              >
                                <Trash2 size={12} />
                              </button>
                            )}
                          </div>
                        </div>
                        <p className="text-[11px] text-slate-500 line-clamp-2">
                          {n.content.replace(/<[^>]*>?/gm, '').replace(/[#*`_~-]/g, '') || 'Sem conteúdo'}
                        </p>
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            {/* Note Viewer / Editor Column (8 cols on lg) */}
            <div className="lg:col-span-8 bg-white/[0.02] border border-white/[0.08] rounded-2xl p-6 flex flex-col justify-between min-h-[600px]">
              {selectedNote ? (
                <div className="flex-1 flex flex-col">
                  {/* Top Note Header */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-white/[0.08] mb-4">
                    <div className="flex-1">
                      {isEditingNote && !selectedNote.is_team_shared ? (
                        <input
                          type="text"
                          value={noteEditTitle}
                          onChange={(e) => setNoteEditTitle(e.target.value)}
                          placeholder="Título da Nota..."
                          className="w-full text-lg font-bold text-slate-100 bg-white/[0.04] border border-white/[0.1] px-3 py-1.5 rounded-xl focus:outline-none focus:border-amber-400/50 mb-1"
                        />
                      ) : (
                        <h2 className="text-xl font-bold text-slate-100 mb-1">{selectedNote.title}</h2>
                      )}

                      <div className="flex flex-wrap items-center gap-2">
                        {selectedNote.is_team_shared ? (
                          <span className="text-[11px] font-semibold px-2.5 py-0.5 rounded-full bg-blue-500/15 border border-blue-500/30 text-blue-300 flex items-center gap-1">
                            <BookOpen size={11} />
                            <span>
                              {selectedNote.allow_member_edit
                                ? 'POP da Equipe (Edição Permitida)'
                                : 'POP da Equipe (Somente Leitura do Líder)'}
                            </span>
                          </span>
                        ) : (
                          <span className="text-[11px] font-semibold px-2.5 py-0.5 rounded-full bg-amber-500/15 border border-amber-500/30 text-amber-300 flex items-center gap-1">
                            <Lock size={11} />
                            <span>Minha Nota Pessoal (Cofre da Equipe Isolado)</span>
                          </span>
                        )}
                        <span className="text-[11px] text-slate-500 font-mono">
                          Markdown Suportado
                        </span>
                      </div>
                    </div>

                    {/* Actions on Top Right */}
                    <div className="flex items-center gap-2 shrink-0">
                      {isEditingNote ? (
                        <div className="flex items-center gap-2">
                          {/* Mode Switcher */}
                          <div className="flex items-center gap-1 p-1 bg-white/[0.03] rounded-xl border border-white/[0.08]">
                            <button
                              type="button"
                              onClick={() => setNoteEditorViewMode('edit')}
                              className={`px-2.5 py-1 rounded-lg text-xs font-semibold flex items-center gap-1 ${
                                noteEditorViewMode === 'edit'
                                  ? 'bg-amber-500/20 text-amber-200 border border-amber-500/40'
                                  : 'text-slate-400 hover:text-slate-200'
                              }`}
                            >
                              <Code size={12} />
                              <span>Editor</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => setNoteEditorViewMode('preview')}
                              className={`px-2.5 py-1 rounded-lg text-xs font-semibold flex items-center gap-1 ${
                                noteEditorViewMode === 'preview'
                                  ? 'bg-amber-500/20 text-amber-200 border border-amber-500/40'
                                  : 'text-slate-400 hover:text-slate-200'
                              }`}
                            >
                              <Eye size={12} />
                              <span>Prévia</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => setNoteEditorViewMode('split')}
                              className={`hidden md:flex px-2.5 py-1 rounded-lg text-xs font-semibold items-center gap-1 ${
                                noteEditorViewMode === 'split'
                                  ? 'bg-amber-500/20 text-amber-200 border border-amber-500/40'
                                  : 'text-slate-400 hover:text-slate-200'
                              }`}
                            >
                              <Columns size={12} />
                              <span>Lado a Lado</span>
                            </button>
                          </div>

                          <button
                            type="button"
                            onClick={() => setIsEditingNote(false)}
                            className="px-3 py-1.5 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] text-xs font-semibold text-slate-300"
                          >
                            Cancelar
                          </button>
                          <button
                            type="button"
                            onClick={handleSaveNote}
                            className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs shadow-md shadow-amber-500/20"
                          >
                            <Save size={13} />
                            <span>Salvar Alterações</span>
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2">
                          {(!selectedNote.is_team_shared || selectedNote.allow_member_edit) && (
                            <button
                              type="button"
                              onClick={() => {
                                setNoteEditTitle(selectedNote.title);
                                setNoteEditContent(selectedNote.content);
                                setIsEditingNote(true);
                                setNoteEditorViewMode('edit');
                              }}
                              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 border border-amber-500/30 text-xs font-semibold transition-all"
                            >
                              <Pencil size={12} />
                              <span>Editar em Markdown</span>
                            </button>
                          )}
                          {!selectedNote.is_team_shared && (
                            <button
                              type="button"
                              onClick={() => handleDeleteNote(selectedNote.id, selectedNote.title)}
                              className="p-1.5 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 border border-rose-500/30"
                              title="Excluir nota pessoal"
                            >
                              <Trash2 size={14} />
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Note Content Area */}
                  {isEditingNote ? (
                    <div className="flex-1 flex flex-col rounded-2xl border border-white/[0.08] bg-[#070c1b] overflow-hidden">
                      {/* Formatting Toolbar */}
                      <MarkdownToolbar
                        textareaRef={editNoteTextareaRef}
                        content={noteEditContent}
                        onChange={setNoteEditContent}
                      />

                      {/* Editor / Preview Content Body */}
                      <div className="flex-1 min-h-[420px] flex">
                        {(noteEditorViewMode === 'edit' || noteEditorViewMode === 'split') && (
                          <div className={`flex-1 flex flex-col ${noteEditorViewMode === 'split' ? 'border-r border-white/[0.08]' : ''}`}>
                            <textarea
                              ref={editNoteTextareaRef}
                              value={noteEditContent}
                              onChange={(e) => setNoteEditContent(e.target.value)}
                              placeholder="Escreva aqui o conteúdo em Markdown... (use títulos com #, listas com -, tabelas, etc.)"
                              className="w-full flex-1 p-4 bg-transparent text-slate-100 font-mono text-xs sm:text-sm resize-none focus:outline-none leading-relaxed"
                            />
                          </div>
                        )}

                        {(noteEditorViewMode === 'preview' || noteEditorViewMode === 'split') && (
                          <div className="flex-1 p-5 overflow-y-auto bg-white/[0.01]">
                            <div className="text-[10px] uppercase font-bold text-slate-500 mb-2 tracking-wider">
                              Prévia em Tempo Real
                            </div>
                            <MarkdownRenderer content={noteEditContent || '*Nenhum conteúdo para pré-visualizar.*'} />
                          </div>
                        )}
                      </div>
                    </div>
                  ) : (
                    /* Note Reading Mode (Markdown Native) */
                    <div className="flex-1 bg-[#070c1b] p-6 rounded-2xl border border-white/[0.06] overflow-y-auto max-h-[600px]">
                      <MarkdownRenderer content={selectedNote.content || '*Esta nota não possui conteúdo.*'} />
                    </div>
                  )}
                </div>
              ) : (
                <div className="m-auto text-center text-slate-500 py-16">
                  <BookOpen size={42} className="mx-auto mb-3 opacity-30 text-amber-400" />
                  <h4 className="text-base font-bold text-slate-300 mb-1">Cofre de Notas & POPs</h4>
                  <p className="text-xs text-slate-500 max-w-sm mx-auto">
                    Selecione um POP oficial publicado pelo Líder ou crie suas próprias anotações em Markdown.
                  </p>
                </div>
              )}
            </div>
          </div>
        )}
      </main>

      {/* ===================== CHECKLIST DRAWER / MODAL ===================== */}
      {activeChecklistBlock && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-lg bg-[#0d1428] border border-white/[0.1] rounded-2xl p-6 shadow-2xl">
            <div className="flex items-center justify-between pb-4 border-b border-white/[0.06] mb-4">
              <div>
                <h3 className="font-bold text-base text-slate-100 flex items-center gap-2">
                  <ListChecks size={18} className="text-amber-400" />
                  <span>Checklist do Fluxo: {activeChecklistBlock.title}</span>
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Marque cada etapa conforme executada.
                </p>
              </div>
              <button
                onClick={() => setActiveChecklistBlock(null)}
                className="p-1.5 rounded-lg bg-white/[0.04] text-slate-400 hover:text-slate-200"
              >
                <X size={16} />
              </button>
            </div>

            <div className="space-y-2 max-h-[60vh] overflow-y-auto pr-1">
              {activeChecklistBlock.checklist?.map((item, idx) => (
                <button
                  key={item.id}
                  onClick={() => handleToggleChecklist(activeChecklistBlock, idx)}
                  className={`w-full flex items-center gap-3 p-3.5 rounded-xl border text-left transition-all ${
                    item.done
                      ? 'bg-emerald-500/[0.08] border-emerald-500/30 text-emerald-200'
                      : 'bg-white/[0.02] border-white/[0.06] hover:border-white/[0.12] text-slate-300'
                  }`}
                >
                  <div
                    className={`w-5 h-5 rounded-lg border flex items-center justify-center transition-all ${
                      item.done
                        ? 'bg-emerald-500 border-emerald-400 text-slate-950 font-bold'
                        : 'border-white/[0.2] bg-white/[0.04]'
                    }`}
                  >
                    {item.done && <Check size={13} />}
                  </div>
                  <span className={`text-xs ${item.done ? 'line-through opacity-70' : 'font-medium'}`}>
                    {item.text}
                  </span>
                </button>
              ))}
            </div>

            <div className="mt-6 pt-4 border-t border-white/[0.06] flex justify-end">
              <button
                onClick={() => setActiveChecklistBlock(null)}
                className="px-4 py-2 rounded-xl bg-amber-500 text-slate-950 font-bold text-xs"
              >
                Concluir Visualização
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ===================== MODAL DE DEMANDA PRÓPRIA ===================== */}
      {isNewTaskModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-md bg-[#0d1428] border border-white/[0.1] rounded-2xl p-6 shadow-2xl">
            <div className="flex items-center justify-between pb-4 border-b border-white/[0.06] mb-4">
              <h3 className="font-bold text-base text-slate-100">Criar Demanda Própria</h3>
              <button
                onClick={() => setIsNewTaskModalOpen(false)}
                className="p-1.5 rounded-lg bg-white/[0.04] text-slate-400 hover:text-slate-200"
              >
                <X size={16} />
              </button>
            </div>

            <form onSubmit={handleCreatePersonalTask} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Título da Demanda</label>
                <input
                  type="text"
                  required
                  placeholder="ex: Elaborar relatório semanal"
                  value={newTaskName}
                  onChange={(e) => setNewTaskName(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-white/[0.04] border border-white/[0.1] text-xs text-slate-200 focus:outline-none focus:border-amber-400/50"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Descrição (Opcional)</label>
                <textarea
                  rows={3}
                  placeholder="Detalhes ou passos da execução..."
                  value={newTaskDesc}
                  onChange={(e) => setNewTaskDesc(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-white/[0.04] border border-white/[0.1] text-xs text-slate-200 focus:outline-none focus:border-amber-400/50"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">Horas Estimadas</label>
                  <input
                    type="number"
                    step="0.5"
                    min="0.5"
                    max="100"
                    value={newTaskHours}
                    onChange={(e) => setNewTaskHours(parseFloat(e.target.value) || 1)}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-white/[0.04] border border-white/[0.1] text-xs text-slate-200 focus:outline-none focus:border-amber-400/50"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">Prioridade</label>
                  <select
                    value={newTaskPriority}
                    onChange={(e) => setNewTaskPriority(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-white/[0.04] border border-white/[0.1] text-xs text-slate-200 focus:outline-none focus:border-amber-400/50"
                  >
                    <option value="Baixa" className="bg-[#0d1428]">Baixa</option>
                    <option value="Média" className="bg-[#0d1428]">Média</option>
                    <option value="Alta" className="bg-[#0d1428]">Alta</option>
                    <option value="Crítica" className="bg-[#0d1428]">Crítica</option>
                  </select>
                </div>
              </div>

              <div className="pt-4 border-t border-white/[0.06] flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsNewTaskModalOpen(false)}
                  className="px-4 py-2 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] text-xs font-semibold text-slate-300"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl bg-amber-500 text-slate-950 font-bold text-xs shadow-md shadow-amber-500/20"
                >
                  Criar Demanda
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ===================== MODAL DE RELATÓRIO DE EXECUÇÃO ===================== */}
      {editingNotesTaskId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-md bg-[#0d1428] border border-white/[0.1] rounded-2xl p-6 shadow-2xl">
            <div className="flex items-center justify-between pb-4 border-b border-white/[0.06] mb-4">
              <h3 className="font-bold text-base text-slate-100 flex items-center gap-2">
                <FileText size={18} className="text-blue-400" />
                <span>Relatório / Notas de Execução</span>
              </h3>
              <button
                onClick={() => setEditingNotesTaskId(null)}
                className="p-1.5 rounded-lg bg-white/[0.04] text-slate-400 hover:text-slate-200"
              >
                <X size={16} />
              </button>
            </div>

            <div className="space-y-4">
              <p className="text-xs text-slate-400">
                Escreva apontamentos sobre o andamento, bloqueios ou entregáveis desta demanda. O Líder poderá visualizar este relatório.
              </p>
              <textarea
                rows={5}
                value={executionNotesText}
                onChange={(e) => setExecutionNotesText(e.target.value)}
                placeholder="ex: Concluída etapa 1. Aguardando retorno do cliente..."
                className="w-full p-3.5 rounded-xl bg-white/[0.04] border border-white/[0.1] text-xs text-slate-200 focus:outline-none focus:border-amber-400/50"
              />
              <div className="pt-4 border-t border-white/[0.06] flex justify-end gap-2">
                <button
                  onClick={() => setEditingNotesTaskId(null)}
                  className="px-4 py-2 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] text-xs font-semibold text-slate-300"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleSaveExecutionNotes}
                  className="px-4 py-2 rounded-xl bg-amber-500 text-slate-950 font-bold text-xs shadow-md shadow-amber-500/20"
                >
                  Salvar Relatório
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ===================== MODAL DE ALTERAÇÃO DE SENHA ===================== */}
      {isPasswordModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-sm bg-[#0d1428] border border-white/[0.1] rounded-2xl p-6 shadow-2xl">
            <div className="flex items-center justify-between pb-4 border-b border-white/[0.06] mb-4">
              <h3 className="font-bold text-base text-slate-100 flex items-center gap-2">
                <KeyRound size={18} className="text-amber-400" />
                <span>Alterar Minha Senha</span>
              </h3>
              {!member.must_change_password && (
                <button
                  onClick={() => setIsPasswordModalOpen(false)}
                  className="p-1.5 rounded-lg bg-white/[0.04] text-slate-400 hover:text-slate-200"
                >
                  <X size={16} />
                </button>
              )}
            </div>

            {passwordError && (
              <div className="mb-4 p-2.5 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs break-words">
                {typeof passwordError === 'string' ? passwordError : JSON.stringify(passwordError)}
              </div>
            )}
            {passwordSuccess && (
              <div className="mb-4 p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs">
                {passwordSuccess}
              </div>
            )}

            <form onSubmit={handleChangePassword} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Senha Atual</label>
                <input
                  type="password"
                  required
                  value={oldPassword}
                  onChange={(e) => setOldPassword(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-white/[0.04] border border-white/[0.1] text-xs text-slate-200 focus:outline-none focus:border-amber-400/50"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Nova Senha</label>
                <input
                  type="password"
                  required
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Mínimo 8 caracteres"
                  className="w-full px-3.5 py-2.5 rounded-xl bg-white/[0.04] border border-white/[0.1] text-xs text-slate-200 focus:outline-none focus:border-amber-400/50"
                />
              </div>

              <button
                type="submit"
                className="w-full py-2.5 rounded-xl bg-amber-500 text-slate-950 font-bold text-xs shadow-md shadow-amber-500/20"
              >
                Atualizar Senha
              </button>
            </form>
          </div>
        </div>
      )}

      {/* ===================== MODAL / DRAWER: FLUXOS DO LÍDER ===================== */}
      {isRoutinesDrawerOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-2xl bg-[#0d1428] border border-white/[0.1] rounded-2xl p-6 shadow-2xl flex flex-col max-h-[85vh]">
            <div className="flex items-center justify-between pb-4 border-b border-white/[0.06] mb-4">
              <div>
                <h3 className="font-bold text-base text-slate-100 flex items-center gap-2">
                  <ListChecks size={18} className="text-amber-400" />
                  <span>Fluxos Diários Definidos pelo Líder</span>
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Estes são os processos padrão e rotinas configurados pela liderança para o seu perfil e equipe.
                </p>
              </div>
              <button
                onClick={() => setIsRoutinesDrawerOpen(false)}
                className="p-1.5 rounded-lg bg-white/[0.04] text-slate-400 hover:text-slate-200"
              >
                <X size={16} />
              </button>
            </div>

            <div className="overflow-y-auto space-y-3 pr-1 flex-1">
              {routinesLoading ? (
                <div className="py-12 text-center text-slate-400">
                  <RefreshCw size={24} className="animate-spin mx-auto mb-2 text-amber-400" />
                  <p className="text-xs">Carregando fluxos disponíveis...</p>
                </div>
              ) : availableRoutines.length === 0 ? (
                <div className="py-12 text-center text-slate-500 bg-white/[0.01] rounded-xl border border-white/[0.05]">
                  <p className="text-sm font-medium">Nenhum fluxo diário ativo encontrado.</p>
                  <p className="text-xs text-slate-500 mt-1">O Líder ainda não cadastrou fluxos para você ou para a equipe.</p>
                </div>
              ) : (
                availableRoutines.map((routine) => {
                  const checklistCount = routine.checklist?.length || 0;
                  const isApplying = applyingRoutineId === routine.id;

                  return (
                    <div
                      key={routine.id}
                      className="p-4 rounded-xl bg-white/[0.02] border border-white/[0.08] hover:border-white/[0.14] transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-4"
                    >
                      <div className="space-y-1.5 flex-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <h4 className="font-bold text-sm text-slate-100">{routine.title}</h4>
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-500/15 border border-amber-500/30 text-amber-300">
                            {routine.start_time_str} - {routine.end_time_str}
                          </span>
                          <span
                            className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                              routine.member_id
                                ? 'bg-indigo-500/15 border-indigo-500/30 text-indigo-300'
                                : 'bg-blue-500/15 border-blue-500/30 text-blue-300'
                            }`}
                          >
                            {routine.member_id ? 'Exclusivo' : 'Equipe Toda'}
                          </span>
                        </div>

                        {routine.description && (
                          <p className="text-xs text-slate-400 line-clamp-2">{routine.description}</p>
                        )}

                        {checklistCount > 0 && (
                          <div className="flex items-center gap-1.5 text-[11px] text-slate-400">
                            <ListChecks size={12} className="text-amber-400" />
                            <span>Contém {checklistCount} {checklistCount === 1 ? 'item' : 'itens'} no checklist</span>
                          </div>
                        )}
                      </div>

                      <button
                        onClick={() => handleApplyRoutine(routine.id)}
                        disabled={isApplying}
                        className="px-3.5 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs flex items-center justify-center gap-1.5 shrink-0 transition-all shadow-md shadow-amber-500/20 disabled:opacity-50"
                      >
                        {isApplying ? (
                          <>
                            <RefreshCw size={13} className="animate-spin" />
                            <span>Adicionando...</span>
                          </>
                        ) : (
                          <>
                            <Plus size={13} />
                            <span>Adicionar ao Meu Dia</span>
                          </>
                        )}
                      </button>
                    </div>
                  );
                })
              )}
            </div>

            <div className="mt-4 pt-3 border-t border-white/[0.06] flex items-center justify-between">
              <span className="text-xs text-slate-500">
                {availableRoutines.length} {availableRoutines.length === 1 ? 'fluxo disponível' : 'fluxos disponíveis'}
              </span>
              <button
                onClick={() => setIsRoutinesDrawerOpen(false)}
                className="px-4 py-2 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] text-xs font-semibold text-slate-300 transition-all"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ===================== MODAL: NOVO BLOCO MANUAL ===================== */}
      {isNewManualBlockModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-md bg-[#0d1428] border border-white/[0.1] rounded-2xl p-6 shadow-2xl">
            <div className="flex items-center justify-between pb-4 border-b border-white/[0.06] mb-4">
              <h3 className="font-bold text-base text-slate-100 flex items-center gap-2">
                <Plus size={18} className="text-amber-400" />
                <span>Novo Bloco Manual na Timeline</span>
              </h3>
              <button
                onClick={() => setIsNewManualBlockModalOpen(false)}
                className="p-1.5 rounded-lg bg-white/[0.04] text-slate-400 hover:text-slate-200"
              >
                <X size={16} />
              </button>
            </div>

            <form onSubmit={handleCreateManualBlock} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Título do Bloco / Atividade</label>
                <input
                  type="text"
                  required
                  placeholder="ex: Atendimento a chamados prioritários"
                  value={newBlkTitle}
                  onChange={(e) => setNewBlkTitle(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-white/[0.04] border border-white/[0.1] text-xs text-slate-200 focus:outline-none focus:border-amber-400/50"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">Horário Início</label>
                  <input
                    type="time"
                    required
                    value={newBlkStart}
                    onChange={(e) => setNewBlkStart(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-white/[0.04] border border-white/[0.1] text-xs text-slate-200 focus:outline-none focus:border-amber-400/50"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">Horário Fim</label>
                  <input
                    type="time"
                    required
                    value={newBlkEnd}
                    onChange={(e) => setNewBlkEnd(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-white/[0.04] border border-white/[0.1] text-xs text-slate-200 focus:outline-none focus:border-amber-400/50"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Observações / Anotações (Opcional)</label>
                <textarea
                  rows={3}
                  placeholder="Notas rápidas ou contexto sobre esta atividade..."
                  value={newBlkNotes}
                  onChange={(e) => setNewBlkNotes(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-white/[0.04] border border-white/[0.1] text-xs text-slate-200 focus:outline-none focus:border-amber-400/50"
                />
              </div>

              <div className="pt-4 border-t border-white/[0.06] flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsNewManualBlockModalOpen(false)}
                  className="px-4 py-2 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] text-xs font-semibold text-slate-300 transition-all"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isCreatingBlock}
                  className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs shadow-md shadow-amber-500/20 transition-all disabled:opacity-50"
                >
                  {isCreatingBlock ? 'Adicionando...' : 'Adicionar Bloco'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ===================== MODAL: EDITAR BLOCO DA TIMELINE ===================== */}
      {editingBlock && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-md bg-[#0d1428] border border-white/[0.1] rounded-2xl p-6 shadow-2xl">
            <div className="flex items-center justify-between pb-4 border-b border-white/[0.06] mb-4">
              <div>
                <h3 className="font-bold text-base text-slate-100 flex items-center gap-2">
                  <Pencil size={18} className="text-amber-400" />
                  <span>Editar Bloco da Timeline</span>
                </h3>
                {editingBlock.assigned_by_leader && (
                  <span className="inline-flex items-center gap-1 text-[11px] text-amber-300/90 mt-0.5">
                    <Lock size={11} />
                    <span>Fluxo do Líder (horário e notas editáveis)</span>
                  </span>
                )}
              </div>
              <button
                onClick={() => setEditingBlock(null)}
                className="p-1.5 rounded-lg bg-white/[0.04] text-slate-400 hover:text-slate-200"
              >
                <X size={16} />
              </button>
            </div>

            <form onSubmit={handleSaveEditBlock} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  Título {editingBlock.assigned_by_leader ? '(Fixo pelo Líder)' : ''}
                </label>
                <input
                  type="text"
                  required
                  disabled={editingBlock.assigned_by_leader}
                  value={editBlkTitle}
                  onChange={(e) => setEditBlkTitle(e.target.value)}
                  className={`w-full px-3.5 py-2.5 rounded-xl border text-xs ${
                    editingBlock.assigned_by_leader
                      ? 'bg-white/[0.02] border-white/[0.06] text-slate-400 cursor-not-allowed'
                      : 'bg-white/[0.04] border-white/[0.1] text-slate-200 focus:outline-none focus:border-amber-400/50'
                  }`}
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">Horário Início</label>
                  <input
                    type="time"
                    required
                    value={editBlkStart}
                    onChange={(e) => setEditBlkStart(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-white/[0.04] border border-white/[0.1] text-xs text-slate-200 focus:outline-none focus:border-amber-400/50"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">Horário Fim</label>
                  <input
                    type="time"
                    required
                    value={editBlkEnd}
                    onChange={(e) => setEditBlkEnd(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-white/[0.04] border border-white/[0.1] text-xs text-slate-200 focus:outline-none focus:border-amber-400/50"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Observações / Notas de Execução</label>
                <textarea
                  rows={4}
                  placeholder="Anotações sobre a execução deste bloco..."
                  value={editBlkNotes}
                  onChange={(e) => setEditBlkNotes(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-white/[0.04] border border-white/[0.1] text-xs text-slate-200 focus:outline-none focus:border-amber-400/50"
                />
              </div>

              <div className="pt-4 border-t border-white/[0.06] flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setEditingBlock(null)}
                  className="px-4 py-2 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] text-xs font-semibold text-slate-300 transition-all"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isUpdatingBlock}
                  className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs shadow-md shadow-amber-500/20 transition-all disabled:opacity-50"
                >
                  {isUpdatingBlock ? 'Salvando...' : 'Salvar Alterações'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ===================== MODAL DE INSTRUÇÕES COMPLETAS DA DEMANDA ===================== */}
      {selectedTaskForDetails && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-md animate-in fade-in duration-150">
          <div className="w-full max-w-3xl max-h-[90vh] bg-[#0d1428] border border-white/[0.12] rounded-3xl shadow-2xl flex flex-col overflow-hidden">
            {/* Modal Header */}
            <div className="p-6 border-b border-white/[0.08] bg-white/[0.01] flex items-start justify-between gap-4">
              <div>
                <div className="flex flex-wrap items-center gap-2 mb-2">
                  <span className="text-[10px] font-bold px-2.5 py-0.5 rounded-full bg-white/[0.06] text-slate-300 border border-white/[0.1]">
                    {selectedTaskForDetails.category || 'Geral'}
                  </span>
                  {selectedTaskForDetails.priority && (
                    <span
                      className={`text-[10px] font-bold px-2.5 py-0.5 rounded-full border ${
                        selectedTaskForDetails.priority === 'Alta' || selectedTaskForDetails.priority === 'Crítica'
                          ? 'bg-rose-500/15 border-rose-500/30 text-rose-300'
                          : selectedTaskForDetails.priority === 'Média'
                          ? 'bg-amber-500/15 border-amber-500/30 text-amber-300'
                          : 'bg-slate-500/15 border-slate-500/30 text-slate-400'
                      }`}
                    >
                      Prioridade: {selectedTaskForDetails.priority}
                    </span>
                  )}
                  {selectedTaskForDetails.assigned_by_leader && (
                    <span className="flex items-center gap-1 text-[10px] font-bold px-2.5 py-0.5 rounded-full bg-amber-500/15 border border-amber-500/30 text-amber-300">
                      <Lock size={11} />
                      <span>Demanda Oficial do Líder</span>
                    </span>
                  )}
                  <span
                    className={`text-[10px] font-bold px-2.5 py-0.5 rounded-full border ${
                      selectedTaskForDetails.status === 'completed'
                        ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                        : selectedTaskForDetails.timer_status === 'running'
                        ? 'bg-amber-500/20 border-amber-500/50 text-amber-300 animate-pulse'
                        : 'bg-slate-500/10 border-slate-500/20 text-slate-400'
                    }`}
                  >
                    {selectedTaskForDetails.status === 'completed'
                      ? 'Concluída'
                      : selectedTaskForDetails.timer_status === 'running'
                      ? 'Em Andamento'
                      : 'Pendente'}
                  </span>
                </div>
                <h2 className="text-xl font-bold text-slate-100">{selectedTaskForDetails.name}</h2>
              </div>

              <button
                onClick={() => setSelectedTaskForDetails(null)}
                className="p-2 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] text-slate-400 hover:text-slate-200 transition-all shrink-0"
              >
                <X size={18} />
              </button>
            </div>

            {/* Modal Scrollable Body */}
            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              {/* Instructions Section */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs uppercase font-bold text-amber-400 tracking-wider flex items-center gap-1.5">
                    <ListChecks size={15} />
                    <span>Instruções & Descrição Completa</span>
                  </h4>
                  <span className="text-[11px] text-slate-500 font-mono">Renderização Markdown</span>
                </div>
                <div className="bg-[#070c1b] p-5 rounded-2xl border border-white/[0.08] shadow-inner min-h-[140px] max-h-[380px] overflow-y-auto">
                  {selectedTaskForDetails.description ? (
                    <MarkdownRenderer content={selectedTaskForDetails.description} />
                  ) : (
                    <p className="text-xs text-slate-500 italic">Nenhuma instrução detalhada cadastrada para esta demanda.</p>
                  )}
                </div>
              </div>

              {/* Linked POP Section */}
              {selectedTaskForDetails.linked_note_id && (
                <div className="p-4 rounded-2xl bg-amber-500/[0.06] border border-amber-500/20 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="p-2.5 rounded-xl bg-amber-500/20 text-amber-300 shrink-0">
                      <BookOpen size={18} />
                    </div>
                    <div>
                      <h5 className="font-bold text-xs text-amber-200">Procedimento Operacional Padrão (POP) Vinculado</h5>
                      <p className="text-[11px] text-slate-400">Esta demanda possui instruções documentadas no cofre de POPs.</p>
                    </div>
                  </div>
                  <button
                    onClick={() => handleOpenLinkedPop(selectedTaskForDetails.linked_note_id!)}
                    className="px-3.5 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs flex items-center gap-1.5 shadow-md shadow-amber-500/20 transition-all shrink-0"
                  >
                    <span>Consultar POP</span>
                    <ChevronRight size={14} />
                  </button>
                </div>
              )}

              {/* Execution & Timer Control Bar */}
              <div className="p-4 rounded-2xl bg-white/[0.02] border border-white/[0.08] flex flex-col sm:flex-row items-center justify-between gap-4">
                <div className="flex items-center gap-4">
                  <div className="flex items-center gap-2">
                    <Clock size={18} className="text-amber-400" />
                    <div>
                      <div className="text-[10px] uppercase font-bold text-slate-400">Tempo Trabalhado</div>
                      <div className="font-mono text-xl font-bold text-slate-100">
                        {formatSeconds(selectedTaskForDetails.time_spent_seconds)}
                      </div>
                    </div>
                  </div>
                  <div className="h-8 w-[1px] bg-white/[0.08]" />
                  <div>
                    <div className="text-[10px] uppercase font-bold text-slate-400">Estimativa</div>
                    <div className="text-sm font-semibold text-slate-300">
                      {selectedTaskForDetails.estimated_hours}h
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2 w-full sm:w-auto">
                  {selectedTaskForDetails.timer_status === 'running' ? (
                    <button
                      onClick={() => handlePauseTask(selectedTaskForDetails.id)}
                      className="flex-1 sm:flex-none px-4 py-2 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 text-amber-200 border border-amber-500/40 text-xs font-bold flex items-center justify-center gap-1.5 transition-all"
                    >
                      <Pause size={14} />
                      <span>Pausar</span>
                    </button>
                  ) : (
                    <button
                      onClick={() => handleStartTask(selectedTaskForDetails.id)}
                      className="flex-1 sm:flex-none px-4 py-2 rounded-xl bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/40 text-xs font-bold flex items-center justify-center gap-1.5 transition-all"
                    >
                      <Play size={14} />
                      <span>Iniciar Cronômetro</span>
                    </button>
                  )}

                  <button
                    onClick={() => handleResetTask(selectedTaskForDetails.id)}
                    title="Zerar cronômetro"
                    className="p-2 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] text-slate-400 hover:text-slate-200 border border-white/[0.08]"
                  >
                    <RotateCcw size={14} />
                  </button>

                  {selectedTaskForDetails.status !== 'completed' && (
                    <button
                      onClick={() => handleCompleteTask(selectedTaskForDetails.id)}
                      className="px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs flex items-center justify-center gap-1.5 shadow-md shadow-emerald-500/20 transition-all"
                    >
                      <CheckCircle2 size={14} />
                      <span>Concluir</span>
                    </button>
                  )}
                </div>
              </div>

              {/* Execution Notes Section */}
              <div className="space-y-2">
                <h4 className="text-xs uppercase font-bold text-slate-400 tracking-wider flex items-center gap-1.5">
                  <FileText size={15} className="text-blue-400" />
                  <span>Relatório / Notas de Execução do Liderado</span>
                </h4>
                <p className="text-[11px] text-slate-400">
                  Descreva o progresso, obstáculos ou links da execução para acompanhamento do Líder.
                </p>
                <textarea
                  rows={4}
                  value={
                    editingNotesTaskId === selectedTaskForDetails.id
                      ? executionNotesText
                      : selectedTaskForDetails.execution_notes || ''
                  }
                  onChange={(e) => {
                    setEditingNotesTaskId(selectedTaskForDetails.id);
                    setExecutionNotesText(e.target.value);
                  }}
                  placeholder="ex: Etapa de coleta finalizada. Arquivo submetido..."
                  className="w-full p-4 rounded-xl bg-white/[0.03] border border-white/[0.1] text-xs text-slate-200 focus:outline-none focus:border-amber-400/50"
                />
                <div className="flex justify-end">
                  <button
                    onClick={async () => {
                      if (!editingNotesTaskId) {
                        setEditingNotesTaskId(selectedTaskForDetails.id);
                      }
                      await handleSaveExecutionNotes();
                    }}
                    className="px-4 py-2 rounded-xl bg-blue-500/20 hover:bg-blue-500/30 text-blue-200 border border-blue-500/40 text-xs font-bold transition-all"
                  >
                    Salvar Relatório de Execução
                  </button>
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="p-4 border-t border-white/[0.08] bg-white/[0.01] flex justify-end">
              <button
                onClick={() => setSelectedTaskForDetails(null)}
                className="px-5 py-2 rounded-xl bg-white/[0.05] hover:bg-white/[0.1] text-xs font-semibold text-slate-300"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ===================== MODAL DE NOVA NOTA PESSOAL ===================== */}
      {isNewNoteModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="w-full max-w-2xl bg-[#0d1428] border border-white/[0.12] rounded-3xl p-6 shadow-2xl flex flex-col max-h-[90vh]">
            <div className="flex items-center justify-between pb-4 border-b border-white/[0.08] mb-4">
              <div className="flex items-center gap-2">
                <BookOpen size={18} className="text-amber-400" />
                <h3 className="font-bold text-base text-slate-100">Nova Nota Pessoal (Isolada)</h3>
              </div>
              <button
                onClick={() => setIsNewNoteModalOpen(false)}
                className="p-1.5 rounded-lg bg-white/[0.04] text-slate-400 hover:text-slate-200"
              >
                <X size={16} />
              </button>
            </div>

            <form onSubmit={handleCreatePersonalNote} className="space-y-4 flex-1 flex flex-col overflow-hidden">
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Título da Nota</label>
                <input
                  type="text"
                  required
                  placeholder="ex: Procedimento de Backup / Rascunho de Atividades"
                  value={newNoteTitle}
                  onChange={(e) => setNewNoteTitle(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-white/[0.04] border border-white/[0.1] text-xs text-slate-200 focus:outline-none focus:border-amber-400/50"
                />
              </div>

              <div className="flex-1 flex flex-col overflow-hidden">
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-medium text-slate-300">Conteúdo (Markdown)</label>
                  <div className="flex items-center gap-1 p-0.5 bg-white/[0.03] rounded-lg border border-white/[0.08]">
                    <button
                      type="button"
                      onClick={() => setNewNoteMode('edit')}
                      className={`px-2.5 py-1 rounded text-[11px] font-semibold flex items-center gap-1 ${
                        newNoteMode === 'edit' ? 'bg-amber-500/20 text-amber-200' : 'text-slate-400'
                      }`}
                    >
                      <Code size={11} />
                      <span>Editor</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setNewNoteMode('preview')}
                      className={`px-2.5 py-1 rounded text-[11px] font-semibold flex items-center gap-1 ${
                        newNoteMode === 'preview' ? 'bg-amber-500/20 text-amber-200' : 'text-slate-400'
                      }`}
                    >
                      <Eye size={11} />
                      <span>Prévia</span>
                    </button>
                  </div>
                </div>

                <div className="flex-1 flex flex-col rounded-2xl border border-white/[0.08] bg-[#070c1b] overflow-hidden min-h-[220px]">
                  <MarkdownToolbar
                    textareaRef={newNoteTextareaRef}
                    content={newNoteContent}
                    onChange={setNewNoteContent}
                  />

                  {newNoteMode === 'edit' ? (
                    <textarea
                      ref={newNoteTextareaRef}
                      value={newNoteContent}
                      onChange={(e) => setNewNoteContent(e.target.value)}
                      placeholder="Escreva em Markdown... Use # para títulos, - para listas, **negrito**, etc."
                      className="w-full flex-1 p-3.5 bg-transparent text-slate-100 font-mono text-xs focus:outline-none resize-none leading-relaxed"
                    />
                  ) : (
                    <div className="flex-1 p-4 overflow-y-auto bg-white/[0.01]">
                      <MarkdownRenderer content={newNoteContent || '*Nenhum conteúdo para pré-visualizar.*'} />
                    </div>
                  )}
                </div>
              </div>

              <div className="pt-4 border-t border-white/[0.08] flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsNewNoteModalOpen(false)}
                  className="px-4 py-2 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] text-xs font-semibold text-slate-300"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs shadow-md shadow-amber-500/20 transition-all"
                >
                  Criar Nota
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
