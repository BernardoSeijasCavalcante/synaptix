import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Calendar as CalendarIcon,
  Clock,
  Target,
  Sparkles,
  Plus,
  Play,
  Pause,
  CheckCircle2,
  SkipForward,
  RotateCcw,
  Lock,
  Unlock,
  Trash2,
  ChevronLeft,
  ChevronRight,
  Settings2,
  AlertTriangle,
  MapPin,
  Repeat,
  X,
  Check,
  Zap,
  CalendarDays,
  LayoutGrid,
  Columns,
  ListOrdered,
  Pencil,
} from 'lucide-react';
import { trackSiteEvent } from '../security/eventTracker';

interface CalendarEvent {
  id: number;
  title: string;
  description?: string | null;
  location?: string | null;
  start_time: string;
  end_time: string;
  attendees?: string | null;
  category: string;
  color: string;
  is_all_day: boolean;
  recurrence_rule: string;
  reminder_minutes: number;
  status: string;
  goal_id?: number | null;
  is_recurring_instance?: boolean;
}

interface GoalMilestone {
  id: string;
  title: string;
  completed: boolean;
}

interface CalendarGoal {
  id: number;
  title: string;
  description?: string | null;
  horizon: 'daily' | 'weekly' | 'monthly' | 'deadline' | string;
  target_date?: string | null;
  priority: string;
  category: string;
  color: string;
  target_hours: number;
  logged_hours: number;
  progress_percent: number;
  milestones: GoalMilestone[];
  status: string;
  linked_tasks_count?: number;
  completed_tasks_count?: number;
}

interface RoutineTemplate {
  id: number;
  title: string;
  description?: string | null;
  category: string;
  start_time_str: string;
  end_time_str: string;
  days_of_week: string;
  color: string;
  is_active: boolean;
}

interface TimelineBlock {
  id: number;
  date_str: string;
  title: string;
  notes?: string | null;
  block_type: 'event' | 'task' | 'goal' | 'routine' | 'focus' | 'break' | string;
  start_minute: number;
  end_minute: number;
  start_time_str: string;
  end_time_str: string;
  duration_minutes: number;
  color: string;
  priority: string;
  status: 'planned' | 'in_progress' | 'completed' | 'skipped' | string;
  is_locked: boolean;
  is_auto_generated: boolean;
  task_id?: number | null;
  goal_id?: number | null;
  event_id?: number | null;
  timer_started_at?: string | null;
  actual_seconds_spent: number;
}

interface DailyTimelineData {
  date_str: string;
  total_day_minutes: number;
  focus_hours: number;
  event_hours: number;
  routine_hours: number;
  free_hours: number;
  completed_hours: number;
  completion_rate: number;
  conflicts: Array<{ block_a: string; block_b: string; overlap_Time: string }>;
  free_windows: Array<{ start_time: string; end_time: string; minutes: number }>;
  blocks: TimelineBlock[];
}

interface TaskOption {
  id: number;
  name: string;
  priority: string;
  difficulty: string;
  estimated_hours: number;
  status: string;
}

const HORIZON_LABELS: Record<string, string> = {
  daily: 'Meta Diária',
  weekly: 'Meta Semanal',
  monthly: 'Meta Mensal',
  deadline: 'Prazo Fixo',
};

