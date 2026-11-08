import React, { useState, useEffect } from 'react';
import { 
  ArrowUp, 
  ArrowDown, 
  ArrowUpDown, 
  Clock, 
  CheckCircle, 
  PlayCircle, 
  PauseCircle, 
  Loader2, 
  Plus, 
  Trash2, 
  Search, 
  X, 
  Flame, 
  Check, 
  ListTodo, 
  Activity, 
  CheckCircle2,
  Calendar,
  Tag,
  Filter,
  RotateCcw,
  Pencil
} from 'lucide-react';

interface Task {
  id: number;
  name: string;
  description: string;
  category: string;
  priority: string;
  difficulty: string;
  estimated_hours: number;
  status: string;
  time_spent_seconds: number;
  timer_status: string;
  timer_started_at?: string | null;
  goal_id?: number | null;
  scheduled_date?: string | null;
  created_at: string;
}

interface CalendarGoalOption {
  id: number;
  title: string;
  horizon: string;
  status: string;
}

type SortKey = keyof Task | 'time_spent_seconds';
type SortDirection = 'asc' | 'desc' | null;

const PRIORITY_HIERARCHY: Record<string, number> = {
  'crítica': 5,
  'critica': 5,
  'alta': 4,
  'média': 3,
  'media': 3,
  'baixa': 2,
  'muito baixa': 1,
  'muitobaixa': 1,
};

const DIFFICULTY_HIERARCHY: Record<string, number> = {
  'crítica': 5,
  'critica': 5,
  'alta': 4,
  'média': 3,
  'media': 3,
  'baixa': 2,
  'simples': 1,
};

const DIFFICULTY_OPTIONS = [
  { label: 'Crítica (12h)', value: 'Crítica', defaultHours: 12 },
  { label: 'Alta (6h)', value: 'Alta', defaultHours: 6 },
  { label: 'Média (3h)', value: 'Média', defaultHours: 3 },
  { label: 'Baixa (1h)', value: 'Baixa', defaultHours: 1 },
  { label: 'Simples (0,5h)', value: 'Simples', defaultHours: 0.5 },
];

const PRIORITY_OPTIONS = [
  'Crítica',
  'Alta',
  'Média',
  'Baixa',
  'Muito Baixa',
];

const SUGGESTED_CATEGORIES = [
  'Padrão',
  'Desenvolvimento',
  'Financeiro',
  'Operacional',
  'Estratégico',
  'Pesquisa',
  'Administrativo',
  'Pessoal',
];

export default function Tasks() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [goals, setGoals] = useState<CalendarGoalOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'in_progress' | 'completed'>('all');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [priorityFilter, setPriorityFilter] = useState<string>('all');
  const [difficultyFilter, setDifficultyFilter] = useState<string>('all');
  
  const [sortKey, setSortKey] = useState<SortKey>('created_at');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');

  // Modal Nova Demanda State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalName, setModalName] = useState('');
  const [modalDescription, setModalDescription] = useState('');
  const [modalCategory, setModalCategory] = useState('Padrão');
  const [modalPriority, setModalPriority] = useState('Média');
  const [modalDifficulty, setModalDifficulty] = useState('Média');
  const [modalHours, setModalHours] = useState<number>(3);
  const [modalGoalId, setModalGoalId] = useState<string>('');
  const [modalScheduledDate, setModalScheduledDate] = useState<string>('');
  const [submitting, setSubmitting] = useState(false);

  // Tabulação sob demanda (Edição rápida de categoria na linha)
  const [editingCategoryId, setEditingCategoryId] = useState<number | null>(null);
  const [editingCategoryValue, setEditingCategoryValue] = useState<string>('');
  const [savingCategoryId, setSavingCategoryId] = useState<number | null>(null);

  const [now, setNow] = useState<Date>(new Date());

  useEffect(() => {
    fetchTasks();
    fetchGoals();
    const timerInterval = setInterval(() => {
      setNow(new Date());
    }, 1000);
    return () => clearInterval(timerInterval);
  }, []);

  const fetchGoals = async () => {
    try {
      const res = await fetch('/calendar/goals');
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data)) {
          setGoals(data);
        }
      }
    } catch (error) {
      console.error('Erro ao buscar metas:', error);
    }
  };

  const fetchTasks = async () => {
    try {
      const res = await fetch('/tasks');
      const data = await res.json();
      if (Array.isArray(data)) {
        setTasks(data.map((t: Task) => ({
          ...t,
          category: t.category && t.category.trim() ? t.category.trim() : 'Padrão'
        })));
      }
    } catch (error) {
      console.error('Erro ao buscar demandas:', error);
    } finally {
      setLoading(false);
    }
  };

  // Lista dinâmica de categorias disponíveis (Padrão sempre primeiro + categorias tabuladas existentes + sugestões)
  const existingCategories = Array.from(
    new Set([
      'Padrão',
      ...tasks.map(t => (t.category && t.category.trim() ? t.category.trim() : 'Padrão')),
    ])
  );

  const allCategorySuggestions = Array.from(
    new Set([
      ...existingCategories,
      ...SUGGESTED_CATEGORIES,
    ])
  );

  const handleDifficultyChange = (diff: string) => {
    setModalDifficulty(diff);
    const option = DIFFICULTY_OPTIONS.find(o => o.value === diff);
    if (option) {
      setModalHours(option.defaultHours);
    }
  };

  const openNewTaskModal = () => {
    setModalName('');
    setModalDescription('');
    setModalCategory('Padrão');
    setModalPriority('Média');
    setModalDifficulty('Média');
    setModalHours(3);
    setModalGoalId('');
    setModalScheduledDate('');
    setIsModalOpen(true);
  };

  const handleCreateTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!modalName.trim()) return;

    const finalCategory = modalCategory.trim() || 'Padrão';

    setSubmitting(true);
    try {
      const res = await fetch('/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: modalName.trim(),
          description: modalDescription.trim() || null,
          category: finalCategory,
          priority: modalPriority,
          difficulty: modalDifficulty,
          estimated_hours: Number(modalHours),
          status: 'pending',
          goal_id: modalGoalId ? Number(modalGoalId) : null,
          scheduled_date: modalScheduledDate || null
        })
      });

      if (res.ok) {
        setIsModalOpen(false);
        setModalName('');
        setModalDescription('');
        setModalCategory('Padrão');
        setModalPriority('Média');
        setModalDifficulty('Média');
        setModalHours(3);
        setModalGoalId('');
        setModalScheduledDate('');
        await fetchTasks();
      } else {
        alert('Erro ao criar demanda. Verifique os dados informados.');
      }
    } catch (error) {
      console.error('Erro ao salvar demanda:', error);
      alert('Erro de conexão ao salvar demanda.');
    } finally {
      setSubmitting(false);
    }
  };

  const startEditingCategory = (task: Task) => {
    setEditingCategoryId(task.id);
    setEditingCategoryValue(task.category || 'Padrão');
  };

  const handleSaveCategory = async (taskId: number, customValue?: string) => {
    const rawCat = customValue !== undefined ? customValue : editingCategoryValue;
    const normalizedCat = rawCat.trim() || 'Padrão';
    setSavingCategoryId(taskId);
    try {
      const res = await fetch(`/tasks/${taskId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ category: normalizedCat }),
      });
      if (res.ok) {
        setEditingCategoryId(null);
        await fetchTasks();
      }
    } catch (error) {
      console.error('Erro ao tabular categoria da demanda:', error);
    } finally {
      setSavingCategoryId(null);
    }
  };

  const handleStartTimer = async (taskId: number) => {
    try {
      const res = await fetch(`/tasks/${taskId}/start`, { method: 'POST' });
      if (res.ok) {
        await fetchTasks();
      }
    } catch (error) {
      console.error('Erro ao iniciar cronômetro:', error);
    }
  };

  const handlePauseTimer = async (taskId: number) => {
    try {
      const res = await fetch(`/tasks/${taskId}/pause`, { method: 'POST' });
      if (res.ok) {
        await fetchTasks();
      }
    } catch (error) {
      console.error('Erro ao pausar cronômetro:', error);
    }
  };

  const handleCompleteTask = async (taskId: number) => {
    try {
      const res = await fetch(`/tasks/${taskId}/complete`, { method: 'POST' });
      if (res.ok) {
        await fetchTasks();
      }
    } catch (error) {
      console.error('Erro ao concluir demanda:', error);
    }
  };

  const handleDeleteTask = async (taskId: number, taskName: string) => {
    if (confirm(`Deseja realmente excluir a demanda "${taskName}"?`)) {
      try {
        const res = await fetch(`/tasks/${taskId}`, { method: 'DELETE' });
        if (res.ok) {
          await fetchTasks();
        }
      } catch (error) {
        console.error('Erro ao excluir demanda:', error);
      }
    }
  };

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      if (sortDirection === 'asc') setSortDirection('desc');
      else if (sortDirection === 'desc') setSortDirection(null);
      else setSortDirection('asc');
    } else {
      setSortKey(key);
      setSortDirection('asc');
    }
  };

  const hasActiveFilters =
    searchTerm.trim() !== '' ||
    statusFilter !== 'all' ||
    categoryFilter !== 'all' ||
    priorityFilter !== 'all' ||
    difficultyFilter !== 'all';

  const resetAllFilters = () => {
    setSearchTerm('');
    setStatusFilter('all');
    setCategoryFilter('all');
    setPriorityFilter('all');
    setDifficultyFilter('all');
  };

  const getFilteredTasks = () => {
    return tasks.filter(task => {
      const taskCat = (task.category || 'Padrão').trim();
      const term = searchTerm.toLowerCase();
      const matchesSearch =
        task.name.toLowerCase().includes(term) ||
        (task.description && task.description.toLowerCase().includes(term)) ||
        taskCat.toLowerCase().includes(term);

      if (!matchesSearch) return false;

      if (categoryFilter !== 'all' && taskCat.toLowerCase() !== categoryFilter.toLowerCase()) {
        return false;
      }

      if (priorityFilter !== 'all' && (task.priority || '').toLowerCase() !== priorityFilter.toLowerCase()) {
        return false;
      }

      if (difficultyFilter !== 'all' && (task.difficulty || '').toLowerCase() !== difficultyFilter.toLowerCase()) {
        return false;
      }

      if (statusFilter === 'completed') return task.status === 'completed';
      if (statusFilter === 'in_progress') return task.status === 'in_progress' || task.timer_status === 'running';
      if (statusFilter === 'pending') return task.status === 'pending' && task.timer_status !== 'running';

      return true;
    });
  };

  const getSortedTasks = () => {
    const filtered = getFilteredTasks();
    if (!sortDirection) return filtered;

    return [...filtered].sort((a, b) => {
      if (sortKey === 'priority') {
        const rankA = PRIORITY_HIERARCHY[(a.priority || '').toLowerCase()] || 0;
        const rankB = PRIORITY_HIERARCHY[(b.priority || '').toLowerCase()] || 0;
        return sortDirection === 'asc' ? rankA - rankB : rankB - rankA;
      }

      if (sortKey === 'difficulty') {
        const rankA = DIFFICULTY_HIERARCHY[(a.difficulty || '').toLowerCase()] || 0;
        const rankB = DIFFICULTY_HIERARCHY[(b.difficulty || '').toLowerCase()] || 0;
        return sortDirection === 'asc' ? rankA - rankB : rankB - rankA;
      }

      if (sortKey === 'estimated_hours') {
        const valA = Number(a.estimated_hours) || 0;
        const valB = Number(b.estimated_hours) || 0;
        return sortDirection === 'asc' ? valA - valB : valB - valA;
      }

      if (sortKey === 'time_spent_seconds') {
        const valA = getLiveSeconds(a);
        const valB = getLiveSeconds(b);
        return sortDirection === 'asc' ? valA - valB : valB - valA;
      }

      let valA: any = a[sortKey];
      let valB: any = b[sortKey];

      if (sortKey === 'category') {
        valA = a.category || 'Padrão';
        valB = b.category || 'Padrão';
      }

      if (valA === null || valA === undefined) valA = '';
      if (valB === null || valB === undefined) valB = '';

      if (typeof valA === 'string') valA = valA.toLowerCase();
      if (typeof valB === 'string') valB = valB.toLowerCase();

      if (valA < valB) return sortDirection === 'asc' ? -1 : 1;
      if (valA > valB) return sortDirection === 'asc' ? 1 : -1;
      return 0;
    });
  };

  function getLiveSeconds(task: Task): number {
    const base = Number(task.time_spent_seconds) || 0;
    if (task.timer_status === 'running' && task.timer_started_at) {
      const rawStarted = String(task.timer_started_at);
      const isoStr = rawStarted.endsWith("Z") || /[+-]\d{2}:\d{2}$/.test(rawStarted) ? rawStarted : rawStarted + "Z";
      const startedAt = new Date(isoStr);
      if (!isNaN(startedAt.getTime())) {
        const elapsed = Math.max(0, Math.floor((now.getTime() - startedAt.getTime()) / 1000));
        return base + elapsed;
      }
    }
    return base;
  }

  const sortedTasks = getSortedTasks();

  const renderSortIcon = (key: SortKey) => {
    if (sortKey !== key || !sortDirection) {
      return <ArrowUpDown size={13} className="text-slate-500 opacity-40 group-hover:opacity-100 transition-opacity" />;
    }
    return sortDirection === 'asc' 
      ? <ArrowUp size={13} className="text-amber-400" /> 
      : <ArrowDown size={13} className="text-amber-400" />;
  };

  const formatHours = (hours: number | null | undefined) => {
    if (hours === null || hours === undefined) return '0h';
    return `${hours.toString().replace('.', ',')}h`;
  };

  const formatTime = (seconds: number, isRunning = false) => {
    const safeSecs = Math.max(0, Math.floor(Number(seconds) || 0));
    const h = Math.floor(safeSecs / 3600);
    const m = Math.floor((safeSecs % 3600) / 60);
    const s = safeSecs % 60;
    if (isRunning) {
      return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    }
    if (h > 0) return `${h}h ${m}m`;
    if (m > 0) return `${m}m`;
    if (s > 0) return `${s}s`;
    return `0m`;
  };

  const renderCategoryCell = (task: Task) => {
    const cat = (task.category && task.category.trim()) ? task.category.trim() : 'Padrão';
    const isDefault = cat.toLowerCase() === 'padrão' || cat.toLowerCase() === 'padrao';

    if (editingCategoryId === task.id) {
      return (
        <div className="flex items-center gap-1.5 min-w-[180px]" onClick={(e) => e.stopPropagation()}>
          <input
            type="text"
            list={`category-options-${task.id}`}
            value={editingCategoryValue}
            onChange={(e) => setEditingCategoryValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                handleSaveCategory(task.id);
              } else if (e.key === 'Escape') {
                setEditingCategoryId(null);
              }
            }}
            autoFocus
            placeholder="Padrão"
            className="glass-input rounded-lg px-2.5 py-1 text-xs text-slate-100 w-32 focus:outline-none border border-amber-500/40"
          />
          <datalist id={`category-options-${task.id}`}>
            {allCategorySuggestions.map(c => (
              <option key={c} value={c} />
            ))}
          </datalist>
          <button
            type="button"
            disabled={savingCategoryId === task.id}
            onClick={() => handleSaveCategory(task.id)}
            className="p-1 rounded-md bg-emerald-500/20 text-emerald-300 hover:bg-emerald-500/30 border border-emerald-500/30 transition"
            title="Salvar categoria"
          >
            <Check size={13} />
          </button>
          <button
            type="button"
            onClick={() => setEditingCategoryId(null)}
            className="p-1 rounded-md bg-slate-800/70 text-slate-400 hover:text-slate-200 border border-white/10 transition"
            title="Cancelar"
          >
            <X size={13} />
          </button>
        </div>
      );
    }

    return (
      <div className="flex items-center gap-1.5 group/cat">
        <button
          type="button"
          onClick={() => startEditingCategory(task)}
          title="Clique para tabular/alterar a categoria desta demanda"
          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs border whitespace-nowrap font-medium transition-all ${
            isDefault
              ? 'bg-slate-800/50 border-slate-700/60 text-slate-300 hover:border-amber-500/40 hover:text-amber-200'
              : 'bg-indigo-500/15 border-indigo-500/35 text-indigo-200 hover:bg-indigo-500/25 shadow-[0_0_10px_rgba(99,102,241,0.12)]'
          }`}
        >
          <Tag size={11} className={isDefault ? 'text-slate-400' : 'text-indigo-400'} />
          <span>{cat}</span>
          <Pencil size={10} className="opacity-0 group-hover/cat:opacity-80 transition-opacity ml-0.5 text-amber-400" />
        </button>
      </div>
    );
  };

  const renderPriorityBadge = (priority: string) => {
    const p = (priority || '').toLowerCase();
    if (p.includes('crítica') || p.includes('critica')) {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs border whitespace-nowrap uppercase tracking-wider font-bold bg-rose-500/20 border-rose-500/40 text-rose-300 shadow-[0_0_12px_rgba(244,63,94,0.2)]">
          <Flame size={12} className="animate-pulse" /> Crítica
        </span>
      );
    }
    if (p.includes('alta')) {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs border whitespace-nowrap uppercase tracking-wider font-semibold bg-orange-500/15 border-orange-500/30 text-orange-300">
          Alta
        </span>
      );
    }
    if (p.includes('média') || p.includes('media')) {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs border whitespace-nowrap uppercase tracking-wider font-semibold bg-amber-500/15 border-amber-500/30 text-amber-300">
          Média
        </span>
      );
    }
    if (p.includes('muito baixa') || p.includes('muitobaixa')) {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs border whitespace-nowrap uppercase tracking-wider font-semibold bg-slate-500/15 border-slate-500/30 text-slate-400">
          Muito Baixa
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs border whitespace-nowrap uppercase tracking-wider font-semibold bg-blue-500/15 border-blue-500/30 text-blue-300">
        Baixa
      </span>
    );
  };

  const renderDifficultyBadge = (task: Task) => {
    const d = (task.difficulty || '').toLowerCase();
    let display = task.difficulty;

    if (d.includes('crítica') || d.includes('critica')) {
      display = 'Crítica (12h)';
    } else if (d.includes('alta')) {
      display = 'Alta (6h)';
    } else if (d.includes('média') || d.includes('media')) {
      display = 'Média (3h)';
    } else if (d.includes('baixa')) {
      display = 'Baixa (1h)';
    } else if (d.includes('simples')) {
      display = `Simples (${formatHours(task.estimated_hours)})`;
    }

    return (
      <span className="text-slate-200 text-sm font-medium">
        {display}
      </span>
    );
  };

  const renderStatus = (status: string, timer_status: string) => {
    if (status === 'completed') {
      return (
        <span className="inline-flex items-center gap-1.5 text-emerald-300 bg-emerald-500/15 px-2.5 py-1 rounded-lg border border-emerald-500/30 text-xs font-semibold backdrop-blur-sm">
          <CheckCircle size={13} className="text-emerald-400" /> Concluída
        </span>
      );
    }
    if (timer_status === 'running') {
      return (
        <span className="inline-flex items-center gap-1.5 text-amber-300 bg-amber-500/15 px-2.5 py-1 rounded-lg border border-amber-500/35 text-xs font-semibold shadow-[0_0_12px_rgba(234,179,8,0.2)] backdrop-blur-sm">
          <PlayCircle size={13} className="animate-spin text-amber-400" style={{ animationDuration: '4s' }} /> Em Andamento
        </span>
      );
    }
    if (timer_status === 'paused') {
      return (
        <span className="inline-flex items-center gap-1.5 text-amber-400 bg-amber-500/10 px-2.5 py-1 rounded-lg border border-amber-500/25 text-xs font-medium backdrop-blur-sm">
          <PauseCircle size={13} /> Pausada
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1.5 text-slate-400 bg-slate-800/40 px-2.5 py-1 rounded-lg border border-slate-700/60 text-xs font-medium backdrop-blur-sm">
        <Clock size={13} className="text-slate-500" /> Pendente
      </span>
    );
  };

  const completedCount = tasks.filter(t => t.status === 'completed').length;
  const runningCount = tasks.filter(t => t.timer_status === 'running').length;
  const pendingCount = tasks.filter(t => t.status !== 'completed' && t.timer_status !== 'running').length;

  return (
    <div className="flex flex-col h-[calc(100vh-64px)] overflow-hidden bg-transparent">
      {/* Frosted Glass Top Subheader with Metrics */}
      <div className="glass-panel-subtle px-6 py-4 border-b border-white/10 flex flex-wrap justify-between items-center gap-4 z-10 shrink-0">
        <div>
          <h2 className="text-xl sm:text-2xl font-bold tracking-tight bg-gradient-to-r from-white via-slate-100 to-slate-300 bg-clip-text text-transparent flex items-center gap-2.5">
            <ListTodo size={22} className="text-amber-400" /> Demandas & Priorização
          </h2>
          <p className="text-slate-400 text-xs sm:text-sm mt-0.5">
            Registradas por padrão na categoria <strong className="text-slate-200">Padrão</strong> e tabuláveis sob demanda.
          </p>
        </div>

        {/* Quick Stats Glass Pills & Action Button */}
        <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
          <div className="glass-panel-subtle px-3 py-1.5 rounded-xl border border-white/10 flex items-center gap-2 text-xs">
            <span className="text-slate-400">Total:</span>
            <span className="font-bold text-slate-200 font-mono">{tasks.length}</span>
          </div>

          <div className="bg-slate-800/50 border border-slate-700/60 px-3 py-1.5 rounded-xl flex items-center gap-2 text-xs text-slate-300">
            <Calendar size={13} className="text-slate-400" />
            <span>Pendentes:</span>
            <span className="font-bold font-mono text-slate-200">{pendingCount}</span>
          </div>
          
          <div className="bg-amber-500/10 border border-amber-500/25 px-3 py-1.5 rounded-xl flex items-center gap-2 text-xs text-amber-300">
            <Activity size={13} className="text-amber-400" />
            <span>Ativas:</span>
            <span className="font-bold font-mono">{runningCount}</span>
          </div>

          <div className="bg-emerald-500/10 border border-emerald-500/25 px-3 py-1.5 rounded-xl flex items-center gap-2 text-xs text-emerald-300">
            <CheckCircle2 size={13} className="text-emerald-400" />
            <span>Concluídas:</span>
            <span className="font-bold font-mono">{completedCount}</span>
          </div>

          <button
            onClick={openNewTaskModal}
            className="glass-btn-gold px-3.5 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 ml-2 shadow-lg"
          >
            <Plus size={15} /> Nova Demanda
          </button>
        </div>
      </div>

      {/* Controls & Multi-Filter Bar */}
      <div className="px-6 py-3.5 border-b border-white/5 bg-slate-950/40 backdrop-blur-md flex flex-col gap-3 shrink-0">
        {/* Primeira Linha: Busca, Filtros de Categoria, Prioridade, Dificuldade e Status */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2.5 flex-1 min-w-[260px]">
            {/* Busca por texto */}
            <div className="relative w-full sm:w-64">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Buscar nome, descrição ou categoria..."
                className="glass-input w-full rounded-xl pl-8 pr-8 py-1.5 text-xs text-slate-200 placeholder-slate-500 focus:outline-none"
              />
              {searchTerm && (
                <button
                  type="button"
                  onClick={() => setSearchTerm('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300"
                >
                  <X size={13} />
                </button>
              )}
            </div>

            {/* Select Categoria */}
            <div className="flex items-center gap-1.5">
              <Tag size={13} className="text-indigo-400 shrink-0" />
              <select
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value)}
                aria-label="Filtrar por Categoria"
                className="glass-input rounded-xl px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none"
              >
                <option value="all" className="bg-slate-950 text-slate-200">Categoria: Todas</option>
                {existingCategories.map((cat) => (
                  <option key={cat} value={cat} className="bg-slate-950 text-slate-200">
                    {cat} ({tasks.filter(t => (t.category || 'Padrão').toLowerCase() === cat.toLowerCase()).length})
                  </option>
                ))}
              </select>
            </div>

            {/* Select Prioridade */}
            <div className="flex items-center gap-1.5">
              <Filter size={13} className="text-amber-400 shrink-0" />
              <select
                value={priorityFilter}
                onChange={(e) => setPriorityFilter(e.target.value)}
                aria-label="Filtrar por Prioridade"
                className="glass-input rounded-xl px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none"
              >
                <option value="all" className="bg-slate-950 text-slate-200">Prioridade: Todas</option>
                {PRIORITY_OPTIONS.map((p) => (
                  <option key={p} value={p} className="bg-slate-950 text-slate-200">{p}</option>
                ))}
              </select>
            </div>

            {/* Select Dificuldade */}
            <div className="flex items-center gap-1.5">
              <select
                value={difficultyFilter}
                onChange={(e) => setDifficultyFilter(e.target.value)}
                aria-label="Filtrar por Dificuldade"
                className="glass-input rounded-xl px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none"
              >
                <option value="all" className="bg-slate-950 text-slate-200">Dificuldade: Todas</option>
                {DIFFICULTY_OPTIONS.map((d) => (
                  <option key={d.value} value={d.value} className="bg-slate-950 text-slate-200">{d.label}</option>
                ))}
              </select>
            </div>

            {hasActiveFilters && (
              <button
                type="button"
                onClick={resetAllFilters}
                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-xs font-medium text-rose-300 bg-rose-500/10 border border-rose-500/25 hover:bg-rose-500/20 transition"
                title="Limpar todos os filtros"
              >
                <RotateCcw size={12} /> Limpar Filtros
              </button>
            )}
          </div>

          {/* Filtro Rápido de Status */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
            <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mr-1">Status:</span>
            {(['all', 'pending', 'in_progress', 'completed'] as const).map((st) => {
              const labels = {
                all: 'Todas',
                pending: 'Pendentes',
                in_progress: 'Em Andamento',
                completed: 'Concluídas'
              };
              const isSelected = statusFilter === st;
              return (
                <button
                  key={st}
                  onClick={() => setStatusFilter(st)}
                  className={`px-3 py-1 rounded-lg text-xs font-medium transition whitespace-nowrap ${
                    isSelected 
                      ? 'bg-amber-500/20 text-amber-300 border border-amber-500/35 shadow-[0_0_10px_rgba(234,179,8,0.15)]' 
                      : 'bg-slate-900/60 text-slate-400 hover:text-slate-200 hover:bg-slate-800/60 border border-white/5'
                  }`}
                >
                  {labels[st]}
                </button>
              );
            })}
          </div>
        </div>

        {/* Segunda Linha: Pílulas rápidas de Categorias tabuladas para visualização ágil */}
        <div className="flex items-center gap-1.5 overflow-x-auto pt-0.5">
          <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mr-1 flex items-center gap-1 shrink-0">
            <Tag size={11} className="text-indigo-400" /> Categorias:
          </span>
          <button
            type="button"
            onClick={() => setCategoryFilter('all')}
            className={`px-2.5 py-0.5 rounded-lg text-xs font-medium transition whitespace-nowrap ${
              categoryFilter === 'all'
                ? 'bg-indigo-500/25 text-indigo-200 border border-indigo-400/40'
                : 'bg-slate-900/50 text-slate-400 hover:text-slate-200 border border-white/5'
            }`}
          >
            Todas ({tasks.length})
          </button>
          {existingCategories.map((cat) => {
            const count = tasks.filter(t => (t.category || 'Padrão').toLowerCase() === cat.toLowerCase()).length;
            const isSelected = categoryFilter.toLowerCase() === cat.toLowerCase();
            return (
              <button
                key={cat}
                type="button"
                onClick={() => setCategoryFilter(isSelected ? 'all' : cat)}
                className={`px-2.5 py-0.5 rounded-lg text-xs font-medium transition whitespace-nowrap flex items-center gap-1.5 ${
                  isSelected
                    ? 'bg-indigo-500/25 text-indigo-200 border border-indigo-400/40 shadow-[0_0_10px_rgba(99,102,241,0.15)]'
                    : 'bg-slate-900/50 text-slate-400 hover:text-slate-200 border border-white/5'
                }`}
              >
                <span>{cat}</span>
                <span className="text-[10px] font-mono opacity-75">({count})</span>
              </button>
            );
          })}
        </div>
      </div>
      
      {/* Table Content Container */}
      <div className="flex-1 overflow-auto p-4 sm:p-6">
        {loading ? (
          <div className="flex flex-col items-center justify-center h-full text-slate-400 gap-3">
            <Loader2 className="animate-spin text-amber-400" size={32} />
            <span className="text-sm font-medium tracking-wide">Carregando quadro de demandas...</span>
          </div>
        ) : sortedTasks.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center p-8">
            <div className="glass-card max-w-md p-8 rounded-2xl border border-white/10 shadow-2xl">
              <div className="w-14 h-14 mx-auto mb-4 rounded-2xl bg-amber-500/10 border border-amber-500/25 flex items-center justify-center text-amber-400">
                <ListTodo size={28} />
              </div>
              <h3 className="text-lg font-bold text-slate-200 mb-1">Nenhuma demanda encontrada</h3>
              <p className="text-sm text-slate-400 mb-4">
                {hasActiveFilters
                  ? 'Nenhuma demanda corresponde aos filtros selecionados.'
                  : 'Cadastre uma nova demanda pelo botão acima ou converse com a Secretária.'}
              </p>
              {hasActiveFilters && (
                <button
                  type="button"
                  onClick={resetAllFilters}
                  className="glass-btn-gold px-4 py-2 rounded-xl text-xs font-bold inline-flex items-center gap-1.5"
                >
                  <RotateCcw size={14} /> Limpar Filtros
                </button>
              )}
            </div>
          </div>
        ) : (
          <div className="glass-panel rounded-2xl border border-white/10 shadow-2xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-950/70 backdrop-blur-md border-b border-white/10 text-slate-300 text-xs font-semibold uppercase tracking-wider">
                    <th className="p-4 cursor-pointer group hover:bg-white/[0.04] transition whitespace-nowrap" onClick={() => handleSort('name')}>
                      <div className="flex items-center gap-2">Demanda {renderSortIcon('name')}</div>
                    </th>
                    <th className="p-4 cursor-pointer group hover:bg-white/[0.04] transition whitespace-nowrap" onClick={() => handleSort('category')}>
                      <div className="flex items-center gap-2">Categoria {renderSortIcon('category')}</div>
                    </th>
                    <th className="p-4 cursor-pointer group hover:bg-white/[0.04] transition whitespace-nowrap" onClick={() => handleSort('priority')}>
                      <div className="flex items-center gap-2">Prioridade {renderSortIcon('priority')}</div>
                    </th>
                    <th className="p-4 cursor-pointer group hover:bg-white/[0.04] transition whitespace-nowrap" onClick={() => handleSort('difficulty')}>
                      <div className="flex items-center gap-2">Dificuldade {renderSortIcon('difficulty')}</div>
                    </th>
                    <th className="p-4 cursor-pointer group hover:bg-white/[0.04] transition whitespace-nowrap" onClick={() => handleSort('status')}>
                      <div className="flex items-center gap-2">Status {renderSortIcon('status')}</div>
                    </th>
                    <th className="p-4 cursor-pointer group hover:bg-white/[0.04] transition whitespace-nowrap" onClick={() => handleSort('estimated_hours')}>
                      <div className="flex items-center gap-2">Estimativa {renderSortIcon('estimated_hours')}</div>
                    </th>
                    <th className="p-4 cursor-pointer group hover:bg-white/[0.04] transition whitespace-nowrap" onClick={() => handleSort('time_spent_seconds')}>
                      <div className="flex items-center gap-2">Tempo Gasto {renderSortIcon('time_spent_seconds')}</div>
                    </th>
                    <th className="p-4 text-right whitespace-nowrap">
                      Ações
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/[0.06]">
                  {sortedTasks.map(task => (
                    <tr key={task.id} className="hover:bg-white/[0.035] transition-colors group">
                      <td className="p-4 max-w-xs">
                        <div className="font-semibold text-slate-100 group-hover:text-amber-200 transition-colors text-sm">{task.name}</div>
                        {task.description && (
                          <div className="text-xs text-slate-400 mt-1 line-clamp-1 group-hover:line-clamp-none transition-all leading-relaxed">
                            {task.description}
                          </div>
                        )}
                      </td>
                      <td className="p-4">
                        {renderCategoryCell(task)}
                      </td>
                      <td className="p-4">
                        {renderPriorityBadge(task.priority)}
                      </td>
                      <td className="p-4">
                        {renderDifficultyBadge(task)}
                      </td>
                      <td className="p-4 text-sm whitespace-nowrap">
                        {renderStatus(task.status, task.timer_status)}
                      </td>
                      <td className="p-4 text-slate-300 text-sm font-mono whitespace-nowrap">
                        {formatHours(task.estimated_hours)}
                      </td>
                      <td className="p-4 text-slate-300 text-sm font-mono whitespace-nowrap">
                        {formatTime(getLiveSeconds(task), task.timer_status === 'running')}
                      </td>
                      <td className="p-4 text-right whitespace-nowrap">
                        <div className="flex items-center justify-end gap-1.5">
                          {task.status !== 'completed' && (
                            <>
                              {task.timer_status === 'running' ? (
                                <button
                                  onClick={() => handlePauseTimer(task.id)}
                                  className="p-1.5 text-amber-400 hover:bg-amber-400/20 rounded-lg transition"
                                  title="Pausar cronômetro"
                                >
                                  <PauseCircle size={18} />
                                </button>
                              ) : (
                                <button
                                  onClick={() => handleStartTimer(task.id)}
                                  className="p-1.5 text-slate-400 hover:text-amber-400 hover:bg-slate-800 rounded-lg transition"
                                  title="Iniciar cronômetro"
                                >
                                  <PlayCircle size={18} />
                                </button>
                              )}
                              <button
                                onClick={() => handleCompleteTask(task.id)}
                                className="p-1.5 text-slate-400 hover:text-emerald-400 hover:bg-slate-800 rounded-lg transition"
                                title="Concluir demanda"
                              >
                                <Check size={18} />
                              </button>
                            </>
                          )}
                          <button
                            onClick={() => handleDeleteTask(task.id, task.name)}
                            className="p-1.5 text-slate-400 hover:text-rose-400 hover:bg-slate-800 rounded-lg transition"
                            title="Excluir demanda"
                          >
                            <Trash2 size={18} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* Modal Nova Demanda */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-md p-4">
          <div className="glass-card w-full max-w-lg rounded-2xl border border-white/15 shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="p-5 border-b border-white/10 flex justify-between items-center bg-slate-950/60">
              <h3 className="text-lg font-bold text-slate-100 flex items-center gap-2">
                <Plus size={20} className="text-amber-400" /> Nova Demanda
              </h3>
              <button 
                onClick={() => setIsModalOpen(false)}
                className="text-slate-400 hover:text-white p-1 rounded-lg transition"
              >
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleCreateTask} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
                  Nome da Demanda *
                </label>
                <input
                  type="text"
                  required
                  value={modalName}
                  onChange={(e) => setModalName(e.target.value)}
                  placeholder="Ex: Concluir relatório executivo"
                  className="glass-input w-full rounded-xl px-4 py-2.5 text-sm text-slate-200 placeholder-slate-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
                  Descrição (Opcional)
                </label>
                <textarea
                  rows={2}
                  value={modalDescription}
                  onChange={(e) => setModalDescription(e.target.value)}
                  placeholder="Detalhes ou diretrizes sobre a demanda..."
                  className="glass-input w-full rounded-xl px-4 py-2.5 text-sm text-slate-200 placeholder-slate-500 focus:outline-none resize-none"
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400">
                    Categoria (Opcional — Padrão automático)
                  </label>
                  <span className="text-[11px] text-indigo-300 font-medium">
                    Padrão: &quot;Padrão&quot;
                  </span>
                </div>
                <input
                  type="text"
                  list="modal-category-suggestions"
                  value={modalCategory}
                  onChange={(e) => setModalCategory(e.target.value)}
                  placeholder="Padrão"
                  className="glass-input w-full rounded-xl px-4 py-2 text-sm text-slate-200 placeholder-slate-500 focus:outline-none"
                />
                <datalist id="modal-category-suggestions">
                  {allCategorySuggestions.map((cat) => (
                    <option key={cat} value={cat} />
                  ))}
                </datalist>
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {allCategorySuggestions.slice(0, 6).map((cat) => (
                    <button
                      key={cat}
                      type="button"
                      onClick={() => setModalCategory(cat)}
                      className={`px-2 py-0.5 rounded-md text-[11px] font-medium transition ${
                        modalCategory.trim().toLowerCase() === cat.toLowerCase()
                          ? 'bg-indigo-500/25 text-indigo-200 border border-indigo-400/40'
                          : 'bg-slate-900/60 text-slate-400 hover:text-slate-200 border border-white/5'
                      }`}
                    >
                      {cat}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
                    Prioridade
                  </label>
                  <select
                    value={modalPriority}
                    onChange={(e) => setModalPriority(e.target.value)}
                    className="glass-input w-full rounded-xl px-3 py-2.5 text-sm text-slate-200 focus:outline-none"
                  >
                    {PRIORITY_OPTIONS.map((p) => (
                      <option key={p} value={p} className="bg-slate-950 text-slate-200">{p}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
                    Dificuldade
                  </label>
                  <select
                    value={modalDifficulty}
                    onChange={(e) => handleDifficultyChange(e.target.value)}
                    className="glass-input w-full rounded-xl px-3 py-2.5 text-sm text-slate-200 focus:outline-none"
                  >
                    {DIFFICULTY_OPTIONS.map((d) => (
                      <option key={d.value} value={d.value} className="bg-slate-950 text-slate-200">{d.label}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
                    Data Agendada (Timeline 24h)
                  </label>
                  <input
                    type="date"
                    value={modalScheduledDate}
                    onChange={(e) => setModalScheduledDate(e.target.value)}
                    className="glass-input w-full rounded-xl px-3 py-2 text-sm text-slate-200 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
                    Vincular à Meta (Opcional)
                  </label>
                  <select
                    value={modalGoalId}
                    onChange={(e) => setModalGoalId(e.target.value)}
                    className="glass-input w-full rounded-xl px-3 py-2.5 text-sm text-slate-200 focus:outline-none"
                  >
                    <option value="" className="bg-slate-950 text-slate-400">Nenhuma meta vinculada</option>
                    {goals.map((g) => (
                      <option key={g.id} value={g.id} className="bg-slate-950 text-slate-200">
                        {g.title} ({g.horizon})
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="glass-panel-subtle p-4 rounded-xl border border-white/10">
                <div className="flex justify-between items-center mb-1.5">
                  <label className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                    Tempo Estimado (Horas)
                  </label>
                  <span className="text-xs text-amber-400 font-mono font-bold">
                    {formatHours(modalHours)} ({Math.round(modalHours * 60)} min)
                  </span>
                </div>
                <input
                  type="number"
                  step="0.1"
                  min="0.1"
                  value={modalHours}
                  onChange={(e) => setModalHours(parseFloat(e.target.value) || 0)}
                  className="glass-input w-full rounded-xl px-4 py-2 text-sm text-slate-200 focus:outline-none"
                />
                {modalDifficulty === 'Simples' ? (
                  <p className="text-xs text-amber-300/90 mt-2">
                    💡 Tarefa Simples: O padrão é 0,5h (30 min). Você pode informar o tempo exato acima se desejar.
                  </p>
                ) : (
                  <p className="text-xs text-slate-400 mt-2">
                    ⏱️ Definido automaticamente pela dificuldade: <strong className="text-slate-200">{modalDifficulty}</strong>.
                  </p>
                )}
              </div>

              <div className="pt-3 border-t border-white/10 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="glass-btn-ghost px-4 py-2 rounded-xl text-xs font-semibold"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={submitting || !modalName.trim()}
                  className="glass-btn-gold px-5 py-2 rounded-xl text-xs font-bold disabled:opacity-50"
                >
                  {submitting ? 'Salvando...' : 'Criar Demanda'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