const BLOCK_TYPE_LABELS: Record<string, { label: string; badge: string }> = {
  event: { label: 'Evento Fixo', badge: 'bg-amber-500/20 text-amber-300 border-amber-500/40' },
  task: { label: 'Demanda', badge: 'bg-blue-500/20 text-blue-300 border-blue-500/40' },
  goal: { label: 'Meta', badge: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40' },
  focus: { label: 'Bloco de Foco', badge: 'bg-purple-500/20 text-purple-300 border-purple-500/40' },
  routine: { label: 'Rotina 24h', badge: 'bg-indigo-500/20 text-indigo-300 border-indigo-500/40' },
  break: { label: 'Pausa', badge: 'bg-slate-500/20 text-slate-300 border-slate-500/40' },
};

const RECURRENCE_LABELS: Record<string, string> = {
  none: 'Evento Único',
  daily: 'Todos os Dias',
  weekdays: 'Dias Úteis (Seg–Sex)',
  weekly: 'Semanal',
  monthly: 'Mensal',
};

const WEEKDAY_NAMES = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

function toLocalIsoDate(d: Date): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function formatDurationSeconds(totalSeconds: number): string {
  const sec = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  if (h > 0) {
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export default function Calendar() {
  const [selectedDate, setSelectedDate] = useState<string>(() => toLocalIsoDate(new Date()));
  const [viewMode, setViewMode] = useState<'timeline' | 'week' | 'month'>('timeline');
  const [goalFilter, setGoalFilter] = useState<string>('all');
  const [loading, setLoading] = useState<boolean>(true);
  const [generating, setGenerating] = useState<boolean>(false);
  const [now, setNow] = useState<Date>(new Date());

  // Dados carregados da API protegida
  const [timelineData, setTimelineData] = useState<DailyTimelineData | null>(null);
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [goals, setGoals] = useState<CalendarGoal[]>([]);
  const [routines, setRoutines] = useState<RoutineTemplate[]>([]);
  const [dailyStatsMap, setDailyStatsMap] = useState<Record<string, any>>({});
  const [availableTasks, setAvailableTasks] = useState<TaskOption[]>([]);

  // Modais
  const [isEventModalOpen, setIsEventModalOpen] = useState(false);
  const [isGoalModalOpen, setIsGoalModalOpen] = useState(false);
  const [isBlockModalOpen, setIsBlockModalOpen] = useState(false);
  const [isRoutineModalOpen, setIsRoutineModalOpen] = useState(false);

  // Estado do Modal de Novo Evento
  const [evTitle, setEvTitle] = useState('');
  const [evCategory, setEvCategory] = useState('Compromisso');
  const [evDate, setEvDate] = useState(selectedDate);
  const [evStartTime, setEvStartTime] = useState('09:00');
  const [evEndTime, setEvEndTime] = useState('10:00');
  const [evLocation, setEvLocation] = useState('');
  const [evDescription, setEvDescription] = useState('');
  const [evRecurrence, setEvRecurrence] = useState('none');
  const [evReminder, setEvReminder] = useState(15);
  const [evGoalId, setEvGoalId] = useState<number | ''>('');

  // Estado do Modal de Meta (Criação e Edição)
  const [editingGoal, setEditingGoal] = useState<CalendarGoal | null>(null);
  const [goalTitle, setGoalTitle] = useState('');
  const [goalHorizon, setGoalHorizon] = useState<'daily' | 'weekly' | 'monthly' | 'deadline'>('weekly');
  const [goalTargetDate, setGoalTargetDate] = useState(selectedDate);
  const [goalPriority, setGoalPriority] = useState('Alta');
  const [goalTargetHours, setGoalTargetHours] = useState<number>(6);
  const [goalDescription, setGoalDescription] = useState('');
  const [goalMilestonesText, setGoalMilestonesText] = useState('');

  // Estado do Modal de Bloco Manual nas 24h
  const [blkTitle, setBlkTitle] = useState('');
  const [blkType, setBlkType] = useState('focus');
  const [blkStart, setBlkStart] = useState('08:00');
  const [blkEnd, setBlkEnd] = useState('09:30');
  const [blkPriority, setBlkPriority] = useState('Alta');
  const [blkNotes, setBlkNotes] = useState('');
  const [blkTaskId, setBlkTaskId] = useState<number | ''>('');
  const [blkGoalId, setBlkGoalId] = useState<number | ''>('');
  const [blkLocked, setBlkLocked] = useState(true);

  // Estado do Modal de Edição de Bloco nas 24h
  const [editingBlock, setEditingBlock] = useState<TimelineBlock | null>(null);
  const [editBlkTitle, setEditBlkTitle] = useState('');
  const [editBlkType, setEditBlkType] = useState('focus');
  const [editBlkStart, setEditBlkStart] = useState('08:00');
  const [editBlkEnd, setEditBlkEnd] = useState('09:30');
  const [editBlkPriority, setEditBlkPriority] = useState('Média');
  const [editBlkStatus, setEditBlkStatus] = useState('planned');
  const [editBlkNotes, setEditBlkNotes] = useState('');
  const [editBlkTaskId, setEditBlkTaskId] = useState<number | ''>('');
  const [editBlkGoalId, setEditBlkGoalId] = useState<number | ''>('');
  const [editBlkLocked, setEditBlkLocked] = useState(false);
  const [editBlkColor, setEditBlkColor] = useState('#3b82f6');
  const [isSavingBlock, setIsSavingBlock] = useState(false);

  // Estado do Modal de Rotina Base 24h
  const [rtTitle, setRtTitle] = useState('');
  const [rtCategory, setRtCategory] = useState('routine');
  const [rtStart, setRtStart] = useState('06:30');
  const [rtEnd, setRtEnd] = useState('07:30');

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const currentRange = useMemo(() => {
    const base = new Date(`${selectedDate}T12:00:00`);
    const first = new Date(base.getFullYear(), base.getMonth(), 1);
    const start = new Date(first);
    start.setDate(start.getDate() - 7);
    const end = new Date(base.getFullYear(), base.getMonth() + 1, 10);
    return {
      start_date: toLocalIsoDate(start),
      end_date: toLocalIsoDate(end),
    };
  }, [selectedDate]);

  const fetchCalendarData = useCallback(async () => {
    try {
      const [overviewRes, timelineRes, tasksRes] = await Promise.all([
        fetch(`/calendar/overview?start_date=${currentRange.start_date}&end_date=${currentRange.end_date}`),
        fetch(`/calendar/timeline/${selectedDate}`),
        fetch('/tasks'),
      ]);

      if (overviewRes.ok) {
        const ov = await overviewRes.json();
        setEvents(ov.events || []);
        setGoals(ov.goals || []);
        setRoutines(ov.routines || []);
        setDailyStatsMap(ov.daily_stats || {});
      }
      if (timelineRes.ok) {
        const tl = await timelineRes.json();
        setTimelineData(tl);
      }
      if (tasksRes.ok) {
        const tk = await tasksRes.json();
        setAvailableTasks(Array.isArray(tk) ? tk.filter((t: TaskOption) => t.status !== 'completed') : []);
      }
    } catch (err) {
      console.error('Erro ao carregar dados do calendário:', err);
    } finally {
      setLoading(false);
    }
  }, [selectedDate, currentRange]);

  useEffect(() => {
    fetchCalendarData();
  }, [fetchCalendarData]);

  const handleNavigateDate = (deltaDays: number) => {
    const d = new Date(`${selectedDate}T12:00:00`);
    if (viewMode === 'month') {
      d.setMonth(d.getMonth() + (deltaDays > 0 ? 1 : -1));
    } else if (viewMode === 'week') {
      d.setDate(d.getDate() + deltaDays * 7);
    } else {
      d.setDate(d.getDate() + deltaDays);
    }
    setSelectedDate(toLocalIsoDate(d));
  };

  const handleGenerate24hTimeline = async () => {
    setGenerating(true);
    try {
      const res = await fetch(`/calendar/timeline/${selectedDate}/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          respect_routine: true,
          include_events: true,
          include_pending_tasks: true,
          include_active_goals: true,
          focus_block_minutes: 90,
          break_minutes: 15,
          overwrite_unlocked: true,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setTimelineData(data);
        trackSiteEvent({
          event_type: 'TIMELINE_24H_GENERATED_UI',
          category: 'CALENDAR',
          severity: 'SUCCESS',
          endpoint: `/calendar/timeline/${selectedDate}/generate`,
          details: `Usuário gerou a Timeline de 24h para ${selectedDate}.`,
        });
        await fetchCalendarData();
      }
    } catch (err) {
      console.error('Erro ao gerar timeline 24h:', err);
    } finally {
      setGenerating(false);
    }
  };

  const handleControlBlock = async (blockId: number, action: 'start' | 'pause' | 'complete' | 'reset' | 'skip') => {
    try {
      const res = await fetch(`/calendar/timeline/blocks/${blockId}/${action}`, {
        method: 'POST',
      });
      if (res.ok) {
        await fetchCalendarData();
      }
    } catch (err) {
      console.error(`Erro ao executar ${action} no bloco:`, err);
    }
  };

  const handleToggleLockBlock = async (block: TimelineBlock) => {
    try {
      const res = await fetch(`/calendar/timeline/blocks/${block.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_locked: !block.is_locked }),
      });
      if (res.ok) {
        await fetchCalendarData();
      }
    } catch (err) {
      console.error('Erro ao alternar trava do bloco:', err);
    }
  };

  const handleDeleteBlock = async (blockId: number) => {
    try {
      const res = await fetch(`/calendar/timeline/blocks/${blockId}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        await fetchCalendarData();
      }
    } catch (err) {
      console.error('Erro ao remover bloco:', err);
    }
  };

  const handleOpenEditBlock = (b: TimelineBlock) => {
    setEditingBlock(b);
    setEditBlkTitle(b.title || '');
    setEditBlkType(b.block_type || 'focus');
    setEditBlkStart(b.start_time_str || '08:00');
    setEditBlkEnd(b.end_time_str || '09:00');
    setEditBlkPriority(b.priority || 'Média');
    setEditBlkStatus(b.status || 'planned');
    setEditBlkNotes(b.notes || '');
    setEditBlkTaskId(b.task_id || '');
    setEditBlkGoalId(b.goal_id || '');
    setEditBlkLocked(Boolean(b.is_locked));
    setEditBlkColor(b.color || '#3b82f6');
  };

  const setDurationFromStart = (minutes: number) => {
    if (!editBlkStart) return;
    const parts = editBlkStart.split(':').map(Number);
    const startMin = (parts[0] || 0) * 60 + (parts[1] || 0);
    const endMin = Math.min(1440, startMin + minutes);
    const endH = String(Math.floor(endMin / 60)).padStart(2, '0');
    const endM = String(endMin % 60).padStart(2, '0');
    setEditBlkEnd(`${endH}:${endM}`);
  };

  const computedEditDuration = useMemo(() => {
    if (!editBlkStart || !editBlkEnd) return 0;
    const sParts = editBlkStart.split(':').map(Number);
    const eParts = editBlkEnd.split(':').map(Number);
    const sMin = (sParts[0] || 0) * 60 + (sParts[1] || 0);
    const eMin = (eParts[0] || 0) * 60 + (eParts[1] || 0);
    return eMin - sMin;
  }, [editBlkStart, editBlkEnd]);

  const handleSaveEditBlock = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingBlock) return;
    if (!editBlkTitle.trim()) {
      alert('O título do bloco não pode ser vazio.');
      return;
    }
    setIsSavingBlock(true);
    try {
      const res = await fetch(`/calendar/timeline/blocks/${editingBlock.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: editBlkTitle.trim(),
          block_type: editBlkType,
          start_time_str: editBlkStart,
          end_time_str: editBlkEnd,
          priority: editBlkPriority,
          status: editBlkStatus,
          notes: editBlkNotes.trim() || null,
          is_locked: editBlkLocked,
          color: editBlkColor || undefined,
          task_id: editBlkTaskId ? Number(editBlkTaskId) : null,
          goal_id: editBlkGoalId ? Number(editBlkGoalId) : null,
        }),
      });
      if (res.ok) {
        setEditingBlock(null);
        await fetchCalendarData();
      } else {
        const errData = await res.json().catch(() => ({}));
        alert(`Erro ao atualizar bloco: ${errData.detail || 'Falha ao salvar'}`);
      }
    } catch (err: any) {
      console.error('Erro ao salvar bloco:', err);
      alert(`Erro de conexão ao salvar bloco: ${err?.message || err}`);
    } finally {
      setIsSavingBlock(false);
    }
  };

  const handleCreateEvent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!evTitle.trim()) return;
    try {
      const startIso = `${evDate}T${evStartTime}:00`;
      const endIso = `${evDate}T${evEndTime}:00`;
      const res = await fetch('/calendar/events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: evTitle.trim(),
          category: evCategory,
          start_time: startIso,
          end_time: endIso,
          location: evLocation.trim() || null,
          description: evDescription.trim() || null,
          recurrence_rule: evRecurrence,
          reminder_minutes: Number(evReminder),
          goal_id: evGoalId ? Number(evGoalId) : null,
        }),
      });
      if (res.ok) {
        setIsEventModalOpen(false);
        setEvTitle('');
        setEvLocation('');
        setEvDescription('');
        await fetchCalendarData();
      }
    } catch (err) {
      console.error('Erro ao criar evento:', err);
    }
  };

  const handleDeleteEvent = async (eventId: number) => {
    if (!confirm('Deseja cancelar e remover este evento do calendário?')) return;
    try {
      const res = await fetch(`/calendar/events/${eventId}`, { method: 'DELETE' });
      if (res.ok) {
        await fetchCalendarData();
      }
    } catch (err) {
      console.error('Erro ao excluir evento:', err);
    }
  };

  const openNewGoalModal = () => {
    setEditingGoal(null);
    setGoalTitle('');
    setGoalHorizon('weekly');
    setGoalTargetDate(selectedDate);
    setGoalPriority('Alta');
    setGoalTargetHours(6);
    setGoalDescription('');
    setGoalMilestonesText('');
    setIsGoalModalOpen(true);
  };

  const openEditGoalModal = (goal: CalendarGoal) => {
    setEditingGoal(goal);
    setGoalTitle(goal.title || '');
    setGoalHorizon((goal.horizon as any) || 'weekly');
    setGoalTargetDate(goal.target_date || selectedDate);
    setGoalPriority(goal.priority || 'Alta');
    setGoalTargetHours(goal.target_hours || 6);
    setGoalDescription(goal.description || '');
    const msText = (goal.milestones || []).map((m) => m.title).join('\n');
    setGoalMilestonesText(msText);
    setIsGoalModalOpen(true);
  };

  const handleSaveGoal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!goalTitle.trim()) return;

    if (editingGoal) {
      // Preserva o estado de conclusão dos marcos existentes caso o título coincida
      const existingMap = new Map((editingGoal.milestones || []).map((m) => [m.title.trim().toLowerCase(), m.completed]));
      const lines = goalMilestonesText
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean);
      const updatedMilestones = lines.map((line, idx) => ({
        id: (editingGoal.milestones && editingGoal.milestones[idx] && editingGoal.milestones[idx].id) || `ms_${Date.now()}_${idx}`,
        title: line,
        completed: existingMap.get(line.toLowerCase()) || false,
      }));

      try {
        const res = await fetch(`/calendar/goals/${editingGoal.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title: goalTitle.trim(),
            horizon: goalHorizon,
            target_date: goalTargetDate || selectedDate,
            priority: goalPriority,
            target_hours: Number(goalTargetHours) || 5,
            description: goalDescription.trim() || null,
            milestones: updatedMilestones,
          }),
        });
        if (res.ok) {
          setIsGoalModalOpen(false);
          setEditingGoal(null);
          setGoalTitle('');
          setGoalDescription('');
          setGoalMilestonesText('');
          await fetchCalendarData();
        }
      } catch (err) {
        console.error('Erro ao atualizar meta:', err);
      }
    } else {
      const milestones = goalMilestonesText
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean)
        .map((line, idx) => ({
          id: `ms_${Date.now()}_${idx}`,
          title: line,
          completed: false,
        }));

      try {
        const res = await fetch('/calendar/goals', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title: goalTitle.trim(),
            horizon: goalHorizon,
            target_date: goalTargetDate || selectedDate,
            priority: goalPriority,
            target_hours: Number(goalTargetHours) || 5,
            description: goalDescription.trim() || null,
            milestones,
          }),
        });
        if (res.ok) {
          setIsGoalModalOpen(false);
          setEditingGoal(null);
          setGoalTitle('');
          setGoalDescription('');
          setGoalMilestonesText('');
          await fetchCalendarData();
        }
      } catch (err) {
        console.error('Erro ao criar meta:', err);
      }
    }
  };

  const handleToggleGoalMilestone = async (goal: CalendarGoal, milestoneId: string) => {
    const updatedMilestones = goal.milestones.map((m) =>
      m.id === milestoneId ? { ...m, completed: !m.completed } : m
    );
    try {
      const res = await fetch(`/calendar/goals/${goal.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ milestones: updatedMilestones }),
      });
      if (res.ok) {
        await fetchCalendarData();
      }
    } catch (err) {
      console.error('Erro ao atualizar sub-meta:', err);
    }
  };

  const handleCompleteGoal = async (goalId: number) => {
    try {
      const res = await fetch(`/calendar/goals/${goalId}/complete`, { method: 'POST' });
      if (res.ok) {
        await fetchCalendarData();
      }
    } catch (err) {
      console.error('Erro ao concluir meta:', err);
    }
  };

  const handleDeleteGoal = async (goalId: number) => {
    if (!confirm('Deseja excluir esta meta?')) return;
    try {
      const res = await fetch(`/calendar/goals/${goalId}`, { method: 'DELETE' });
      if (res.ok) {
        await fetchCalendarData();
      }
    } catch (err) {
      console.error('Erro ao excluir meta:', err);
    }
  };

  const handleAllocateGoalToday = (goal: CalendarGoal) => {
    setBlkTitle(`Meta: ${goal.title}`);
    setBlkType('goal');
    setBlkPriority(goal.priority || 'Alta');
    setBlkGoalId(goal.id);
    setBlkTaskId('');
    const firstFree = timelineData?.free_windows?.[0];
    if (firstFree) {
      setBlkStart(firstFree.start_time);
      const startParts = firstFree.start_time.split(':').map(Number);
      const stMin = startParts[0] * 60 + startParts[1];
      const endMin = Math.min(1440, stMin + 60);
      const eh = String(Math.floor(endMin / 60)).padStart(2, '0');
      const em = String(endMin % 60).padStart(2, '0');
      setBlkEnd(`${eh}:${em}`);
    }
    setIsBlockModalOpen(true);
  };

  const handleCreateManualBlock = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!blkTitle.trim()) return;
    try {
      const res = await fetch(`/calendar/timeline/${selectedDate}/blocks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: blkTitle.trim(),
          block_type: blkType,
          start_time_str: blkStart,
          end_time_str: blkEnd,
          priority: blkPriority,
          notes: blkNotes.trim() || null,
          is_locked: blkLocked,
          task_id: blkTaskId ? Number(blkTaskId) : null,
          goal_id: blkGoalId ? Number(blkGoalId) : null,
        }),
      });
      if (res.ok) {
        setIsBlockModalOpen(false);
        setBlkTitle('');
        setBlkNotes('');
        setBlkTaskId('');
        setBlkGoalId('');
        await fetchCalendarData();
      }
    } catch (err) {
      console.error('Erro ao criar bloco manual na timeline 24h:', err);
    }
  };

  const handleCreateRoutine = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!rtTitle.trim()) return;
    try {
      const res = await fetch('/calendar/routine', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: rtTitle.trim(),
          category: rtCategory,
          start_time_str: rtStart,
          end_time_str: rtEnd,
          days_of_week: '0,1,2,3,4,5,6',
          is_active: true,
        }),
      });
      if (res.ok) {
        setRtTitle('');
        await fetchCalendarData();
      }
    } catch (err) {
      console.error('Erro ao criar rotina:', err);
    }
  };

  const handleToggleRoutine = async (rt: RoutineTemplate) => {
    try {
      const res = await fetch(`/calendar/routine/${rt.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_active: !rt.is_active }),
      });
      if (res.ok) {
        await fetchCalendarData();
      }
    } catch (err) {
      console.error('Erro ao alternar rotina:', err);
    }
  };

  const handleDeleteRoutine = async (routineId: number) => {
    try {
      const res = await fetch(`/calendar/routine/${routineId}`, { method: 'DELETE' });
      if (res.ok) {
        await fetchCalendarData();
      }
    } catch (err) {
      console.error('Erro ao remover rotina:', err);
    }
  };

  // Cálculo de tempo real do bloco em andamento
  const getLiveBlockSeconds = (block: TimelineBlock): number => {
    let base = block.actual_seconds_spent || 0;
    if (block.status === 'in_progress' && block.timer_started_at) {
      const started = new Date(
        block.timer_started_at.endsWith('Z') ? block.timer_started_at : `${block.timer_started_at}Z`
      );
      const delta = Math.max(0, Math.floor((now.getTime() - started.getTime()) / 1000));
      base += delta;
    }
    return base;
  };

  const activeRunningBlock = useMemo(() => {
    return (timelineData?.blocks || []).find((b) => b.status === 'in_progress') || null;
  }, [timelineData]);

  const currentMinuteOfDay = now.getHours() * 60 + now.getMinutes();
  const isTodaySelected = selectedDate === toLocalIsoDate(now);

  // Eventos do dia selecionado
  const eventsForSelectedDay = useMemo(() => {
    return events.filter((ev) => (ev.start_time || '').slice(0, 10) === selectedDate);
  }, [events, selectedDate]);

  // Metas filtradas
  const filteredGoals = useMemo(() => {
    if (goalFilter === 'all') return goals;
    return goals.filter((g) => g.horizon === goalFilter);
  }, [goals, goalFilter]);

  // Dias da semana para a Visão Semanal
  const weekDays = useMemo(() => {
    const base = new Date(`${selectedDate}T12:00:00`);
    const dayOfWeek = base.getDay(); // 0=Dom .. 6=Sab
    const sunday = new Date(base);
    sunday.setDate(base.getDate() - dayOfWeek);
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(sunday);
      d.setDate(sunday.getDate() + i);
      return {
        dateStr: toLocalIsoDate(d),
        dayName: WEEKDAY_NAMES[d.getDay()],
        dayNumber: d.getDate(),
      };
    });
  }, [selectedDate]);

  // Células do calendário para a Grade Mensal
  const monthGridCells = useMemo(() => {
    const base = new Date(`${selectedDate}T12:00:00`);
    const year = base.getFullYear();
    const month = base.getMonth();
    const firstDay = new Date(year, month, 1);
    const startOffset = firstDay.getDay();
    const gridStart = new Date(year, month, 1 - startOffset);

    return Array.from({ length: 42 }, (_, idx) => {
      const cellDate = new Date(gridStart);
      cellDate.setDate(gridStart.getDate() + idx);
      const dStr = toLocalIsoDate(cellDate);
      const isCurrentMonth = cellDate.getMonth() === month;
      const dayEvents = events.filter((e) => (e.start_time || '').slice(0, 10) === dStr);
      const dayGoals = goals.filter((g) => g.target_date === dStr);
      const stats = dailyStatsMap[dStr];
      return {
        dateStr: dStr,
        dayNumber: cellDate.getDate(),
        isCurrentMonth,
        dayEvents,
        dayGoals,
        stats,
      };
    });
  }, [selectedDate, events, goals, dailyStatsMap]);

  return (
    <div className="flex-1 flex flex-col px-4 sm:px-6 lg:px-8 py-6 max-w-[1600px] w-full mx-auto gap-6">
      {/* Cabeçalho Principal e Barra de Comando */}
      <div className="glass-panel rounded-2xl p-5 border border-white/10 flex flex-col xl:flex-row xl:items-center xl:justify-between gap-4">
        <div className="flex flex-col sm:flex-row sm:items-center gap-4">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-amber-500/15 border border-amber-500/40 flex items-center justify-center text-amber-400 shadow-[0_0_20px_rgba(245,158,11,0.2)]">
              <CalendarDays size={22} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl sm:text-2xl font-extrabold tracking-tight text-white">
                  Calendário, Metas & Timeline 24h
                </h1>
                <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
                  Zero-Trust AES-256
                </span>
              </div>
              <p className="text-xs text-slate-400">
                Gestão integrada de compromissos, metas e alocação inteligente nas 24 horas do dia (00:00–23:59)
              </p>
            </div>
          </div>

          {/* Navegador de Data */}
          <div className="flex items-center gap-1.5 bg-slate-900/70 border border-white/10 rounded-xl p-1">
            <button
              onClick={() => handleNavigateDate(-1)}
              className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition"
              title="Período Anterior"
            >
              <ChevronLeft size={16} />
            </button>
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => e.target.value && setSelectedDate(e.target.value)}
              className="bg-transparent text-xs font-semibold text-amber-300 px-2 py-1 focus:outline-none cursor-pointer"
            />
            <button
              onClick={() => handleNavigateDate(1)}
              className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition"
              title="Próximo Período"
            >
              <ChevronRight size={16} />
            </button>
            <button
              onClick={() => setSelectedDate(toLocalIsoDate(new Date()))}
              className="px-2.5 py-1 rounded-lg text-[11px] font-bold bg-amber-500/20 text-amber-300 hover:bg-amber-500/30 border border-amber-500/30 transition"
            >
              Hoje
            </button>
          </div>
        </div>

        {/* Seletor de Visões + Ações Rápidas */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Alternador de Visões */}
          <div className="flex items-center bg-slate-900/80 border border-white/10 rounded-xl p-1 mr-1">
            <button
              onClick={() => setViewMode('timeline')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                viewMode === 'timeline'
                  ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <ListOrdered size={14} />
              <span>Timeline 24h</span>
            </button>
            <button
              onClick={() => setViewMode('week')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                viewMode === 'week'
                  ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Columns size={14} />
              <span>Semanal</span>
            </button>
            <button
              onClick={() => setViewMode('month')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                viewMode === 'month'
                  ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <LayoutGrid size={14} />
              <span>Mensal</span>
            </button>
          </div>

          <button
            onClick={handleGenerate24hTimeline}
            disabled={generating}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold bg-gradient-to-r from-amber-500 to-yellow-500 text-slate-950 hover:brightness-110 transition shadow-[0_0_20px_rgba(245,158,11,0.3)] disabled:opacity-50"
          >
            <Zap size={14} />
            <span>{generating ? 'Gerando 24h...' : 'Gerar Timeline 24h'}</span>
          </button>

          <button
            onClick={() => {
              setEvDate(selectedDate);
              setIsEventModalOpen(true);
            }}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold bg-blue-500/15 hover:bg-blue-500/25 text-blue-300 border border-blue-500/30 transition"
          >
            <Plus size={14} />
            <span>Evento</span>
          </button>

          <button
            onClick={() => {
              setGoalTargetDate(selectedDate);
              setIsGoalModalOpen(true);
            }}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-300 border border-emerald-500/30 transition"
          >
            <Target size={14} />
            <span>Nova Meta</span>
          </button>

          <button
            onClick={() => setIsBlockModalOpen(true)}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold bg-purple-500/15 hover:bg-purple-500/25 text-purple-300 border border-purple-500/30 transition"
          >
            <Clock size={14} />
            <span>+ Bloco 24h</span>
          </button>

          <button
            onClick={() => setIsRoutineModalOpen(true)}
            className="p-2 rounded-xl text-slate-300 hover:text-amber-300 bg-white/5 hover:bg-white/10 border border-white/10 transition"
            title="Configurar Perfil de Rotina Base 24h"
          >
            <Settings2 size={16} />
          </button>
        </div>
      </div>

      {/* Cards de Indicadores das 24h e Execução em Tempo Real */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        {/* Card 1: Distribuição das 24 Horas */}
        <div className="glass-panel rounded-2xl p-4 border border-white/10 flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
              Alocação nas 24 Horas
            </span>
            <Clock size={16} className="text-amber-400" />
          </div>
          <div className="mt-2 grid grid-cols-4 gap-1 text-center">
            <div className="bg-purple-500/10 border border-purple-500/20 rounded-lg p-1.5">
              <div className="text-sm font-extrabold text-purple-300">{timelineData?.focus_hours ?? 0}h</div>
              <div className="text-[10px] text-slate-400">Foco</div>
            </div>
            <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg p-1.5">
              <div className="text-sm font-extrabold text-amber-300">{timelineData?.event_hours ?? 0}h</div>
              <div className="text-[10px] text-slate-400">Eventos</div>
            </div>
            <div className="bg-indigo-500/10 border border-indigo-500/20 rounded-lg p-1.5">
              <div className="text-sm font-extrabold text-indigo-300">{timelineData?.routine_hours ?? 0}h</div>
              <div className="text-[10px] text-slate-400">Rotina</div>
            </div>
            <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-lg p-1.5">
              <div className="text-sm font-extrabold text-emerald-300">{timelineData?.free_hours ?? 24}h</div>
              <div className="text-[10px] text-slate-400">Livre</div>
            </div>
          </div>
        </div>

        {/* Card 2: Bloco em Execução / Cronômetro Ao Vivo */}
        <div className="glass-panel rounded-2xl p-4 border border-white/10 flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
              Execução na Timeline
            </span>
            <span className="text-xs font-bold text-emerald-400">
              {timelineData?.completion_rate ?? 0}% concluído
            </span>
          </div>
          {activeRunningBlock ? (
            <div className="mt-2 flex items-center justify-between bg-emerald-500/10 border border-emerald-500/30 rounded-xl p-2.5">
              <div className="overflow-hidden pr-2">
                <div className="text-xs font-bold text-emerald-200 truncate">{activeRunningBlock.title}</div>
                <div className="text-sm font-mono font-black text-emerald-400">
                  ⏱️ {formatDurationSeconds(getLiveBlockSeconds(activeRunningBlock))}
                </div>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <button
                  onClick={() => handleControlBlock(activeRunningBlock.id, 'pause')}
                  className="p-1.5 rounded-lg bg-amber-500/20 text-amber-300 hover:bg-amber-500/30"
                  title="Pausar Bloco"
                >
                  <Pause size={14} />
                </button>
                <button
                  onClick={() => handleControlBlock(activeRunningBlock.id, 'complete')}
                  className="p-1.5 rounded-lg bg-emerald-500/20 text-emerald-300 hover:bg-emerald-500/30"
                  title="Concluir Bloco"
                >
                  <CheckCircle2 size={14} />
                </button>
              </div>
            </div>
          ) : (
            <div className="mt-2 flex items-center justify-between text-xs text-slate-400 bg-slate-900/50 rounded-xl p-2.5 border border-white/5">
              <span>Nenhum bloco com cronômetro ativo agora.</span>
              <span className="font-mono text-amber-300 font-semibold">
                {now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
              </span>
            </div>
          )}
        </div>

        {/* Card 3: Metas Ativas e Cumpridas */}
        <div className="glass-panel rounded-2xl p-4 border border-white/10 flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
              Metas do Calendário
            </span>
            <Target size={16} className="text-emerald-400" />
          </div>
          <div className="mt-2 flex items-baseline justify-between">
            <div>
              <span className="text-2xl font-black text-white">
                {goals.filter((g) => g.status === 'completed').length}
              </span>
              <span className="text-xs text-slate-400"> / {goals.length} cumpridas</span>
            </div>
            <span className="text-xs font-semibold text-amber-300">
              {goals.filter((g) => g.status !== 'completed').length} em aberto
            </span>
          </div>
          <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden mt-2">
            <div
              className="h-full bg-gradient-to-r from-emerald-500 to-teal-400 transition-all"
              style={{
                width: `${
                  goals.length > 0
                    ? Math.round(
                        goals.reduce((acc, g) => acc + (g.progress_percent || 0), 0) / goals.length
                      )
                    : 0
                }%`,
              }}
            />
          </div>
        </div>

        {/* Card 4: Integridade de Horários & Eventos */}
        <div className="glass-panel rounded-2xl p-4 border border-white/10 flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
              Status de Conflitos 24h
            </span>
            {timelineData?.conflicts && timelineData.conflicts.length > 0 ? (
              <AlertTriangle size={16} className="text-rose-400" />
            ) : (
              <Sparkles size={16} className="text-sky-400" />
            )}
          </div>
          {timelineData?.conflicts && timelineData.conflicts.length > 0 ? (
            <div className="mt-2 text-xs text-rose-300 bg-rose-500/10 border border-rose-500/30 rounded-xl p-2">
              {timelineData.conflicts.length} sobreposição(ões) de horário detectada(s) no dia.
            </div>
          ) : (
            <div className="mt-2 text-xs text-slate-300 bg-sky-500/10 border border-sky-500/20 rounded-xl p-2.5 flex items-center justify-between">
              <span>Grade 24h sincronizada sem conflitos</span>
              <span className="font-bold text-sky-300">{eventsForSelectedDay.length} evento(s)</span>
            </div>
          )}
        </div>
      </div>

      {/* Área Principal: Visão Selecionada (Esquerda) + Painel de Metas e Eventos (Direita) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 flex-1">
        {/* Coluna Principal (8 colunas) */}
        <div className="lg:col-span-8 flex flex-col gap-5">
          {/* ====================================================================
              VISÃO 1: TIMELINE DIÁRIA DE 24 HORAS (00:00 - 23:59)
             ==================================================================== */}
          {viewMode === 'timeline' && (
            <div className="glass-panel rounded-2xl p-5 border border-white/10 flex flex-col gap-5">
              {/* Barra Panorâmica Visual das 24 Horas (00:00 -> 24:00) */}
              <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <h2 className="text-sm font-bold text-white flex items-center gap-2">
                    <Clock size={16} className="text-amber-400" />
                    <span>Mapa Panorâmico de 24 Horas — {selectedDate}</span>
                  </h2>
                  <span className="text-[11px] text-slate-400">
                    00:00 às 23:59 ({timelineData?.blocks.length || 0} blocos alocados)
                  </span>
                </div>

                <div className="relative w-full h-10 bg-slate-950/90 rounded-xl border border-white/10 overflow-hidden">
                  {/* Marcações de hora em hora */}
                  {Array.from({ length: 24 }, (_, h) => (
                    <div
                      key={h}
                      className="absolute top-0 bottom-0 border-l border-white/[0.06] text-[9px] text-slate-500 pl-0.5 pt-0.5 select-none"
                      style={{ left: `${(h / 24) * 100}%` }}
                    >
                      {h % 3 === 0 ? `${String(h).padStart(2, '0')}h` : ''}
                    </div>
                  ))}

                  {/* Blocos posicionados proporcionalmente nos 1440 minutos */}
                  {(timelineData?.blocks || []).map((b) => {
                    const leftPct = (b.start_minute / 1440) * 100;
                    const widthPct = Math.max(0.8, ((b.end_minute - b.start_minute) / 1440) * 100);
                    return (
                      <div
                        key={b.id}
                        onClick={() => handleOpenEditBlock(b)}
                        title={`${b.start_time_str}–${b.end_time_str}: ${b.title} (Clique para editar)`}
                        style={{
                          left: `${leftPct}%`,
                          width: `${widthPct}%`,
                          backgroundColor: b.color || '#3b82f6',
                        }}
                        className={`absolute top-4 bottom-1 rounded-sm opacity-85 hover:opacity-100 transition cursor-pointer hover:scale-y-110 ${
                          b.status === 'completed' ? 'ring-1 ring-emerald-300' : ''
                        }`}
                      />
                    );
                  })}

                  {/* Linha do Horário Atual ("AGORA") */}
                  {isTodaySelected && (
                    <div
                      className="absolute top-0 bottom-0 w-0.5 bg-rose-500 z-20 shadow-[0_0_8px_#f43f5e]"
                      style={{ left: `${(currentMinuteOfDay / 1440) * 100}%` }}
                      title={`Agora: ${now.toLocaleTimeString('pt-BR')}`}
                    />
                  )}
                </div>
              </div>

              {/* Lista Cronológica de Blocos e Régua das 24 Horas */}
              <div className="flex flex-col gap-3 max-h-[680px] overflow-y-auto pr-1">
                {loading ? (
                  <div className="py-12 text-center text-slate-400 text-sm">
                    Carregando timeline criptografada de 24 horas...
                  </div>
                ) : (timelineData?.blocks || []).length === 0 ? (
                  <div className="py-12 px-4 text-center border border-dashed border-white/10 rounded-2xl flex flex-col items-center gap-3">
                    <Clock size={32} className="text-amber-400/70" />
                    <div>
                      <p className="text-sm font-bold text-slate-200">
                        Nenhuma timeline de 24h gerada para {selectedDate}
                      </p>
                      <p className="text-xs text-slate-400 mt-1 max-w-md">
                        Clique em <strong>"Gerar Timeline 24h"</strong> para que o Synaptix preencha automaticamente as 24 horas do dia com sua Rotina Base, Eventos, Demandas e Metas por prioridade.
                      </p>
                    </div>
                    <button
                      onClick={handleGenerate24hTimeline}
                      className="mt-1 flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold bg-amber-500 text-slate-950 hover:bg-amber-400 transition"
                    >
                      <Zap size={14} />
                      <span>Gerar Timeline 24h Agora</span>
                    </button>
                  </div>
                ) : (
                  (timelineData?.blocks || []).map((block) => {
                    const typeMeta = BLOCK_TYPE_LABELS[block.block_type] || BLOCK_TYPE_LABELS.focus;
                    const liveSeconds = getLiveBlockSeconds(block);
                    const isRunning = block.status === 'in_progress';
                    const isCompleted = block.status === 'completed';
                    const isSkipped = block.status === 'skipped';
                    const isCurrentSlot =
                      isTodaySelected &&
                      currentMinuteOfDay >= block.start_minute &&
                      currentMinuteOfDay < block.end_minute;

                    return (
                      <div
                        key={block.id}
                        className={`group relative rounded-2xl p-3.5 border transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                          isRunning
                            ? 'bg-emerald-500/10 border-emerald-500/50 shadow-[0_0_20px_rgba(16,185,129,0.15)]'
                            : isCompleted
                            ? 'bg-slate-900/40 border-emerald-500/25 opacity-80'
                            : isSkipped
                            ? 'bg-slate-900/25 border-white/5 opacity-50'
                            : isCurrentSlot
                            ? 'bg-amber-500/10 border-amber-500/40'
                            : 'bg-slate-900/65 border-white/10 hover:border-white/20'
                        }`}
                      >
                        {/* Barra lateral de cor */}
                        <div
                          className="absolute left-0 top-2.5 bottom-2.5 w-1 rounded-r"
                          style={{ backgroundColor: block.color || '#3b82f6' }}
                        />

                        <div className="flex items-start sm:items-center gap-3.5 pl-2 flex-1">
                          {/* Faixa Horária */}
                          <div
                            onClick={() => handleOpenEditBlock(block)}
                            className="min-w-[98px] text-center py-1.5 px-2 rounded-xl bg-slate-950/80 border border-white/10 cursor-pointer hover:border-amber-400/50 hover:bg-slate-900 transition"
                            title="Clique para editar este horário"
                          >
                            <div className="text-xs font-mono font-bold text-amber-300">
                              {block.start_time_str} – {block.end_time_str}
                            </div>
                            <div className="text-[10px] text-slate-400 font-medium">
                              {block.duration_minutes} min
                            </div>
                          </div>

                          {/* Informações do Bloco */}
                          <div
                            className="flex flex-col gap-1 cursor-pointer flex-1"
                            onClick={() => handleOpenEditBlock(block)}
                          >
                            <div className="flex flex-wrap items-center gap-2">
                              <span
                                className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${typeMeta.badge}`}
                              >
                                {typeMeta.label}
                              </span>
                              <span
                                className={`text-sm font-bold ${
                                  isCompleted ? 'line-through text-slate-400' : 'text-white'
                                } hover:text-amber-300 transition`}
                              >
                                {block.title}
                              </span>
                              {isCurrentSlot && (
                                <span className="text-[10px] font-extrabold px-2 py-0.5 rounded-full bg-rose-500/20 text-rose-300 border border-rose-500/40 animate-pulse">
                                  HORÁRIO ATUAL
                                </span>
                              )}
                              {block.priority && block.block_type !== 'routine' && block.block_type !== 'break' && (
                                <span className="text-[10px] px-2 py-0.5 rounded-md bg-white/5 text-slate-300 border border-white/10">
                                  {block.priority}
                                </span>
                              )}
                              {block.is_locked && (
                                <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-300 border border-amber-500/30 flex items-center gap-1" title="Bloco com horário travado">
                                  <Lock size={10} />
                                  <span>Travado</span>
                                </span>
                              )}
                            </div>

                            {block.notes && (
                              <p className="text-xs text-slate-400 line-clamp-1">{block.notes}</p>
                            )}

                            {(liveSeconds > 0 || isRunning) && (
                              <div className="flex items-center gap-2 text-[11px] font-mono text-emerald-300">
                                <span>Tempo real dedicado: {formatDurationSeconds(liveSeconds)}</span>
                              </div>
                            )}
                          </div>
                        </div>

                        {/* Controles de Execução Direta (Play / Pause / Concluir / Editar / Travar / Excluir) */}
                        <div className="flex items-center gap-1.5 self-end sm:self-center shrink-0">
                          {block.status !== 'completed' && (
                            <>
                              {isRunning ? (
                                <button
                                  onClick={() => handleControlBlock(block.id, 'pause')}
                                  className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-xs font-bold bg-amber-500/20 text-amber-300 hover:bg-amber-500/30 border border-amber-500/30 transition"
                                  title="Pausar Execução"
                                >
                                  <Pause size={13} />
                                  <span>Pausar</span>
                                </button>
                              ) : (
                                <button
                                  onClick={() => handleControlBlock(block.id, 'start')}
                                  className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-xs font-bold bg-emerald-500/20 text-emerald-300 hover:bg-emerald-500/30 border border-emerald-500/30 transition"
                                  title="Iniciar Cronômetro deste Bloco"
                                >
                                  <Play size={13} />
                                  <span>Play</span>
                                </button>
                              )}

                              <button
                                onClick={() => handleControlBlock(block.id, 'complete')}
                                className="p-1.5 rounded-xl bg-blue-500/15 text-blue-300 hover:bg-blue-500/25 border border-blue-500/30 transition"
                                title="Marcar Bloco como Concluído"
                              >
                                <CheckCircle2 size={14} />
                              </button>

                              <button
                                onClick={() => handleControlBlock(block.id, 'skip')}
                                className="p-1.5 rounded-xl bg-white/5 text-slate-400 hover:text-slate-200 hover:bg-white/10 transition"
                                title="Pular Bloco"
                              >
                                <SkipForward size={14} />
                              </button>
                            </>
                          )}

                          {block.status === 'completed' && (
                            <button
                              onClick={() => handleControlBlock(block.id, 'reset')}
                              className="flex items-center gap-1 px-2 py-1 rounded-xl text-[11px] bg-white/5 text-slate-300 hover:bg-white/10 transition"
                              title="Reabrir / Zerar Bloco"
                            >
                              <RotateCcw size={12} />
                              <span>Reabrir</span>
                            </button>
                          )}

                          {/* Botão de Editar Bloco */}
                          <button
                            onClick={() => handleOpenEditBlock(block)}
                            className="p-1.5 rounded-xl bg-white/5 text-slate-400 hover:text-amber-300 hover:bg-amber-500/10 border border-transparent hover:border-amber-500/20 transition"
                            title="Editar este bloco de horário"
                          >
                            <Pencil size={13} />
                          </button>

                          <button
                            onClick={() => handleToggleLockBlock(block)}
                            className={`p-1.5 rounded-xl transition ${
                              block.is_locked
                                ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                                : 'bg-white/5 text-slate-500 hover:text-slate-300'
                            }`}
                            title={
                              block.is_locked
                                ? 'Bloco Travado (preservado ao regerar timeline)'
                                : 'Travar bloco neste horário'
                            }
                          >
                            {block.is_locked ? <Lock size={13} /> : <Unlock size={13} />}
                          </button>

                          <button
                            onClick={() => handleDeleteBlock(block.id)}
                            className="p-1.5 rounded-xl bg-white/5 text-slate-500 hover:text-rose-400 hover:bg-rose-500/10 transition"
                            title="Remover Bloco"
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>

              {/* Janelas Livres Disponíveis nas 24h */}
              {timelineData?.free_windows && timelineData.free_windows.length > 0 && (
                <div className="pt-3 border-t border-white/10">
                  <div className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">
                    Janelas Livres nas 24 Horas (Clique para alocar bloco)
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {timelineData.free_windows.map((fw, i) => (
                      <button
                        key={i}
                        onClick={() => {
                          setBlkStart(fw.start_time);
                          setBlkEnd(fw.end_time);
                          setIsBlockModalOpen(true);
                        }}
                        className="text-xs px-3 py-1.5 rounded-xl bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-300 border border-emerald-500/25 transition flex items-center gap-1.5"
                      >
                        <Plus size={12} />
                        <span className="font-mono font-semibold">
                          {fw.start_time} – {fw.end_time}
                        </span>
                        <span className="text-[10px] text-emerald-400/80">({fw.minutes} min)</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ====================================================================
              VISÃO 2: GRADE SEMANAL (7 DIAS x 24H)
             ==================================================================== */}
          {viewMode === 'week' && (
            <div className="glass-panel rounded-2xl p-5 border border-white/10 flex flex-col gap-4">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-bold text-white flex items-center gap-2">
                  <Columns size={16} className="text-amber-400" />
                  <span>Visão Semanal de Eventos, Metas e Timelines 24h</span>
                </h2>
                <span className="text-xs text-slate-400">
                  Clique em qualquer dia para abrir sua Timeline 24h detalhada
                </span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-7 gap-2.5">
                {weekDays.map((wd) => {
                  const isSelected = wd.dateStr === selectedDate;
                  const dayEvs = events.filter((e) => (e.start_time || '').slice(0, 10) === wd.dateStr);
                  const dayGoals = goals.filter((g) => g.target_date === wd.dateStr);
                  const dayStat = dailyStatsMap[wd.dateStr];
                  const dayBlocks: TimelineBlock[] = dayStat?.blocks || [];

                  return (
                    <div
                      key={wd.dateStr}
                      onClick={() => {
                        setSelectedDate(wd.dateStr);
                        setViewMode('timeline');
                      }}
                      className={`rounded-2xl p-3 border transition cursor-pointer flex flex-col justify-between min-h-[260px] ${
                        isSelected
                          ? 'bg-amber-500/15 border-amber-500/50 shadow-[0_0_20px_rgba(245,158,11,0.15)]'
                          : 'bg-slate-900/60 border-white/10 hover:border-white/25'
                      }`}
                    >
                      <div>
                        <div className="flex items-center justify-between pb-2 mb-2 border-b border-white/10">
                          <span className="text-xs font-bold uppercase text-slate-400">{wd.dayName}</span>
                          <span
                            className={`text-sm font-black px-2 py-0.5 rounded-lg ${
                              isSelected ? 'bg-amber-400 text-slate-950' : 'text-white'
                            }`}
                          >
                            {wd.dayNumber}
                          </span>
                        </div>

                        {/* Eventos do dia */}
                        <div className="space-y-1.5">
                          {dayEvs.map((ev) => (
                            <div
                              key={`${ev.id}-${ev.start_time}`}
                              className="text-[11px] p-1.5 rounded-lg bg-amber-500/15 border border-amber-500/30 text-amber-200 truncate"
                            >
                              📅 {ev.start_time.slice(11, 16)} {ev.title}
                            </div>
                          ))}

                          {dayGoals.map((g) => (
                            <div
                              key={g.id}
                              className="text-[11px] p-1.5 rounded-lg bg-emerald-500/15 border border-emerald-500/30 text-emerald-200 truncate"
                            >
                              🎯 {g.title}
                            </div>
                          ))}

                          {dayBlocks
                            .filter((b) => b.block_type !== 'routine' && b.block_type !== 'break')
                            .slice(0, 4)
                            .map((b) => (
                              <div
                                key={b.id}
                                className="text-[10px] p-1.5 rounded-lg bg-blue-500/10 border border-blue-500/20 text-slate-200 truncate"
                              >
                                {b.start_time_str} {b.title}
                              </div>
                            ))}
                        </div>
                      </div>

                      <div className="pt-2 mt-2 border-t border-white/5 text-[10px] text-slate-400 flex items-center justify-between">
                        <span>{dayBlocks.length} blocos</span>
                        <span className="text-amber-300 font-semibold">
                          {dayStat ? `${Math.round((dayStat.focus_minutes || 0) / 60)}h foco` : 'Abrir 24h →'}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* ====================================================================
              VISÃO 3: GRADE MENSAL INTERATIVA
             ==================================================================== */}
          {viewMode === 'month' && (
            <div className="glass-panel rounded-2xl p-5 border border-white/10 flex flex-col gap-4">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-bold text-white flex items-center gap-2">
                  <LayoutGrid size={16} className="text-amber-400" />
                  <span>
                    Calendário Mensal —{' '}
                    {new Date(`${selectedDate}T12:00:00`).toLocaleDateString('pt-BR', {
                      month: 'long',
                      year: 'numeric',
                    })}
                  </span>
                </h2>
                <span className="text-xs text-slate-400">
                  Clique em um dia para inspecionar ou duplo clique para abrir a Timeline 24h
                </span>
              </div>

              <div className="grid grid-cols-7 gap-1.5 text-center text-xs font-bold uppercase text-slate-400 pb-1">
                {WEEKDAY_NAMES.map((n) => (
                  <div key={n}>{n}</div>
                ))}
              </div>

              <div className="grid grid-cols-7 gap-1.5">
                {monthGridCells.map((cell) => {
                  const isSel = cell.dateStr === selectedDate;
                  const isToday = cell.dateStr === toLocalIsoDate(now);
                  return (
                    <div
                      key={cell.dateStr}
                      onClick={() => setSelectedDate(cell.dateStr)}
                      onDoubleClick={() => {
                        setSelectedDate(cell.dateStr);
                        setViewMode('timeline');
                      }}
                      className={`min-h-[96px] rounded-xl p-2 border transition cursor-pointer flex flex-col justify-between ${
                        !cell.isCurrentMonth ? 'opacity-35 bg-slate-950/40 border-white/5' : ''
                      } ${
                        isSel
                          ? 'bg-amber-500/15 border-amber-400 shadow-[0_0_15px_rgba(245,158,11,0.2)]'
                          : 'bg-slate-900/60 border-white/10 hover:border-white/25'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span
                          className={`text-xs font-bold px-1.5 py-0.5 rounded-md ${
                            isToday
                              ? 'bg-amber-400 text-slate-950 font-black'
                              : isSel
                              ? 'text-amber-300'
                              : 'text-slate-300'
                          }`}
                        >
                          {cell.dayNumber}
                        </span>
                        {cell.stats && cell.stats.total_blocks > 0 && (
                          <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-purple-500/20 text-purple-300">
                            {cell.stats.total_blocks}b
                          </span>
                        )}
                      </div>

                      <div className="space-y-1 my-1 overflow-hidden">
                        {cell.dayEvents.slice(0, 2).map((ev) => (
                          <div
                            key={`${ev.id}-${ev.start_time}`}
                            className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-200 truncate"
                          >
                            {ev.title}
                          </div>
                        ))}
                        {cell.dayGoals.slice(0, 1).map((g) => (
                          <div
                            key={g.id}
                            className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-200 truncate"
                          >
                            🎯 {g.title}
                          </div>
                        ))}
                      </div>

                      <div className="flex items-center justify-end">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedDate(cell.dateStr);
                            setViewMode('timeline');
                          }}
                          className="text-[9px] text-slate-400 hover:text-amber-300"
                        >
                          24h →
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Coluna Lateral Direita (4 colunas): Metas a Cumprir & Eventos do Dia */}
        <div className="lg:col-span-4 flex flex-col gap-5">
          {/* Painel de Metas que Devem Ser Cumpridas */}
          <div className="glass-panel rounded-2xl p-5 border border-white/10 flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Target size={18} className="text-emerald-400" />
                <h2 className="text-sm font-bold text-white">Metas a Cumprir</h2>
              </div>
              <button
                onClick={openNewGoalModal}
                className="text-xs font-semibold text-emerald-300 hover:text-emerald-200 flex items-center gap-1"
              >
                <Plus size={14} /> Nova Meta
              </button>
            </div>

            {/* Filtro por Horizonte */}
            <div className="flex flex-wrap gap-1.5">
              {[
                { key: 'all', label: 'Todas' },
                { key: 'daily', label: 'Diárias' },
                { key: 'weekly', label: 'Semanais' },
                { key: 'monthly', label: 'Mensais' },
                { key: 'deadline', label: 'Prazos' },
              ].map((tab) => (
                <button
                  key={tab.key}
                  onClick={() => setGoalFilter(tab.key)}
                  className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition ${
                    goalFilter === tab.key
                      ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                      : 'bg-white/5 text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            <div className="space-y-3 max-h-[380px] overflow-y-auto pr-1">
              {filteredGoals.length === 0 ? (
                <div className="text-center py-6 text-xs text-slate-500 border border-dashed border-white/10 rounded-xl">
                  Nenhuma meta cadastrada neste filtro.
                </div>
              ) : (
                filteredGoals.map((goal) => (
                  <div
                    key={goal.id}
                    className={`rounded-xl p-3.5 border transition ${
                      goal.status === 'completed'
                        ? 'bg-emerald-950/20 border-emerald-500/30 opacity-80'
                        : 'bg-slate-900/70 border-white/10'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
                            {HORIZON_LABELS[goal.horizon] || goal.horizon}
                          </span>
                          <span className="text-[10px] px-2 py-0.5 rounded-full bg-white/5 text-amber-300">
                            {goal.priority}
                          </span>
                          {goal.target_date && (
                            <span className="text-[10px] text-slate-400 font-mono">
                              Até {goal.target_date}
                            </span>
                          )}
                        </div>
                        <h3
                          className={`text-sm font-bold mt-1.5 ${
                            goal.status === 'completed' ? 'line-through text-slate-400' : 'text-white'
                          }`}
                        >
                          {goal.title}
                        </h3>
                      </div>

                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => openEditGoalModal(goal)}
                          className="p-1.5 rounded-lg bg-white/5 text-slate-400 hover:text-amber-300 hover:bg-amber-500/10"
                          title="Editar Meta"
                        >
                          <Pencil size={13} />
                        </button>
                        {goal.status !== 'completed' && (
                          <button
                            onClick={() => handleCompleteGoal(goal.id)}
                            className="p-1.5 rounded-lg bg-emerald-500/15 text-emerald-300 hover:bg-emerald-500/25"
                            title="Cumprir / Concluir Meta"
                          >
                            <Check size={13} />
                          </button>
                        )}
                        <button
                          onClick={() => handleDeleteGoal(goal.id)}
                          className="p-1.5 rounded-lg bg-white/5 text-slate-400 hover:text-rose-400"
                          title="Excluir Meta"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </div>

                    {/* Barra de Progresso e Horas */}
                    <div className="mt-2.5">
                      <div className="flex items-center justify-between text-[11px] text-slate-400 mb-1">
                        <span>
                          Progresso: <strong className="text-emerald-300">{goal.progress_percent}%</strong>
                        </span>
                        <span className="font-mono">
                          {goal.logged_hours}h / {goal.target_hours}h
                        </span>
                      </div>
                      <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-gradient-to-r from-emerald-500 to-teal-400 transition-all"
                          style={{ width: `${goal.progress_percent}%` }}
                        />
                      </div>
                    </div>

                    {/* Checklist de Sub-metas (Milestones) */}
                    {goal.milestones && goal.milestones.length > 0 && (
                      <div className="mt-2.5 space-y-1 pt-2 border-t border-white/5">
                        {goal.milestones.map((ms) => (
                          <label
                            key={ms.id}
                            className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer hover:text-white"
                          >
                            <input
                              type="checkbox"
                              checked={ms.completed}
                              onChange={() => handleToggleGoalMilestone(goal, ms.id)}
                              className="rounded border-white/20 bg-slate-900 text-emerald-500 focus:ring-0"
                            />
                            <span className={ms.completed ? 'line-through text-slate-500' : ''}>
                              {ms.title}
                            </span>
                          </label>
                        ))}
                      </div>
                    )}

                    {/* Botão para alocar na Timeline 24h de hoje */}
                    {goal.status !== 'completed' && (
                      <div className="mt-3 pt-2 border-t border-white/5 flex justify-end">
                        <button
                          onClick={() => handleAllocateGoalToday(goal)}
                          className="text-[11px] font-semibold text-amber-300 hover:text-amber-200 flex items-center gap-1"
                        >
                          <Clock size={12} /> Alocar bloco nas 24h do dia
                        </button>
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Painel de Eventos do Dia Selecionado */}
          <div className="glass-panel rounded-2xl p-5 border border-white/10 flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <CalendarIcon size={17} className="text-amber-400" />
                <h2 className="text-sm font-bold text-white">Eventos em {selectedDate}</h2>
              </div>
              <button
                onClick={() => {
                  setEvDate(selectedDate);
                  setIsEventModalOpen(true);
                }}
                className="text-xs font-semibold text-amber-300 hover:text-amber-200 flex items-center gap-1"
              >
                <Plus size={14} /> Agendar
              </button>
            </div>

            <div className="space-y-2.5 max-h-[260px] overflow-y-auto pr-1">
              {eventsForSelectedDay.length === 0 ? (
                <div className="text-center py-6 text-xs text-slate-500 border border-dashed border-white/10 rounded-xl">
                  Nenhum evento fixo agendado para esta data.
                </div>
              ) : (
                eventsForSelectedDay.map((ev) => (
                  <div
                    key={`${ev.id}-${ev.start_time}`}
                    className="rounded-xl p-3 bg-slate-900/70 border border-white/10 flex items-start justify-between gap-2"
                  >
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span
                          className="w-2 h-2 rounded-full"
                          style={{ backgroundColor: ev.color || '#f59e0b' }}
                        />
                        <span className="text-xs font-mono font-bold text-amber-300">
                          {ev.start_time.slice(11, 16)} – {ev.end_time.slice(11, 16)}
                        </span>
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-white/5 text-slate-300">
                          {ev.category}
                        </span>
                      </div>
                      <div className="text-sm font-bold text-white">{ev.title}</div>
                      {ev.location && (
                        <div className="text-[11px] text-slate-400 flex items-center gap-1">
                          <MapPin size={11} /> {ev.location}
                        </div>
                      )}
                      {ev.recurrence_rule && ev.recurrence_rule !== 'none' && (
                        <div className="text-[10px] text-indigo-300 flex items-center gap-1">
                          <Repeat size={11} /> {RECURRENCE_LABELS[ev.recurrence_rule] || ev.recurrence_rule}
                        </div>
                      )}
                    </div>
                    <button
                      onClick={() => handleDeleteEvent(ev.id)}
                      className="p-1.5 rounded-lg text-slate-500 hover:text-rose-400 hover:bg-rose-500/10"
                      title="Cancelar Evento"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ========================================================================
          MODAL 1: NOVO EVENTO DO CALENDÁRIO
         ======================================================================== */}
      {isEventModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="glass-panel rounded-2xl border border-white/15 w-full max-w-lg p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <CalendarIcon size={18} className="text-amber-400" />
                <span>Agendar Novo Evento no Calendário</span>
              </h3>
              <button onClick={() => setIsEventModalOpen(false)} className="text-slate-400 hover:text-white">
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleCreateEvent} className="space-y-3.5">
              <div>
                <label className="text-xs font-semibold text-slate-300">Título do Evento *</label>
                <input
                  type="text"
                  required
                  value={evTitle}
                  onChange={(e) => setEvTitle(e.target.value)}
                  placeholder="Ex: Reunião de Alinhamento Arquitetura"
                  className="w-full mt-1 glass-input rounded-xl p-2.5 text-sm text-white"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-slate-300">Categoria</label>
                  <select
                    value={evCategory}
                    onChange={(e) => setEvCategory(e.target.value)}
                    className="w-full mt-1 glass-input rounded-xl p-2.5 text-sm text-white bg-slate-900"
                  >
                    {['Compromisso', 'Reunião', 'Foco', 'Estudo', 'Saúde', 'Pessoal', 'Prazo'].map((c) => (
                      <option key={c} value={c} className="bg-slate-900">
                        {c}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-300">Recorrência</label>
                  <select
                    value={evRecurrence}
                    onChange={(e) => setEvRecurrence(e.target.value)}
                    className="w-full mt-1 glass-input rounded-xl p-2.5 text-sm text-white bg-slate-900"
                  >
                    {Object.entries(RECURRENCE_LABELS).map(([k, v]) => (
                      <option key={k} value={k} className="bg-slate-900">
                        {v}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="text-xs font-semibold text-slate-300">Data</label>
                  <input
                    type="date"
                    required
                    value={evDate}
                    onChange={(e) => setEvDate(e.target.value)}
                    className="w-full mt-1 glass-input rounded-xl p-2.5 text-xs text-white"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-300">Início</label>
                  <input
                    type="time"
                    required
                    value={evStartTime}
                    onChange={(e) => setEvStartTime(e.target.value)}
                    className="w-full mt-1 glass-input rounded-xl p-2.5 text-xs text-white"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-300">Término</label>
                  <input
                    type="time"
                    required
                    value={evEndTime}
                    onChange={(e) => setEvEndTime(e.target.value)}
                    className="w-full mt-1 glass-input rounded-xl p-2.5 text-xs text-white"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-slate-300">Local / Link</label>
                  <input
                    type="text"
                    value={evLocation}
                    onChange={(e) => setEvLocation(e.target.value)}
                    placeholder="Sala / Google Meet / Zoom"
                    className="w-full mt-1 glass-input rounded-xl p-2.5 text-xs text-white"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-300">Lembrete (min antes)</label>
                  <input
                    type="number"
                    min={0}
                    max={1440}
                    value={evReminder}
                    onChange={(e) => setEvReminder(Number(e.target.value))}
                    className="w-full mt-1 glass-input rounded-xl p-2.5 text-xs text-white"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-300">Vincular a uma Meta (opcional)</label>
                <select
                  value={evGoalId}
                  onChange={(e) => setEvGoalId(e.target.value ? Number(e.target.value) : '')}
                  className="w-full mt-1 glass-input rounded-xl p-2.5 text-xs text-white bg-slate-900"
                >
                  <option value="" className="bg-slate-900">
                    Nenhuma meta vinculada
                  </option>
                  {goals.map((g) => (
                    <option key={g.id} value={g.id} className="bg-slate-900">
                      {g.title} ({HORIZON_LABELS[g.horizon] || g.horizon})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-300">Descrição / Pauta</label>
                <textarea
                  rows={2}
                  value={evDescription}
                  onChange={(e) => setEvDescription(e.target.value)}
                  className="w-full mt-1 glass-input rounded-xl p-2.5 text-xs text-white"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsEventModalOpen(false)}
                  className="px-4 py-2 rounded-xl text-xs font-semibold bg-white/5 text-slate-300"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl text-xs font-bold bg-amber-500 text-slate-950 hover:bg-amber-400"
                >
                  Salvar Evento & Sincronizar 24h
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================
          MODAL 2: NOVA META DO CALENDÁRIO
         ======================================================================== */}
      {isGoalModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="glass-panel rounded-2xl border border-white/15 w-full max-w-lg p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <Target size={18} className="text-emerald-400" />
                <span>{editingGoal ? 'Editar Meta' : 'Criar Nova Meta a Cumprir'}</span>
              </h3>
              <button
                onClick={() => {
                  setIsGoalModalOpen(false);
                  setEditingGoal(null);
                }}
                className="text-slate-400 hover:text-white"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSaveGoal} className="space-y-3.5">
              <div>
                <label className="text-xs font-semibold text-slate-300">Título da Meta *</label>
                <input
                  type="text"
                  required
                  value={goalTitle}
                  onChange={(e) => setGoalTitle(e.target.value)}
                  placeholder="Ex: Concluir módulo de segurança e documentação"
                  className="w-full mt-1 glass-input rounded-xl p-2.5 text-sm text-white"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-slate-300">Horizonte da Meta</label>
                  <select
                    value={goalHorizon}
                    onChange={(e) => setGoalHorizon(e.target.value as any)}
                    className="w-full mt-1 glass-input rounded-xl p-2.5 text-xs text-white bg-slate-900"
                  >
                    <option value="daily" className="bg-slate-900">Meta Diária</option>
                    <option value="weekly" className="bg-slate-900">Meta Semanal</option>
                    <option value="monthly" className="bg-slate-900">Meta Mensal</option>
                    <option value="deadline" className="bg-slate-900">Prazo Específico (Deadline)</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-300">Data-Limite / Alvo</label>
                  <input
                    type="date"
                    value={goalTargetDate}
                    onChange={(e) => setGoalTargetDate(e.target.value)}
                    className="w-full mt-1 glass-input rounded-xl p-2.5 text-xs text-white"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-slate-300">Prioridade</label>
                  <select
                    value={goalPriority}
                    onChange={(e) => setGoalPriority(e.target.value)}
                    className="w-full mt-1 glass-input rounded-xl p-2.5 text-xs text-white bg-slate-900"
                  >
                    {['Crítica', 'Alta', 'Média', 'Baixa', 'Muito Baixa'].map((p) => (
                      <option key={p} value={p} className="bg-slate-900">
                        {p}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-300">Horas Planejadas para Cumprir</label>
                  <input
                    type="number"
                    step="0.5"
                    min="0.5"
                    value={goalTargetHours}
                    onChange={(e) => setGoalTargetHours(Number(e.target.value))}
                    className="w-full mt-1 glass-input rounded-xl p-2.5 text-xs text-white"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-300">Descrição / Contexto (Opcional)</label>
                <textarea
                  rows={2}
                  value={goalDescription}
                  onChange={(e) => setGoalDescription(e.target.value)}
                  placeholder="Detalhes ou diretrizes adicionais sobre esta meta"
                  className="w-full mt-1 glass-input rounded-xl p-2.5 text-xs text-white"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-300">
                  Sub-metas / Checklist (uma por linha, opcional)
                </label>
                <textarea
                  rows={3}
                  value={goalMilestonesText}
                  onChange={(e) => setGoalMilestonesText(e.target.value)}
                  placeholder={'Definir escopo técnico\nExecutar bateria de testes\nRevisar entrega final'}
                  className="w-full mt-1 glass-input rounded-xl p-2.5 text-xs text-white"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setIsGoalModalOpen(false);
                    setEditingGoal(null);
                  }}
                  className="px-4 py-2 rounded-xl text-xs font-semibold bg-white/5 text-slate-300"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl text-xs font-bold bg-emerald-500 text-slate-950 hover:bg-emerald-400"
                >
                  {editingGoal ? 'Salvar Alterações' : 'Registrar Meta'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================
          MODAL 3: ADICIONAR BLOCO MANUAL NA TIMELINE DE 24H
         ======================================================================== */}
      {isBlockModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="glass-panel rounded-2xl border border-white/15 w-full max-w-lg p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <Clock size={18} className="text-purple-400" />
                <span>Alocar Bloco na Timeline 24h ({selectedDate})</span>
              </h3>
              <button onClick={() => setIsBlockModalOpen(false)} className="text-slate-400 hover:text-white">
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleCreateManualBlock} className="space-y-3.5">
              <div>
                <label className="text-xs font-semibold text-slate-300">Título do Bloco *</label>
                <input
                  type="text"
                  required
                  value={blkTitle}
                  onChange={(e) => setBlkTitle(e.target.value)}
                  placeholder="Ex: Deep Work — Implementação Backend"
                  className="w-full mt-1 glass-input rounded-xl p-2.5 text-sm text-white"
                />
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="text-xs font-semibold text-slate-300">Tipo</label>
                  <select
                    value={blkType}
                    onChange={(e) => setBlkType(e.target.value)}
                    className="w-full mt-1 glass-input rounded-xl p-2.5 text-xs text-white bg-slate-900"
                  >
                    <option value="focus" className="bg-slate-900">Bloco de Foco</option>
                    <option value="task" className="bg-slate-900">Demanda</option>
                    <option value="goal" className="bg-slate-900">Meta</option>
                    <option value="routine" className="bg-slate-900">Rotina</option>
                    <option value="break" className="bg-slate-900">Pausa</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-300">Início (00:00–23:59)</label>
                  <input
                    type="time"
                    required
                    value={blkStart}
                    onChange={(e) => setBlkStart(e.target.value)}
                    className="w-full mt-1 glass-input rounded-xl p-2.5 text-xs text-white"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-300">Fim (00:00–24:00)</label>
                  <input
                    type="time"
                    required
                    value={blkEnd}
                    onChange={(e) => setBlkEnd(e.target.value)}
                    className="w-full mt-1 glass-input rounded-xl p-2.5 text-xs text-white"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-slate-300">Vincular Demanda (Task)</label>
                  <select
                    value={blkTaskId}
                    onChange={(e) => {
                      const val = e.target.value ? Number(e.target.value) : '';
                      setBlkTaskId(val);
                      if (val) {
                        const found = availableTasks.find((t) => t.id === val);
                        if (found && !blkTitle) setBlkTitle(`Demanda: ${found.name}`);
                        setBlkType('task');
                      }
                    }}
                    className="w-full mt-1 glass-input rounded-xl p-2.5 text-xs text-white bg-slate-900"
                  >
                    <option value="" className="bg-slate-900">Nenhuma demanda</option>
                    {availableTasks.map((t) => (
                      <option key={t.id} value={t.id} className="bg-slate-900">
                        #{t.id} - {t.name} ({t.estimated_hours}h)
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-300">Vincular Meta</label>
                  <select
                    value={blkGoalId}
                    onChange={(e) => setBlkGoalId(e.target.value ? Number(e.target.value) : '')}
                    className="w-full mt-1 glass-input rounded-xl p-2.5 text-xs text-white bg-slate-900"
                  >
                    <option value="" className="bg-slate-900">Nenhuma meta</option>
                    {goals.map((g) => (
                      <option key={g.id} value={g.id} className="bg-slate-900">
                        {g.title}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-300">Observações</label>
                <input
                  type="text"
                  value={blkNotes}
                  onChange={(e) => setBlkNotes(e.target.value)}
                  className="w-full mt-1 glass-input rounded-xl p-2.5 text-xs text-white"
                />
              </div>

              <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={blkLocked}
                  onChange={(e) => setBlkLocked(e.target.checked)}
                />
                <span>Travar horário deste bloco (não mover ao regerar a timeline de 24h)</span>
              </label>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsBlockModalOpen(false)}
                  className="px-4 py-2 rounded-xl text-xs font-semibold bg-white/5 text-slate-300"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl text-xs font-bold bg-purple-500 text-white hover:bg-purple-400"
                >
                  Salvar Bloco nas 24h
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================
          MODAL DE EDIÇÃO DE BLOCO DA TIMELINE 24H
         ======================================================================== */}
      {editingBlock && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
          <div className="glass-panel rounded-2xl border border-white/20 w-full max-w-xl p-6 space-y-4 shadow-2xl my-8">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-amber-500/15 border border-amber-500/30 text-amber-300">
                  <Pencil size={18} />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white">Editar Bloco de Horário</h3>
                  <p className="text-xs text-slate-400">
                    {editingBlock.date_str} • {editingBlock.start_time_str} às {editingBlock.end_time_str}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setEditingBlock(null)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSaveEditBlock} className="space-y-4">
              {/* Título do Bloco */}
              <div>
                <label className="text-xs font-semibold text-slate-300">Título do Bloco *</label>
                <input
                  type="text"
                  required
                  value={editBlkTitle}
                  onChange={(e) => setEditBlkTitle(e.target.value)}
                  placeholder="Ex: Inventário dos Celulares"
                  className="w-full mt-1 glass-input rounded-xl p-2.5 text-sm text-white focus:border-amber-400 transition"
                />
              </div>

              {/* Tipo, Status e Prioridade em 3 colunas */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="text-xs font-semibold text-slate-300">Tipo de Bloco</label>
                  <select
                    value={editBlkType}
                    onChange={(e) => setEditBlkType(e.target.value)}
                    className="w-full mt-1 glass-input rounded-xl p-2.5 text-xs text-white bg-slate-900"
                  >
                    <option value="focus" className="bg-slate-900">Bloco de Foco</option>
                    <option value="task" className="bg-slate-900">Demanda</option>
                    <option value="goal" className="bg-slate-900">Meta</option>
                    <option value="routine" className="bg-slate-900">Rotina 24h</option>
                    <option value="event" className="bg-slate-900">Evento Fixo</option>
                    <option value="break" className="bg-slate-900">Pausa / Almoço</option>
                  </select>
                </div>

                <div>
                  <label className="text-xs font-semibold text-slate-300">Status</label>
                  <select
                    value={editBlkStatus}
                    onChange={(e) => setEditBlkStatus(e.target.value)}
                    className="w-full mt-1 glass-input rounded-xl p-2.5 text-xs text-white bg-slate-900"
                  >
                    <option value="planned" className="bg-slate-900">Planejado</option>
                    <option value="in_progress" className="bg-slate-900">Em Execução</option>
                    <option value="completed" className="bg-slate-900">Concluído</option>
                    <option value="skipped" className="bg-slate-900">Pulado</option>
                  </select>
                </div>

                <div>
                  <label className="text-xs font-semibold text-slate-300">Prioridade</label>
                  <select
                    value={editBlkPriority}
                    onChange={(e) => setEditBlkPriority(e.target.value)}
                    className="w-full mt-1 glass-input rounded-xl p-2.5 text-xs text-white bg-slate-900"
                  >
                    <option value="Baixa" className="bg-slate-900">Baixa</option>
                    <option value="Média" className="bg-slate-900">Média</option>
                    <option value="Alta" className="bg-slate-900">Alta</option>
                    <option value="Urgente" className="bg-slate-900">Urgente</option>
                  </select>
                </div>
              </div>

              {/* Horários de Início e Término */}
              <div className="p-3.5 rounded-xl bg-slate-950/70 border border-white/10 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-amber-300 flex items-center gap-1.5">
                    <Clock size={14} />
                    <span>Alocação de Horário (00:00 às 23:59)</span>
                  </span>
                  {computedEditDuration > 0 ? (
                    <span className="text-xs font-mono font-bold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-lg border border-emerald-500/20">
                      {computedEditDuration} min ({(computedEditDuration / 60).toFixed(1)}h)
                    </span>
                  ) : (
                    <span className="text-xs text-rose-400 font-semibold">
                      ⚠️ Término deve ser maior que início
                    </span>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[11px] font-semibold text-slate-400">Início</label>
                    <input
                      type="time"
                      required
                      value={editBlkStart}
                      onChange={(e) => setEditBlkStart(e.target.value)}
                      className="w-full mt-1 glass-input rounded-xl p-2.5 text-sm text-white font-mono"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] font-semibold text-slate-400">Término</label>
                    <input
                      type="time"
                      required
                      value={editBlkEnd}
                      onChange={(e) => setEditBlkEnd(e.target.value)}
                      className="w-full mt-1 glass-input rounded-xl p-2.5 text-sm text-white font-mono"
                    />
                  </div>
                </div>

                {/* Atalhos de Duração Rápida */}
                <div>
                  <div className="text-[10px] uppercase font-bold text-slate-400 mb-1.5">
                    Ajustar Duração a partir do Início:
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {[
                      { label: '+15m', min: 15 },
                      { label: '+30m', min: 30 },
                      { label: '+45m', min: 45 },
                      { label: '+1h', min: 60 },
                      { label: '+1h30', min: 90 },
                      { label: '+2h', min: 120 },
                      { label: '+3h', min: 180 },
                    ].map((preset) => (
                      <button
                        type="button"
                        key={preset.min}
                        onClick={() => setDurationFromStart(preset.min)}
                        className="px-2 py-1 rounded-lg text-[11px] font-semibold bg-white/5 hover:bg-amber-500/20 text-slate-300 hover:text-amber-300 border border-white/10 hover:border-amber-500/30 transition"
                      >
                        {preset.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Vínculo de Tarefa e Meta */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-slate-300">Vincular Demanda (Task)</label>
                  <select
                    value={editBlkTaskId}
                    onChange={(e) => {
                      const val = e.target.value ? Number(e.target.value) : '';
                      setEditBlkTaskId(val);
                      if (val) {
                        const found = availableTasks.find((t) => t.id === val);
                        if (found && !editBlkTitle) setEditBlkTitle(`Demanda: ${found.name}`);
                        setEditBlkType('task');
                      }
                    }}
                    className="w-full mt-1 glass-input rounded-xl p-2.5 text-xs text-white bg-slate-900"
                  >
                    <option value="" className="bg-slate-900">Nenhuma demanda</option>
                    {availableTasks.map((t) => (
                      <option key={t.id} value={t.id} className="bg-slate-900">
                        #{t.id} - {t.name} ({t.estimated_hours}h)
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-xs font-semibold text-slate-300">Vincular Meta</label>
                  <select
                    value={editBlkGoalId}
                    onChange={(e) => setEditBlkGoalId(e.target.value ? Number(e.target.value) : '')}
                    className="w-full mt-1 glass-input rounded-xl p-2.5 text-xs text-white bg-slate-900"
                  >
                    <option value="" className="bg-slate-900">Nenhuma meta</option>
                    {goals.map((g) => (
                      <option key={g.id} value={g.id} className="bg-slate-900">
                        {g.title}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Cor do Bloco */}
              <div>
                <label className="text-xs font-semibold text-slate-300 mb-1.5 block">Cor do Bloco</label>
                <div className="flex items-center gap-2 flex-wrap">
                  {[
                    { color: '#8b5cf6', label: 'Roxo (Foco)' },
                    { color: '#3b82f6', label: 'Azul (Demanda)' },
                    { color: '#10b981', label: 'Esmeralda (Meta)' },
                    { color: '#f59e0b', label: 'Âmbar (Evento)' },
                    { color: '#6366f1', label: 'Índigo (Rotina)' },
                    { color: '#ec4899', label: 'Rosa (Reunião)' },
                    { color: '#64748b', label: 'Cinza (Pausa)' },
                    { color: '#ef4444', label: 'Vermelho (Urgente)' },
                  ].map((c) => (
                    <button
                      type="button"
                      key={c.color}
                      onClick={() => setEditBlkColor(c.color)}
                      style={{ backgroundColor: c.color }}
                      className={`w-6 h-6 rounded-full transition-transform ${
                        editBlkColor === c.color
                          ? 'ring-2 ring-white scale-125 shadow-lg'
                          : 'opacity-70 hover:opacity-100 hover:scale-110'
                      }`}
                      title={c.label}
                    />
                  ))}
                </div>
              </div>

              {/* Observações */}
              <div>
                <label className="text-xs font-semibold text-slate-300">Observações / Anotações</label>
                <textarea
                  rows={2}
                  value={editBlkNotes}
                  onChange={(e) => setEditBlkNotes(e.target.value)}
                  placeholder="Anotações contextuais, links ou lembretes sobre este bloco..."
                  className="w-full mt-1 glass-input rounded-xl p-2.5 text-xs text-white resize-none"
                />
              </div>

              {/* Checkbox Travar Horário */}
              <label className="flex items-center gap-2.5 p-2.5 rounded-xl bg-white/5 border border-white/10 cursor-pointer">
                <input
                  type="checkbox"
                  checked={editBlkLocked}
                  onChange={(e) => setEditBlkLocked(e.target.checked)}
                  className="rounded border-white/20 text-amber-500 focus:ring-0"
                />
                <div className="text-xs">
                  <span className="font-bold text-slate-200 flex items-center gap-1.5">
                    <Lock size={12} className="text-amber-400" />
                    <span>Travar horário deste bloco</span>
                  </span>
                  <p className="text-[11px] text-slate-400">
                    Impede que o algoritmo inteligente desloque ou remova este bloco ao clicar em "Gerar Timeline 24h".
                  </p>
                </div>
              </label>

              {/* Rodapé: Excluir, Cancelar, Salvar */}
              <div className="flex items-center justify-between pt-3 border-t border-white/10">
                <button
                  type="button"
                  onClick={async () => {
                    if (confirm(`Deseja realmente remover o bloco "${editingBlock.title}" da timeline?`)) {
                      await handleDeleteBlock(editingBlock.id);
                      setEditingBlock(null);
                    }
                  }}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold bg-rose-500/15 text-rose-300 hover:bg-rose-500/25 border border-rose-500/30 transition"
                >
                  <Trash2 size={13} />
                  <span>Excluir Bloco</span>
                </button>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setEditingBlock(null)}
                    className="px-4 py-2 rounded-xl text-xs font-semibold bg-white/5 text-slate-300 hover:bg-white/10 transition"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={isSavingBlock}
                    className="flex items-center gap-1.5 px-5 py-2 rounded-xl text-xs font-bold bg-amber-500 hover:bg-amber-400 text-slate-950 transition disabled:opacity-50"
                  >
                    <Check size={14} />
                    <span>{isSavingBlock ? 'Salvando...' : 'Salvar Alterações'}</span>
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================
          MODAL 4: PERFIL DE ROTINA BASE 24H (SONO, REFEIÇÕES, BLOCOS FIXOS)
         ======================================================================== */}
      {isRoutineModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="glass-panel rounded-2xl border border-white/15 w-full max-w-xl p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <div>
                <h3 className="text-base font-bold text-white flex items-center gap-2">
                  <Settings2 size={18} className="text-amber-400" />
                  <span>Perfil de Rotina Base 24 Horas</span>
                </h3>
                <p className="text-xs text-slate-400">
                  Estes blocos fixos são respeitados pelo gerador automático da Timeline de 24h
                </p>
              </div>
              <button onClick={() => setIsRoutineModalOpen(false)} className="text-slate-400 hover:text-white">
                <X size={18} />
              </button>
            </div>

            <div className="space-y-2 max-h-[260px] overflow-y-auto pr-1">
              {routines.map((rt) => (
                <div
                  key={rt.id}
                  className="flex items-center justify-between p-2.5 rounded-xl bg-slate-900/80 border border-white/10"
                >
                  <div className="flex items-center gap-3">
                    <input
                      type="checkbox"
                      checked={rt.is_active}
                      onChange={() => handleToggleRoutine(rt)}
                    />
                    <div>
                      <div className="text-xs font-bold text-white">{rt.title}</div>
                      <div className="text-[11px] font-mono text-amber-300">
                        {rt.start_time_str} – {rt.end_time_str} ({rt.category})
                      </div>
                    </div>
                  </div>
                  <button
                    onClick={() => handleDeleteRoutine(rt.id)}
                    className="p-1.5 text-slate-500 hover:text-rose-400"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
            </div>

            <form onSubmit={handleCreateRoutine} className="pt-3 border-t border-white/10 space-y-3">
              <div className="text-xs font-bold text-slate-300">Adicionar Novo Bloco de Rotina Fixa</div>
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-2">
                <input
                  type="text"
                  required
                  value={rtTitle}
                  onChange={(e) => setRtTitle(e.target.value)}
                  placeholder="Ex: Leitura Noturna"
                  className="sm:col-span-2 glass-input rounded-xl p-2 text-xs text-white"
                />
                <input
                  type="time"
                  required
                  value={rtStart}
                  onChange={(e) => setRtStart(e.target.value)}
                  className="glass-input rounded-xl p-2 text-xs text-white"
                />
                <input
                  type="time"
                  required
                  value={rtEnd}
                  onChange={(e) => setRtEnd(e.target.value)}
                  className="glass-input rounded-xl p-2 text-xs text-white"
                />
              </div>
              <div className="flex justify-between items-center">
                <select
                  value={rtCategory}
                  onChange={(e) => setRtCategory(e.target.value)}
                  className="glass-input rounded-xl p-2 text-xs text-white bg-slate-900"
                >
                  <option value="sleep" className="bg-slate-900">Sono / Descanso</option>
                  <option value="meal" className="bg-slate-900">Alimentação</option>
                  <option value="health" className="bg-slate-900">Saúde / Treino</option>
                  <option value="routine" className="bg-slate-900">Rotina Geral</option>
                </select>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl text-xs font-bold bg-amber-500 text-slate-950 hover:bg-amber-400"
                >
                  + Adicionar à Rotina 24h
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
