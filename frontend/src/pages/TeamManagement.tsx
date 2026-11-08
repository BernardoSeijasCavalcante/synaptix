import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Users,
  CheckSquare,
  CalendarDays,
  BookOpen,
  Shield,
  Plus,
  RefreshCw,
  Filter,
  Lock,
  Unlock,
  Clock,
  Laptop,
  X,
  Activity,
  Link2,
  Copy,
  Pencil,
  Trash2,
  KeyRound,
  Eye,
  Bold,
  Italic,
  List,
  ListOrdered,
  Quote,
  Code,
  Table as TableIcon
} from 'lucide-react';
import { MarkdownRenderer } from './TeamPortal';

function formatErrorMessage(data: any, fallbackText?: string): string {
  if (!data) return fallbackText || 'Erro inesperado no servidor.';
  if (typeof data === 'string') return data;
  if (typeof data.detail === 'string') return data.detail;
  if (Array.isArray(data.detail)) {
    return data.detail
      .map((item: any) => {
        const field = item.loc ? item.loc[item.loc.length - 1] : 'campo';
        return `• ${field}: ${item.msg}`;
      })
      .join('\n');
  }
  return fallbackText || JSON.stringify(data);
}

function formatMinutesToTime(min?: number): string {
  if (min === undefined || min === null) return '00:00';
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
}

interface MemberSummary {
  id: number;
  username: string;
  full_name: string;
  role: string;
  is_active: boolean;
  devices_count: number;
  pending_devices_count: number;
  tasks_count: number;
  completed_tasks_count: number;
  in_progress_tasks_count: number;
  last_seen_at?: string;
  require_device_approval?: boolean;
}

interface MemberDevice {
  id: string;
  device_name: string;
  is_approved: boolean;
  revoked_at?: string;
  created_at: string;
  last_seen_at?: string;
}

interface TeamAdminTask {
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
  member_id: number;
  assigned_by_leader: boolean;
  scheduled_date?: string;
  linked_note_id?: number;
  execution_notes?: string;
  created_at: string;
}

interface RoutineTemplateItem {
  id: number;
  title: string;
  description?: string;
  category: string;
  start_time_str: string;
  end_time_str: string;
  days_of_week: string;
  color: string;
  is_active: boolean;
  member_id: number;
  assigned_by_leader: boolean;
  checklist?: Array<{ id: string; text: string; done: boolean }>;
  linked_note_id?: number;
}

interface TeamAdminAuditLog {
  id: number;
  created_at: string;
  member_id?: number;
  event_type: string;
  description: string;
  category: string;
  severity: string;
}

interface SharedNote {
  id: number;
  title: string;
  content: string;
  is_team_shared: boolean;
  allow_member_edit: boolean;
  created_by_leader: boolean;
  updated_at: string;
}

function formatSeconds(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

async function parseJsonSafely(res: Response): Promise<{ ok: boolean; data: any; errorText?: string }> {
  try {
    const text = await res.text();
    if (!text) {
      return { ok: res.ok, data: null, errorText: `HTTP ${res.status}: Resposta vazia do servidor` };
    }
    const data = JSON.parse(text);
    return { ok: res.ok, data };
  } catch {
    return {
      ok: false,
      data: null,
      errorText: `HTTP ${res.status}: ${res.statusText || 'Resposta inesperada do servidor'}`,
    };
  }
}

export default function TeamManagement() {
  const [activeTab, setActiveTab] = useState<'members' | 'tasks' | 'routines' | 'timeline' | 'pops' | 'audit'>('members');

  // Summary and members
  const [summary, setSummary] = useState<MemberSummary[]>([]);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [selectedMemberId, setSelectedMemberId] = useState<number | 'all'>('all');

  // Create member modal
  const [isNewMemberModalOpen, setIsNewMemberModalOpen] = useState(false);
  const [newUsername, setNewUsername] = useState('');
  const [newFullName, setNewFullName] = useState('');
  const [newRole, setNewRole] = useState('Analista');
  const [newPassword, setNewPassword] = useState('');
  const [newRequireDeviceApproval, setNewRequireDeviceApproval] = useState(true);
  const [newMustChangePassword, setNewMustChangePassword] = useState(false);

  // Edit member modal
  const [editingMember, setEditingMember] = useState<MemberSummary | null>(null);
  const [editFullName, setEditFullName] = useState('');
  const [editUsername, setEditUsername] = useState('');
  const [editRole, setEditRole] = useState('Analista');
  const [editPassword, setEditPassword] = useState('');
  const [editRequireDeviceApproval, setEditRequireDeviceApproval] = useState(true);
  const [editIsActive, setEditIsActive] = useState(true);
  const [isSavingMember, setIsSavingMember] = useState(false);

  // Quick reset password modal
  const [passwordModalMember, setPasswordModalMember] = useState<MemberSummary | null>(null);
  const [resetPasswordInput, setResetPasswordInput] = useState('');
  const [resetPasswordConfirm, setResetPasswordConfirm] = useState('');
  const [isResettingPassword, setIsResettingPassword] = useState(false);

  // Devices modal
  const [selectedMemberForDevices, setSelectedMemberForDevices] = useState<MemberSummary | null>(null);
  const [memberDevices, setMemberDevices] = useState<MemberDevice[]>([]);
  const [devicesLoading, setDevicesLoading] = useState(false);

  // Tasks state
  const [tasks, setTasks] = useState<TeamAdminTask[]>([]);
  const [tasksLoading, setTasksLoading] = useState(false);
  const [isNewTaskModalOpen, setIsNewTaskModalOpen] = useState(false);
  const [assignMemberId, setAssignMemberId] = useState<number>(0);
  const [taskTitle, setTaskTitle] = useState('');
  const [taskDesc, setTaskDesc] = useState('');
  const [taskCategory, setTaskCategory] = useState('Operacional');
  const [taskPriority, setTaskPriority] = useState('Média');
  const [taskEstimatedHours, setTaskEstimatedHours] = useState(2);
  const [taskScheduledDate, setTaskScheduledDate] = useState('');

  // Edit Task modal state
  const [editingTask, setEditingTask] = useState<TeamAdminTask | null>(null);
  const [editTaskTitle, setEditTaskTitle] = useState('');
  const [editTaskDesc, setEditTaskDesc] = useState('');
  const [editTaskCategory, setEditTaskCategory] = useState('Operacional');
  const [editTaskPriority, setEditTaskPriority] = useState('Média');
  const [editTaskEstimatedHours, setEditTaskEstimatedHours] = useState(2);
  const [editTaskMemberId, setEditTaskMemberId] = useState<number>(0);
  const [editTaskStatus, setEditTaskStatus] = useState('pending');
  const [isUpdatingTask, setIsUpdatingTask] = useState(false);

  // Routines state
  const [routines, setRoutines] = useState<RoutineTemplateItem[]>([]);
  const [routinesLoading, setRoutinesLoading] = useState(false);
  const [isNewRoutineModalOpen, setIsNewRoutineModalOpen] = useState(false);
  const [routineMemberId, setRoutineMemberId] = useState<number>(0);
  const [routineTitle, setRoutineTitle] = useState('');
  const [routineStartTime, setRoutineStartTime] = useState('08:00');
  const [routineEndTime, setRoutineEndTime] = useState('09:00');
  const [checklistInputs, setChecklistInputs] = useState<string[]>(['']);

  // Timeline monitoring state (Leader inspecting operator)
  const [timelineMemberId, setTimelineMemberId] = useState<number>(0);
  const [timelineDate, setTimelineDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [memberTimelineBlocks, setMemberTimelineBlocks] = useState<any[]>([]);
  const [memberTimelineStats, setMemberTimelineStats] = useState<any>(null);
  const [memberTimelineLoading, setMemberTimelineLoading] = useState(false);

  // POPs state
  const [pops, setPops] = useState<SharedNote[]>([]);
  const [popsLoading, setPopsLoading] = useState(false);
  const [isNewPopModalOpen, setIsNewPopModalOpen] = useState(false);
  const [popTitle, setPopTitle] = useState('');
  const [popContent, setPopContent] = useState('');
  const [popAllowEdit, setPopAllowEdit] = useState(false);
  const [selectedPopForView, setSelectedPopForView] = useState<SharedNote | null>(null);
  const [newPopTab, setNewPopTab] = useState<'edit' | 'preview'>('edit');
  const popTextareaRef = useRef<HTMLTextAreaElement>(null);

  // Audit state
  const [auditLogs, setAuditLogs] = useState<TeamAdminAuditLog[]>([]);
  const [auditLoading, setAuditLoading] = useState(false);

  const fetchSummary = useCallback(async () => {
    setSummaryLoading(true);
    try {
      const res = await fetch('/team-admin/summary');
      const parsed = await parseJsonSafely(res);
      if (parsed.ok && Array.isArray(parsed.data)) {
        setSummary(parsed.data);
      }
    } catch (err) {
      console.error('Erro ao buscar sumário da equipe:', err);
    } finally {
      setSummaryLoading(false);
    }
  }, []);

  const fetchTasks = useCallback(async (memberId = selectedMemberId) => {
    setTasksLoading(true);
    try {
      const headers: Record<string, string> = {};
      if (memberId !== 'all') {
        headers['X-Team-Scope'] = `member:${memberId}`;
      } else {
        headers['X-Team-Scope'] = 'all';
      }
      const res = await fetch('/team-admin/tasks', { headers });
      const parsed = await parseJsonSafely(res);
      if (parsed.ok && Array.isArray(parsed.data)) {
        setTasks(parsed.data);
      }
    } catch (err) {
      console.error('Erro ao buscar tarefas:', err);
    } finally {
      setTasksLoading(false);
    }
  }, [selectedMemberId]);

  const fetchRoutines = useCallback(async (memberId = selectedMemberId) => {
    setRoutinesLoading(true);
    try {
      const headers: Record<string, string> = {};
      if (memberId !== 'all') {
        headers['X-Team-Scope'] = `member:${memberId}`;
      } else {
        headers['X-Team-Scope'] = 'all';
      }
      const res = await fetch('/team-admin/calendar/routine', { headers });
      const parsed = await parseJsonSafely(res);
      if (parsed.ok && parsed.data) {
        const list = Array.isArray(parsed.data) ? parsed.data : (parsed.data.routines || []);
        setRoutines(list);
      }
    } catch (err) {
      console.error('Erro ao buscar rotinas:', err);
    } finally {
      setRoutinesLoading(false);
    }
  }, [selectedMemberId]);

  const fetchMemberTimeline = useCallback(async (memberId = timelineMemberId, dateStr = timelineDate) => {
    if (!memberId) return;
    setMemberTimelineLoading(true);
    try {
      const res = await fetch(`/team-admin/calendar/timeline/${dateStr}`, {
        headers: { 'X-Team-Scope': `member:${memberId}` },
      });
      const parsed = await parseJsonSafely(res);
      if (parsed.ok && parsed.data) {
        setMemberTimelineBlocks(parsed.data.blocks || []);
        setMemberTimelineStats(parsed.data);
      }
    } catch (err) {
      console.error('Erro ao buscar timeline do membro:', err);
    } finally {
      setMemberTimelineLoading(false);
    }
  }, [timelineMemberId, timelineDate]);

  const fetchPops = useCallback(async () => {
    setPopsLoading(true);
    try {
      const res = await fetch('/team-admin/notes', {
        headers: { 'X-Team-Scope': 'shared-rw' },
      });
      const parsed = await parseJsonSafely(res);
      if (parsed.ok && Array.isArray(parsed.data)) {
        setPops(parsed.data);
      }
    } catch (err) {
      console.error('Erro ao buscar POPs:', err);
    } finally {
      setPopsLoading(false);
    }
  }, []);

  const fetchAuditLogs = useCallback(async () => {
    setAuditLoading(true);
    try {
      const res = await fetch('/team-admin/audit-logs?limit=150');
      const parsed = await parseJsonSafely(res);
      if (parsed.ok && Array.isArray(parsed.data)) {
        setAuditLogs(parsed.data);
      }
    } catch (err) {
      console.error('Erro ao buscar auditoria:', err);
    } finally {
      setAuditLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSummary();
  }, [fetchSummary]);

  useEffect(() => {
    if (activeTab === 'tasks') fetchTasks(selectedMemberId);
    if (activeTab === 'routines') fetchRoutines(selectedMemberId);
    if (activeTab === 'timeline') {
      const mId = timelineMemberId || (typeof selectedMemberId === 'number' ? selectedMemberId : summary[0]?.id || 0);
      if (mId && mId !== timelineMemberId) setTimelineMemberId(mId);
      if (mId) fetchMemberTimeline(mId, timelineDate);
    }
    if (activeTab === 'pops') fetchPops();
    if (activeTab === 'audit') fetchAuditLogs();
  }, [activeTab, selectedMemberId, timelineMemberId, timelineDate, summary, fetchTasks, fetchRoutines, fetchMemberTimeline, fetchPops, fetchAuditLogs]);

  // Member Devices
  const openDevicesModal = async (m: MemberSummary) => {
    setSelectedMemberForDevices(m);
    setDevicesLoading(true);
    try {
      const res = await fetch(`/team-admin/members/${m.id}/devices`);
      const parsed = await parseJsonSafely(res);
      if (parsed.ok && Array.isArray(parsed.data)) {
        setMemberDevices(parsed.data);
      }
    } catch (err) {
      console.error('Erro ao buscar dispositivos:', err);
    } finally {
      setDevicesLoading(false);
    }
  };

  const handleApproveDevice = async (deviceId: string) => {
    if (!selectedMemberForDevices) return;
    const res = await fetch(`/team-admin/members/${selectedMemberForDevices.id}/devices/${deviceId}/approve`, {
      method: 'POST',
    });
    if (res.ok) {
      openDevicesModal(selectedMemberForDevices);
      fetchSummary();
    }
  };

  const handleRevokeDevice = async (deviceId: string) => {
    if (!selectedMemberForDevices) return;
    if (!confirm('Deseja realmente revogar e bloquear este dispositivo imediatamente?')) return;
    const res = await fetch(`/team-admin/members/${selectedMemberForDevices.id}/devices/${deviceId}/revoke`, {
      method: 'POST',
    });
    if (res.ok) {
      openDevicesModal(selectedMemberForDevices);
      fetchSummary();
    }
  };

  // Create Member
  const handleCreateMember = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newUsername.trim() || !newPassword.trim()) return;
    const res = await fetch('/team-admin/members', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: newUsername.trim().toLowerCase(),
        display_name: newFullName.trim(),
        full_name: newFullName.trim(),
        role_title: newRole.trim(),
        role: newRole.trim(),
        password: newPassword,
        require_device_approval: newRequireDeviceApproval,
        must_change_password: newMustChangePassword,
      }),
    });
    const parsed = await parseJsonSafely(res);
    if (parsed.ok) {
      setIsNewMemberModalOpen(false);
      setNewUsername('');
      setNewFullName('');
      setNewPassword('');
      fetchSummary();
    } else {
      const msg = formatErrorMessage(parsed.data, parsed.errorText || 'Falha ao criar liderado');
      alert(`Erro ao cadastrar liderado:\n${msg}`);
    }
  };

  const handleToggleMemberActive = async (m: MemberSummary) => {
    const action = m.is_active ? 'desativar' : 'reativar';
    if (!confirm(`Deseja realmente ${action} o liderado ${m.full_name}?`)) return;
    const res = await fetch(`/team-admin/members/${m.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_active: !m.is_active }),
    });
    if (res.ok) fetchSummary();
  };

  const handleOpenEditMember = (m: MemberSummary) => {
    setEditingMember(m);
    setEditFullName(m.full_name || '');
    setEditUsername(m.username || '');
    setEditRole(m.role || 'Analista');
    setEditPassword('');
    setEditRequireDeviceApproval(m.require_device_approval ?? true);
    setEditIsActive(m.is_active);
  };

  const handleSaveEditMember = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingMember) return;
    if (!editFullName.trim() || !editUsername.trim()) {
      alert('Nome completo e nome de usuário são obrigatórios.');
      return;
    }
    if (editPassword.trim() && editPassword.trim().length < 8) {
      alert('A nova senha deve conter no mínimo 8 caracteres.');
      return;
    }
    setIsSavingMember(true);
    try {
      const payload: any = {
        full_name: editFullName.trim(),
        display_name: editFullName.trim(),
        username: editUsername.trim().toLowerCase(),
        role: editRole.trim(),
        role_title: editRole.trim(),
        is_active: editIsActive,
        require_device_approval: editRequireDeviceApproval,
      };
      if (editPassword.trim()) {
        payload.password = editPassword.trim();
      }
      const res = await fetch(`/team-admin/members/${editingMember.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const parsed = await parseJsonSafely(res);
      if (parsed.ok) {
        setEditingMember(null);
        fetchSummary();
      } else {
        const msg = formatErrorMessage(parsed.data, parsed.errorText || 'Falha ao atualizar liderado');
        alert(`Erro ao atualizar liderado:\n${msg}`);
      }
    } catch (err) {
      console.error('Erro ao atualizar liderado:', err);
      alert('Erro de conexão ao salvar alterações do liderado.');
    } finally {
      setIsSavingMember(false);
    }
  };

  const handleOpenPasswordModal = (m: MemberSummary) => {
    setPasswordModalMember(m);
    setResetPasswordInput('');
    setResetPasswordConfirm('');
  };

  const handleSaveResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!passwordModalMember) return;
    if (resetPasswordInput.length < 8) {
      alert('A nova senha deve ter no mínimo 8 caracteres.');
      return;
    }
    if (resetPasswordInput !== resetPasswordConfirm) {
      alert('A confirmação da senha não coincide com a nova senha digitada.');
      return;
    }
    setIsResettingPassword(true);
    try {
      const res = await fetch(`/team-admin/members/${passwordModalMember.id}/reset-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: resetPasswordInput }),
      });
      const parsed = await parseJsonSafely(res);
      if (parsed.ok) {
        alert(`Senha do liderado ${passwordModalMember.full_name} (@${passwordModalMember.username}) atualizada com sucesso!`);
        setPasswordModalMember(null);
        fetchSummary();
      } else {
        const msg = formatErrorMessage(parsed.data, parsed.errorText || 'Falha ao redefinir senha');
        alert(`Erro ao redefinir senha:\n${msg}`);
      }
    } catch (err) {
      console.error('Erro ao redefinir senha:', err);
      alert('Erro de conexão ao redefinir senha.');
    } finally {
      setIsResettingPassword(false);
    }
  };

  const handleDeleteMember = async (m: MemberSummary) => {
    const confirmMsg = `Deseja realmente EXCLUIR PERMANENTEMENTE o liderado "${m.full_name}" (@${m.username})?\n\n` +
      `ATENÇÃO: Todas as demandas, rotinas, fluxos e dispositivos vinculados a este liderado também serão removidos.`;
    if (!confirm(confirmMsg)) return;

    try {
      const res = await fetch(`/team-admin/members/${m.id}`, {
        method: 'DELETE',
      });
      const parsed = await parseJsonSafely(res);
      if (parsed.ok) {
        if (editingMember?.id === m.id) setEditingMember(null);
        if (passwordModalMember?.id === m.id) setPasswordModalMember(null);
        if (selectedMemberId === m.id) setSelectedMemberId('all');
        fetchSummary();
        if (activeTab === 'tasks') fetchTasks('all');
        if (activeTab === 'routines') fetchRoutines('all');
      } else {
        const msg = formatErrorMessage(parsed.data, parsed.errorText || 'Falha ao excluir liderado');
        alert(`Erro ao excluir liderado:\n${msg}`);
      }
    } catch (err) {
      console.error('Erro ao excluir liderado:', err);
      alert('Erro de conexão ao excluir liderado.');
    }
  };

  // Create Task
  const handleAssignTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!assignMemberId || !taskTitle.trim()) {
      alert('Selecione um liderado e informe o título da demanda.');
      return;
    }
    const res = await fetch('/team-admin/tasks', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Team-Scope': `member:${assignMemberId}`,
      },
      body: JSON.stringify({
        name: taskTitle,
        description: taskDesc,
        category: taskCategory,
        priority: taskPriority,
        estimated_hours: taskEstimatedHours,
        scheduled_date: taskScheduledDate || undefined,
      }),
    });
    const parsed = await parseJsonSafely(res);
    if (parsed.ok) {
      setIsNewTaskModalOpen(false);
      setTaskTitle('');
      setTaskDesc('');
      fetchTasks(selectedMemberId);
      fetchSummary();
    } else {
      const msg = formatErrorMessage(parsed.data, parsed.errorText || 'Falha ao atribuir demanda');
      alert(`Erro ao atribuir demanda:\n${msg}`);
    }
  };

  // Open Edit Task Modal
  const handleOpenEditTask = (t: TeamAdminTask) => {
    setEditingTask(t);
    setEditTaskTitle(t.name);
    setEditTaskDesc(t.description || '');
    setEditTaskCategory(t.category || 'Operacional');
    setEditTaskPriority(t.priority || 'Média');
    setEditTaskEstimatedHours(t.estimated_hours || 2);
    setEditTaskMemberId(t.member_id || 0);
    setEditTaskStatus(t.status || 'pending');
  };

  // Save Task Edits
  const handleSaveEditTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingTask) return;
    if (!editTaskTitle.trim()) {
      alert('O título da demanda não pode ser vazio.');
      return;
    }
    setIsUpdatingTask(true);
    try {
      const res = await fetch(`/team-admin/tasks/${editingTask.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'X-Team-Scope': 'all',
        },
        body: JSON.stringify({
          name: editTaskTitle.trim(),
          description: editTaskDesc.trim() || undefined,
          category: editTaskCategory,
          priority: editTaskPriority,
          estimated_hours: editTaskEstimatedHours,
          member_id: editTaskMemberId || undefined,
          status: editTaskStatus,
        }),
      });
      const parsed = await parseJsonSafely(res);
      if (parsed.ok) {
        setEditingTask(null);
        fetchTasks(selectedMemberId);
        fetchSummary();
      } else {
        const msg = formatErrorMessage(parsed.data, parsed.errorText || 'Falha ao atualizar demanda');
        alert(`Erro ao atualizar demanda:\n${msg}`);
      }
    } catch (err: any) {
      alert(`Erro de conexão ao atualizar demanda: ${err?.message || err}`);
    } finally {
      setIsUpdatingTask(false);
    }
  };

  // Delete Task
  const handleDeleteTask = async (t: TeamAdminTask) => {
    if (!confirm(`Deseja realmente excluir permanentemente a demanda "${t.name}"?`)) return;
    try {
      const res = await fetch(`/team-admin/tasks/${t.id}`, {
        method: 'DELETE',
        headers: {
          'X-Team-Scope': 'all',
        },
      });
      const parsed = await parseJsonSafely(res);
      if (parsed.ok) {
        if (editingTask?.id === t.id) {
          setEditingTask(null);
        }
        fetchTasks(selectedMemberId);
        fetchSummary();
      } else {
        const msg = formatErrorMessage(parsed.data, parsed.errorText || 'Falha ao excluir demanda');
        alert(`Erro ao excluir demanda:\n${msg}`);
      }
    } catch (err: any) {
      alert(`Erro de conexão ao excluir demanda: ${err?.message || err}`);
    }
  };

  // Delete Routine
  const handleDeleteRoutine = async (r: RoutineTemplateItem) => {
    if (!confirm(`Deseja realmente excluir o fluxo diário "${r.title}"?`)) return;
    try {
      const res = await fetch(`/team-admin/calendar/routine/${r.id}`, {
        method: 'DELETE',
        headers: {
          'X-Team-Scope': 'all',
        },
      });
      const parsed = await parseJsonSafely(res);
      if (parsed.ok) {
        fetchRoutines(selectedMemberId);
        fetchSummary();
      } else {
        const msg = formatErrorMessage(parsed.data, parsed.errorText || 'Falha ao excluir fluxo');
        alert(`Erro ao excluir fluxo:\n${msg}`);
      }
    } catch (err: any) {
      alert(`Erro de conexão ao excluir fluxo: ${err?.message || err}`);
    }
  };

  // Delete POP
  const handleDeletePop = async (p: SharedNote) => {
    if (!confirm(`Deseja realmente excluir o POP "${p.title}"?`)) return;
    try {
      const res = await fetch(`/team-admin/notes/${p.id}`, {
        method: 'DELETE',
        headers: {
          'X-Team-Scope': 'all',
        },
      });
      const parsed = await parseJsonSafely(res);
      if (parsed.ok) {
        fetchPops();
      } else {
        const msg = formatErrorMessage(parsed.data, parsed.errorText || 'Falha ao excluir POP');
        alert(`Erro ao excluir POP:\n${msg}`);
      }
    } catch (err: any) {
      alert(`Erro de conexão ao excluir POP: ${err?.message || err}`);
    }
  };

  // Create Routine
  const handleCreateRoutine = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!routineTitle.trim()) {
      alert('Informe o título do fluxo diário.');
      return;
    }
    const cleanChecklist = checklistInputs
      .filter((t) => t.trim().length > 0)
      .map((t) => ({ text: t.trim(), done: false }));

    const res = await fetch('/team-admin/calendar/routine', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Team-Scope': routineMemberId === 0 ? 'all' : `member:${routineMemberId}`,
      },
      body: JSON.stringify({
        title: routineTitle,
        start_time_str: routineStartTime,
        end_time_str: routineEndTime,
        checklist: cleanChecklist,
      }),
    });
    const parsed = await parseJsonSafely(res);
    if (parsed.ok) {
      setIsNewRoutineModalOpen(false);
      setRoutineTitle('');
      setChecklistInputs(['']);
      fetchRoutines(selectedMemberId);
    } else {
      const msg = formatErrorMessage(parsed.data, parsed.errorText || 'Falha ao criar fluxo diário');
      alert(`Erro ao criar fluxo diário:\n${msg}`);
    }
  };

  // Create POP
  const handleCreatePop = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!popTitle.trim()) return;
    const res = await fetch('/team-admin/notes', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Team-Scope': popAllowEdit ? 'shared-rw' : 'shared-ro',
      },
      body: JSON.stringify({
        title: popTitle,
        content: popContent,
        notebook_id: undefined,
      }),
    });
    const parsed = await parseJsonSafely(res);
    if (parsed.ok) {
      setIsNewPopModalOpen(false);
      setPopTitle('');
      setPopContent('');
      fetchPops();
    } else {
      const msg = formatErrorMessage(parsed.data, parsed.errorText || 'Falha ao publicar POP');
      alert(`Erro ao publicar POP:\n${msg}`);
    }
  };

  const totalMembers = summary.length;
  const activeMembers = summary.filter((m) => m.is_active).length;
  const totalTasks = summary.reduce((acc, m) => acc + m.tasks_count, 0);
  const totalPendingDevices = summary.reduce((acc, m) => acc + m.pending_devices_count, 0);

  return (
    <div className="p-6 lg:p-8 max-w-7xl mx-auto w-full space-y-6">
      {/* Top Header & Breadcrumbs */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <h1 className="text-2xl font-black tracking-tight bg-gradient-to-r from-amber-200 via-yellow-300 to-amber-500 bg-clip-text text-transparent">
              Gestão de Equipe & Demandas
            </h1>
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-500/15 border border-amber-500/30 text-amber-300">
              Ambiente Dedicado
            </span>
          </div>
          <p className="text-xs text-slate-400">
            Governança isolada, fluxos diários 24h, POPs e delegação com proteção criptográfica Zero-Trust.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              fetchSummary();
              if (activeTab === 'tasks') fetchTasks();
              if (activeTab === 'routines') fetchRoutines();
              if (activeTab === 'pops') fetchPops();
              if (activeTab === 'audit') fetchAuditLogs();
            }}
            className="p-2 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] text-slate-300 border border-white/[0.08] transition-all"
            title="Atualizar dados"
          >
            <RefreshCw size={16} className={summaryLoading ? 'animate-spin' : ''} />
          </button>
          <button
            onClick={() => setIsNewMemberModalOpen(true)}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 font-bold text-xs shadow-md shadow-amber-500/20 transition-all"
          >
            <Plus size={15} />
            <span>Novo Liderado</span>
          </button>
        </div>
      </div>

      {/* KPI Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="p-4 rounded-2xl bg-white/[0.02] border border-white/[0.08] flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-blue-500/15 border border-blue-500/30 flex items-center justify-center text-blue-300">
            <Users size={18} />
          </div>
          <div>
            <span className="text-lg font-black text-slate-100">{activeMembers} / {totalMembers}</span>
            <p className="text-[11px] text-slate-400">Liderados Ativos</p>
          </div>
        </div>

        <div className="p-4 rounded-2xl bg-white/[0.02] border border-white/[0.08] flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-300">
            <CheckSquare size={18} />
          </div>
          <div>
            <span className="text-lg font-black text-slate-100">{totalTasks}</span>
            <p className="text-[11px] text-slate-400">Demandas na Equipe</p>
          </div>
        </div>

        <div className="p-4 rounded-2xl bg-white/[0.02] border border-white/[0.08] flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-emerald-300">
            <Laptop size={18} />
          </div>
          <div>
            <span className="text-lg font-black text-slate-100">
              {totalPendingDevices > 0 ? (
                <span className="text-amber-300">{totalPendingDevices} pendentes</span>
              ) : (
                '100% OK'
              )}
            </span>
            <p className="text-[11px] text-slate-400">Dispositivos Equipe</p>
          </div>
        </div>

        <div className="p-4 rounded-2xl bg-white/[0.02] border border-white/[0.08] flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-purple-500/15 border border-purple-500/30 flex items-center justify-center text-purple-300">
            <Shield size={18} />
          </div>
          <div>
            <span className="text-lg font-black text-slate-100">Zero-Trust</span>
            <p className="text-[11px] text-slate-400">Isolamento de Banco</p>
          </div>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="flex items-center gap-2 border-b border-white/[0.08] pb-3 overflow-x-auto">
        <button
          onClick={() => setActiveTab('members')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all ${
            activeTab === 'members'
              ? 'bg-amber-500/15 text-amber-300 border border-amber-500/40 shadow-sm'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <Users size={14} />
          <span>Liderados & Dispositivos</span>
          {totalPendingDevices > 0 && (
            <span className="px-1.5 py-0.2 rounded-full bg-amber-400 text-slate-950 text-[10px] font-black">
              {totalPendingDevices}
            </span>
          )}
        </button>

        <button
          onClick={() => setActiveTab('tasks')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all ${
            activeTab === 'tasks'
              ? 'bg-amber-500/15 text-amber-300 border border-amber-500/40 shadow-sm'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <CheckSquare size={14} />
          <span>Demandas da Equipe</span>
        </button>

        <button
          onClick={() => setActiveTab('routines')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all ${
            activeTab === 'routines'
              ? 'bg-amber-500/15 text-amber-300 border border-amber-500/40 shadow-sm'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <CalendarDays size={14} />
          <span>Fluxos Diários (SOPs & Rotinas)</span>
        </button>

        <button
          onClick={() => setActiveTab('timeline')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all ${
            activeTab === 'timeline'
              ? 'bg-amber-500/15 text-amber-300 border border-amber-500/40 shadow-sm'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <Clock size={14} />
          <span>Timeline dos Liderados</span>
        </button>

        <button
          onClick={() => setActiveTab('pops')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all ${
            activeTab === 'pops'
              ? 'bg-amber-500/15 text-amber-300 border border-amber-500/40 shadow-sm'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <BookOpen size={14} />
          <span>POPs da Equipe</span>
        </button>

        <button
          onClick={() => setActiveTab('audit')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all ${
            activeTab === 'audit'
              ? 'bg-amber-500/15 text-amber-300 border border-amber-500/40 shadow-sm'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <Activity size={14} />
          <span>Auditoria da Equipe</span>
        </button>
      </div>

      {/* Member Filter Selector (when in tasks or routines) */}
      {(activeTab === 'tasks' || activeTab === 'routines') && (
        <div className="flex items-center justify-between bg-white/[0.02] p-3 rounded-2xl border border-white/[0.08]">
          <div className="flex items-center gap-2">
            <Filter size={14} className="text-slate-400" />
            <span className="text-xs font-semibold text-slate-300">Liderado:</span>
            <select
              value={selectedMemberId}
              onChange={(e) => setSelectedMemberId(e.target.value === 'all' ? 'all' : parseInt(e.target.value))}
              className="px-3 py-1.5 rounded-xl bg-white/[0.04] border border-white/[0.08] text-xs text-slate-200 focus:outline-none focus:border-amber-400/50"
            >
              <option value="all" className="bg-[#0d1428]">Todos os Liderados</option>
              {summary.map((m) => (
                <option key={m.id} value={m.id} className="bg-[#0d1428]">
                  {m.full_name} ({m.username})
                </option>
              ))}
            </select>
          </div>

          <div>
            {activeTab === 'tasks' && (
              <button
                onClick={() => {
                  setAssignMemberId(typeof selectedMemberId === 'number' ? selectedMemberId : summary[0]?.id || 0);
                  setIsNewTaskModalOpen(true);
                }}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs"
              >
                <Plus size={14} />
                <span>Atribuir Demanda</span>
              </button>
            )}
            {activeTab === 'routines' && (
              <button
                onClick={() => {
                  setRoutineMemberId(typeof selectedMemberId === 'number' ? selectedMemberId : summary[0]?.id || 0);
                  setIsNewRoutineModalOpen(true);
                }}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs"
              >
                <Plus size={14} />
                <span>Novo Fluxo Diário</span>
              </button>
            )}
          </div>
        </div>
      )}

      {/* ===================== TAB: MEMBROS & DISPOSITIVOS ===================== */}
      {activeTab === 'members' && (
        <div className="space-y-4">
          <div className="p-4 rounded-2xl bg-gradient-to-r from-amber-500/10 via-amber-500/5 to-transparent border border-amber-500/20 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-amber-500/20 text-amber-300 flex items-center justify-center shrink-0">
                <Link2 size={18} />
              </div>
              <div>
                <span className="text-xs font-bold text-amber-200 block">Link de Acesso para os seus Liderados</span>
                <p className="text-xs text-slate-300 font-mono select-all">
                  {typeof window !== 'undefined' ? `${window.location.origin}/equipe` : '/equipe'}
                </p>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  Envie este link para sua equipe. Eles farão login com o usuário e a senha cadastrados abaixo.
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={async () => {
                  try {
                    const res = await fetch('/team-auth/unban-ips', { method: 'POST' });
                    if (res.ok) {
                      alert('Bloqueios temporários de IP liberados com sucesso! Sua equipe já pode tentar o login.');
                    } else {
                      alert('Não foi possível liberar os bloqueios.');
                    }
                  } catch (err) {
                    alert('Erro de conexão ao liberar bloqueios.');
                  }
                }}
                className="px-3.5 py-2 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] text-slate-300 border border-white/[0.1] text-xs font-semibold flex items-center gap-1.5 transition-all shrink-0 cursor-pointer"
                title="Libera qualquer IP que tenha sido bloqueado temporariamente por tentativas repetidas"
              >
                <Unlock size={13} />
                <span>Liberar Bloqueios de IP</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  const link = `${window.location.origin}/equipe`;
                  navigator.clipboard.writeText(link);
                  alert(`Link copiado com sucesso:\n${link}`);
                }}
                className="px-3.5 py-2 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 text-amber-200 border border-amber-500/40 text-xs font-bold flex items-center gap-1.5 transition-all shrink-0 cursor-pointer"
              >
                <Copy size={13} />
                <span>Copiar Link da Equipe</span>
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {summary.map((m) => (
              <div
                key={m.id}
                className="p-5 rounded-2xl bg-white/[0.02] border border-white/[0.08] hover:border-white/[0.14] transition-all flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-center justify-between gap-2 mb-3">
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-white/[0.06] text-slate-300">
                      {m.role}
                    </span>
                    <span
                      className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                        m.is_active
                          ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                          : 'bg-rose-500/10 border-rose-500/30 text-rose-300'
                      }`}
                    >
                      {m.is_active ? 'Ativo' : 'Desativado'}
                    </span>
                  </div>

                  <h3 className="font-bold text-base text-slate-100">{m.full_name}</h3>
                  <p className="text-xs text-slate-400 mb-4">@{m.username}</p>

                  <div className="grid grid-cols-2 gap-2 text-xs text-slate-400 pt-3 border-t border-white/[0.06] mb-4">
                    <div>
                      <span className="text-slate-500 block text-[10px]">Demandas</span>
                      <span className="font-semibold text-slate-200">
                        {m.completed_tasks_count} / {m.tasks_count} concluídas
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-500 block text-[10px]">Dispositivos</span>
                      <span className="font-semibold text-slate-200">
                        {m.devices_count} autorizados
                        {m.pending_devices_count > 0 && (
                          <span className="ml-1 text-amber-400 font-bold">({m.pending_devices_count} pendentes)</span>
                        )}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-1.5 pt-3 border-t border-white/[0.06]">
                  <button
                    type="button"
                    onClick={() => openDevicesModal(m)}
                    className="flex-1 py-1.5 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] text-xs font-semibold text-slate-200 border border-white/[0.08] flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <Laptop size={13} className="text-blue-400" />
                    <span>Dispositivos</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleOpenEditMember(m)}
                    title="Editar Liderado (Nome, Cargo, Senha)"
                    className="p-2 rounded-xl bg-white/[0.04] hover:bg-amber-500/20 text-slate-300 hover:text-amber-300 border border-white/[0.08] text-xs transition-all cursor-pointer"
                  >
                    <Pencil size={13} />
                  </button>

                  <button
                    type="button"
                    onClick={() => handleOpenPasswordModal(m)}
                    title="Trocar / Redefinir Senha do Liderado"
                    className="p-2 rounded-xl bg-white/[0.04] hover:bg-blue-500/20 text-slate-300 hover:text-blue-300 border border-white/[0.08] text-xs transition-all cursor-pointer"
                  >
                    <KeyRound size={13} />
                  </button>

                  <button
                    type="button"
                    onClick={() => handleToggleMemberActive(m)}
                    title={m.is_active ? 'Desativar acesso' : 'Reativar acesso'}
                    className={`p-2 rounded-xl border text-xs transition-all cursor-pointer ${
                      m.is_active
                        ? 'bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 border-rose-500/30'
                        : 'bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
                    }`}
                  >
                    {m.is_active ? <Lock size={13} /> : <Unlock size={13} />}
                  </button>

                  <button
                    type="button"
                    onClick={() => handleDeleteMember(m)}
                    title="Excluir Liderado Permanentemente"
                    className="p-2 rounded-xl bg-white/[0.04] hover:bg-rose-500/20 text-slate-400 hover:text-rose-300 border border-white/[0.08] text-xs transition-all cursor-pointer"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ===================== TAB: DEMANDAS DA EQUIPE ===================== */}
      {activeTab === 'tasks' && (
        <div className="space-y-4">
          {tasksLoading ? (
            <div className="py-20 text-center text-slate-400">
              <RefreshCw size={24} className="animate-spin mx-auto mb-2 text-amber-400" />
              <p className="text-xs">Carregando demandas da equipe...</p>
            </div>
          ) : tasks.length === 0 ? (
            <div className="py-20 text-center text-slate-500 bg-white/[0.01] rounded-2xl border border-white/[0.06]">
              <CheckSquare size={36} className="mx-auto mb-2 opacity-40" />
              <p className="text-sm font-medium">Nenhuma demanda cadastrada no filtro selecionado.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {tasks.map((t) => {
                const assignedMember = summary.find((m) => m.id === t.member_id);
                return (
                  <div
                    key={t.id}
                    className="p-5 rounded-2xl bg-white/[0.02] border border-white/[0.08] flex flex-col justify-between"
                  >
                    <div>
                      <div className="flex items-center justify-between gap-2 mb-2">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-white/[0.06] text-slate-300">
                            {t.category}
                          </span>
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-500/15 border border-amber-500/30 text-amber-300">
                            {assignedMember?.full_name || `Liderado #${t.member_id}`}
                          </span>
                          {t.priority && (
                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                              t.priority === 'Alta' || t.priority === 'Crítica'
                                ? 'bg-rose-500/10 border-rose-500/30 text-rose-300'
                                : t.priority === 'Média'
                                ? 'bg-amber-500/10 border-amber-500/30 text-amber-300'
                                : 'bg-slate-500/10 border-slate-500/30 text-slate-400'
                            }`}>
                              {t.priority}
                            </span>
                          )}
                        </div>

                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            type="button"
                            onClick={() => handleOpenEditTask(t)}
                            title="Editar demanda"
                            className="p-1.5 rounded-lg bg-white/[0.04] hover:bg-white/[0.1] text-slate-300 hover:text-amber-300 transition-all cursor-pointer"
                          >
                            <Pencil size={13} />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteTask(t)}
                            title="Excluir demanda permanentemente"
                            className="p-1.5 rounded-lg bg-white/[0.04] hover:bg-rose-500/20 text-slate-400 hover:text-rose-300 transition-all cursor-pointer"
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </div>

                      <h3 className="font-bold text-sm text-slate-100 mb-1">{t.name}</h3>
                      {t.description && <p className="text-xs text-slate-400 mb-3 whitespace-pre-wrap">{t.description}</p>}

                      {t.execution_notes && (
                        <div className="mb-3 p-2.5 rounded-xl bg-blue-500/[0.06] border border-blue-500/20 text-xs">
                          <span className="text-[10px] font-bold text-blue-300 block mb-0.5">Relatório do Liderado:</span>
                          <p className="text-slate-300">{t.execution_notes}</p>
                        </div>
                      )}
                    </div>

                    <div className="pt-3 border-t border-white/[0.06] flex items-center justify-between text-xs text-slate-400">
                      <div className="flex items-center gap-1">
                        <Clock size={13} className="text-amber-400" />
                        <span className="font-mono font-bold text-slate-200">
                          {formatSeconds(t.time_spent_seconds)}
                        </span>
                        {t.estimated_hours ? (
                          <span className="text-[10px] text-slate-500">/ {t.estimated_hours}h</span>
                        ) : null}
                      </div>
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                        t.status === 'completed'
                          ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                          : t.status === 'in_progress'
                          ? 'bg-blue-500/10 border-blue-500/30 text-blue-300'
                          : 'bg-amber-500/10 border-amber-500/30 text-amber-300'
                      }`}>
                        {t.status === 'completed' ? 'Concluída' : t.status === 'in_progress' ? 'Em Andamento' : 'Pendente'}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ===================== TAB: FLUXOS DIÁRIOS (ROUTINES) ===================== */}
      {activeTab === 'routines' && (
        <div className="space-y-4">
          {routinesLoading ? (
            <div className="py-20 text-center text-slate-400">
              <RefreshCw size={24} className="animate-spin mx-auto mb-2 text-amber-400" />
              <p className="text-xs">Carregando fluxos diários...</p>
            </div>
          ) : routines.length === 0 ? (
            <div className="py-20 text-center text-slate-500 bg-white/[0.01] rounded-2xl border border-white/[0.06]">
              <CalendarDays size={36} className="mx-auto mb-2 opacity-40" />
              <p className="text-sm font-medium">Nenhum fluxo diário configurado para este liderado.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {routines.map((r) => {
                const assignedMember = summary.find((m) => m.id === r.member_id);
                const checklist = r.checklist || [];
                return (
                  <div
                    key={r.id}
                    className="p-5 rounded-2xl bg-white/[0.02] border border-white/[0.08] flex flex-col justify-between"
                  >
                    <div>
                      <div className="flex items-center justify-between gap-2 mb-2">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-xs font-bold text-amber-300">
                            {r.start_time_str} - {r.end_time_str}
                          </span>
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-500/15 border border-amber-500/30 text-amber-300">
                            {r.member_id ? (assignedMember?.full_name || `Liderado #${r.member_id}`) : 'Toda a Equipe (Geral)'}
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleDeleteRoutine(r)}
                          title="Excluir fluxo diário"
                          className="p-1.5 rounded-lg bg-white/[0.04] hover:bg-rose-500/20 text-slate-400 hover:text-rose-300 transition-all cursor-pointer"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>

                      <h3 className="font-bold text-sm text-slate-100 mb-2">{r.title}</h3>

                      {checklist.length > 0 && (
                        <div className="space-y-1 mb-3">
                          <span className="text-[10px] font-bold text-slate-500 block">Checklist Obrigatório:</span>
                          {checklist.map((it, idx) => (
                            <div key={idx} className="flex items-center gap-1.5 text-xs text-slate-300">
                              <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                              <span>{it.text}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ===================== TAB: TIMELINE DOS LIDERADOS ===================== */}
      {activeTab === 'timeline' && (
        <div className="space-y-4">
          {/* Controls Bar: Member selector + Date selector + Refresh */}
          <div className="flex flex-wrap items-center justify-between gap-3 bg-white/[0.02] p-4 rounded-2xl border border-white/[0.08]">
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-2">
                <Users size={14} className="text-amber-400" />
                <span className="text-xs font-semibold text-slate-300">Liderado:</span>
                <select
                  value={timelineMemberId}
                  onChange={(e) => {
                    const mId = parseInt(e.target.value);
                    setTimelineMemberId(mId);
                    fetchMemberTimeline(mId, timelineDate);
                  }}
                  className="px-3 py-1.5 rounded-xl bg-slate-900 border border-white/[0.1] text-xs text-white focus:outline-none focus:border-amber-400/50"
                >
                  {summary.map((m) => (
                    <option key={m.id} value={m.id} className="bg-slate-900">
                      {m.full_name} (@{m.username})
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex items-center gap-2">
                <Clock size={14} className="text-amber-400" />
                <span className="text-xs font-semibold text-slate-300">Data:</span>
                <input
                  type="date"
                  value={timelineDate}
                  onChange={(e) => {
                    setTimelineDate(e.target.value);
                    fetchMemberTimeline(timelineMemberId, e.target.value);
                  }}
                  className="px-3 py-1.5 rounded-xl bg-slate-900 border border-white/[0.1] text-xs text-white focus:outline-none focus:border-amber-400/50"
                />
                <button
                  type="button"
                  onClick={() => {
                    const today = new Date().toISOString().slice(0, 10);
                    setTimelineDate(today);
                    fetchMemberTimeline(timelineMemberId, today);
                  }}
                  className="px-2.5 py-1.5 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] text-xs font-semibold text-slate-300 border border-white/[0.08] transition"
                >
                  Hoje
                </button>
              </div>
            </div>

            <button
              type="button"
              onClick={() => fetchMemberTimeline(timelineMemberId, timelineDate)}
              title="Atualizar timeline do operador"
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] text-xs font-semibold text-slate-300 border border-white/[0.08] transition"
            >
              <RefreshCw size={13} className={memberTimelineLoading ? 'animate-spin text-amber-400' : ''} />
              <span>Atualizar</span>
            </button>
          </div>

          {/* Timeline Metrics */}
          {memberTimelineStats && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="p-3.5 rounded-2xl bg-white/[0.02] border border-white/[0.08]">
                <span className="text-[10px] uppercase font-bold text-slate-500 block">Total de Blocos</span>
                <span className="text-lg font-mono font-bold text-white">
                  {memberTimelineBlocks.length}
                </span>
              </div>
              <div className="p-3.5 rounded-2xl bg-white/[0.02] border border-white/[0.08]">
                <span className="text-[10px] uppercase font-bold text-slate-500 block">Horas de Rotina/Fluxos</span>
                <span className="text-lg font-mono font-bold text-indigo-400">
                  {memberTimelineStats.routine_hours || 0}h
                </span>
              </div>
              <div className="p-3.5 rounded-2xl bg-white/[0.02] border border-white/[0.08]">
                <span className="text-[10px] uppercase font-bold text-slate-500 block">Horas de Foco / Tarefas</span>
                <span className="text-lg font-mono font-bold text-amber-400">
                  {memberTimelineStats.focus_hours || 0}h
                </span>
              </div>
              <div className="p-3.5 rounded-2xl bg-white/[0.02] border border-white/[0.08]">
                <span className="text-[10px] uppercase font-bold text-slate-500 block">Conclusão do Dia</span>
                <span className="text-lg font-mono font-bold text-emerald-400">
                  {memberTimelineStats.completion_rate || 0}%
                </span>
              </div>
            </div>
          )}

          {/* Timeline Blocks List */}
          {memberTimelineLoading ? (
            <div className="py-20 text-center text-slate-400">
              <RefreshCw size={24} className="animate-spin mx-auto mb-2 text-amber-400" />
              <p className="text-xs">Carregando timeline do operador...</p>
            </div>
          ) : memberTimelineBlocks.length === 0 ? (
            <div className="py-20 text-center text-slate-500 bg-white/[0.01] rounded-2xl border border-white/[0.06]">
              <CalendarDays size={36} className="mx-auto mb-2 opacity-40" />
              <p className="text-sm font-medium mb-1">Nenhum bloco alocado para esta data.</p>
              <p className="text-xs text-slate-500">
                O operador ainda não montou ou iniciou sua timeline em {timelineDate}.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {memberTimelineBlocks.map((b) => {
                const checklist = b.checklist || [];
                const doneCount = checklist.filter((i: any) => i.done).length;
                const totalCount = checklist.length;
                return (
                  <div
                    key={b.id}
                    className="p-4 rounded-2xl bg-white/[0.02] border border-white/[0.08] flex flex-col md:flex-row md:items-center justify-between gap-3 hover:border-white/[0.12] transition"
                  >
                    <div className="flex items-start md:items-center gap-3.5">
                      <div className="w-24 text-center py-1.5 rounded-xl bg-white/[0.04] border border-white/[0.08] shrink-0">
                        <span className="font-mono text-xs font-bold text-amber-300">
                          {b.start_time_str || formatMinutesToTime(b.start_minute)} - {b.end_time_str || formatMinutesToTime(b.end_minute)}
                        </span>
                      </div>

                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <h4 className="font-bold text-sm text-slate-100">{b.title}</h4>
                          {b.assigned_by_leader ? (
                            <span className="flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-500/15 border border-amber-500/30 text-amber-300">
                              <Lock size={10} />
                              <span>Fluxo do Líder</span>
                            </span>
                          ) : (
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-500/15 border border-blue-500/30 text-blue-300">
                              Bloco Próprio do Operador
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
                            {b.status === 'completed' ? 'Concluído' : b.status === 'in_progress' ? 'Em Execução' : 'Planejado'}
                          </span>
                        </div>

                        {b.notes && <p className="text-xs text-slate-400 mt-1">{b.notes}</p>}

                        {b.actual_seconds_spent > 0 && (
                          <span className="text-[11px] font-mono text-emerald-300 mt-1 inline-block">
                            Tempo real dedicado: {Math.floor(b.actual_seconds_spent / 60)} min
                          </span>
                        )}

                        {totalCount > 0 && (
                          <div className="mt-2.5 p-2.5 rounded-xl bg-slate-950/60 border border-white/[0.06] space-y-1.5">
                            <span className="text-[10px] font-bold text-slate-400 flex items-center justify-between">
                              <span>Checklist do Operador:</span>
                              <span className="text-amber-300 font-mono">{doneCount}/{totalCount}</span>
                            </span>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                              {checklist.map((it: any, idx: number) => (
                                <div key={idx} className="flex items-center gap-2 text-xs">
                                  <input
                                    type="checkbox"
                                    checked={it.done}
                                    readOnly
                                    className="rounded border-white/20 text-emerald-500 focus:ring-0 pointer-events-none"
                                  />
                                  <span className={it.done ? 'line-through text-slate-400' : 'text-slate-200'}>
                                    {it.text}
                                  </span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ===================== TAB: POPS DA EQUIPE ===================== */}
      {activeTab === 'pops' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-xs text-slate-400">
              Procedimentos Operacionais Padrão (POPs) publicados para os liderados seguirem.
            </p>
            <button
              onClick={() => setIsNewPopModalOpen(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-500 text-slate-950 font-bold text-xs"
            >
              <Plus size={14} />
              <span>Novo POP</span>
            </button>
          </div>

          {popsLoading ? (
            <div className="py-20 text-center text-slate-400">
              <RefreshCw size={24} className="animate-spin mx-auto mb-2 text-amber-400" />
              <p className="text-xs">Carregando POPs da equipe...</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {pops.map((p) => (
                <div
                  key={p.id}
                  onClick={() => setSelectedPopForView(p)}
                  className="p-5 rounded-2xl bg-white/[0.02] border border-white/[0.08] hover:border-amber-400/30 transition-all cursor-pointer group flex flex-col justify-between"
                >
                  <div>
                    <div className="flex items-center justify-between gap-2 mb-2">
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-500/15 border border-blue-500/30 text-blue-300">
                        {p.allow_member_edit ? 'Edição Permitida' : 'Somente Leitura'}
                      </span>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeletePop(p);
                        }}
                        title="Excluir POP permanentemente"
                        className="p-1.5 rounded-lg bg-white/[0.04] hover:bg-rose-500/20 text-slate-400 hover:text-rose-300 transition-all cursor-pointer"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                    <h3 className="font-bold text-sm text-slate-100 group-hover:text-amber-300 transition-colors mb-1.5">{p.title}</h3>
                    <p className="text-xs text-slate-400 line-clamp-3 leading-relaxed mb-2">
                      {p.content.replace(/<[^>]*>?/gm, '').replace(/[#*`_~-]/g, '') || 'Sem conteúdo'}
                    </p>
                  </div>
                  <div className="pt-2 border-t border-white/[0.05] flex items-center justify-between text-[11px] text-amber-400 font-semibold">
                    <span className="flex items-center gap-1">
                      <Eye size={12} />
                      <span>Ver POP em Markdown</span>
                    </span>
                    <span className="text-[10px] text-slate-500 font-normal">#{p.id}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ===================== TAB: AUDITORIA DA EQUIPE ===================== */}
      {activeTab === 'audit' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-bold text-sm text-slate-200">Trilha de Auditoria Integral da Equipe</h3>
            <button
              onClick={fetchAuditLogs}
              className="p-1.5 rounded-lg bg-white/[0.04] text-slate-300 hover:bg-white/[0.08]"
            >
              <RefreshCw size={14} className={auditLoading ? 'animate-spin' : ''} />
            </button>
          </div>

          <div className="space-y-2">
            {auditLogs.map((log) => {
              const mem = summary.find((m) => m.id === log.member_id);
              return (
                <div
                  key={log.id}
                  className="p-3.5 rounded-xl bg-white/[0.02] border border-white/[0.06] flex items-center justify-between text-xs gap-4"
                >
                  <div className="flex items-center gap-3">
                    <span className="font-mono text-[10px] text-slate-500">{log.created_at.slice(11, 19)}</span>
                    <span className="font-bold text-amber-300">{mem ? mem.full_name : 'Líder / Sistema'}</span>
                    <span className="text-slate-300">{log.description}</span>
                  </div>
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-white/[0.04] text-slate-400">
                    {log.event_type}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ===================== MODAL DE DISPOSITIVOS DO MEMBRO ===================== */}
      {selectedMemberForDevices && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-lg bg-[#0d1428] border border-white/[0.1] rounded-2xl p-6 shadow-2xl">
            <div className="flex items-center justify-between pb-4 border-b border-white/[0.06] mb-4">
              <div>
                <h3 className="font-bold text-base text-slate-100 flex items-center gap-2">
                  <Laptop size={18} className="text-blue-400" />
                  <span>Dispositivos de {selectedMemberForDevices.full_name}</span>
                </h3>
                <p className="text-xs text-slate-400">Aprovação Zero-Trust e Kill Switch instantâneo</p>
              </div>
              <button
                onClick={() => setSelectedMemberForDevices(null)}
                className="p-1.5 rounded-lg bg-white/[0.04] text-slate-400 hover:text-slate-200"
              >
                <X size={16} />
              </button>
            </div>

            <div className="space-y-3 max-h-[60vh] overflow-y-auto">
              {devicesLoading ? (
                <div className="py-10 text-center text-slate-400">
                  <RefreshCw size={20} className="animate-spin mx-auto mb-2 text-amber-400" />
                  <p className="text-xs">Carregando dispositivos...</p>
                </div>
              ) : memberDevices.length === 0 ? (
                <div className="py-10 text-center text-slate-500 text-xs">
                  Nenhum dispositivo registrado por este liderado.
                </div>
              ) : (
                memberDevices.map((d) => (
                  <div
                    key={d.id}
                    className="p-3.5 rounded-xl bg-white/[0.02] border border-white/[0.06] flex items-center justify-between gap-3"
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-xs text-slate-200">{d.device_name}</span>
                        {d.revoked_at ? (
                          <span className="text-[10px] font-bold px-1.5 py-0.2 rounded-full bg-rose-500/15 text-rose-300 border border-rose-500/30">
                            Revogado
                          </span>
                        ) : d.is_approved ? (
                          <span className="text-[10px] font-bold px-1.5 py-0.2 rounded-full bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
                            Aprovado
                          </span>
                        ) : (
                          <span className="text-[10px] font-bold px-1.5 py-0.2 rounded-full bg-amber-500/15 text-amber-300 border border-amber-500/30">
                            Pendente
                          </span>
                        )}
                      </div>
                      <span className="text-[10px] font-mono text-slate-500 block mt-0.5">ID: {d.id}</span>
                    </div>

                    <div className="flex items-center gap-2">
                      {!d.is_approved && !d.revoked_at && (
                        <button
                          onClick={() => handleApproveDevice(d.id)}
                          className="px-2.5 py-1 rounded-lg bg-emerald-500 text-slate-950 font-bold text-xs"
                        >
                          Aprovar
                        </button>
                      )}
                      {!d.revoked_at && (
                        <button
                          onClick={() => handleRevokeDevice(d.id)}
                          className="px-2.5 py-1 rounded-lg bg-rose-500/15 text-rose-300 border border-rose-500/30 text-xs font-bold hover:bg-rose-500/25"
                        >
                          Revogar
                        </button>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* ===================== MODAL DE NOVO LIDERADO ===================== */}
      {isNewMemberModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-md bg-[#0d1428] border border-white/[0.1] rounded-2xl p-6 shadow-2xl">
            <div className="flex items-center justify-between pb-4 border-b border-white/[0.06] mb-4">
              <h3 className="font-bold text-base text-slate-100 flex items-center gap-2">
                <Users size={18} className="text-amber-400" />
                <span>Cadastrar Novo Liderado</span>
              </h3>
              <button
                onClick={() => setIsNewMemberModalOpen(false)}
                className="p-1.5 rounded-lg bg-white/[0.04] text-slate-400 hover:text-slate-200"
              >
                <X size={16} />
              </button>
            </div>

            <form onSubmit={handleCreateMember} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Nome Completo</label>
                <input
                  type="text"
                  required
                  placeholder="ex: Ana Silva"
                  value={newFullName}
                  onChange={(e) => setNewFullName(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-white/[0.04] border border-white/[0.1] text-xs text-slate-200 focus:outline-none focus:border-amber-400/50"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Nome de Usuário (login)</label>
                <input
                  type="text"
                  required
                  placeholder="ex: ana.silva"
                  value={newUsername}
                  onChange={(e) => setNewUsername(e.target.value.toLowerCase())}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-white/[0.04] border border-white/[0.1] text-xs text-slate-200 focus:outline-none focus:border-amber-400/50"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">Cargo / Função</label>
                  <input
                    type="text"
                    required
                    value={newRole}
                    onChange={(e) => setNewRole(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-white/[0.04] border border-white/[0.1] text-xs text-slate-200 focus:outline-none focus:border-amber-400/50"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">Senha Inicial</label>
                  <input
                    type="password"
                    required
                    placeholder="Mínimo 8 caracteres"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-white/[0.04] border border-white/[0.1] text-xs text-slate-200 focus:outline-none focus:border-amber-400/50"
                  />
                </div>
              </div>

              <div className="space-y-2 pt-2">
                <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={newRequireDeviceApproval}
                    onChange={(e) => setNewRequireDeviceApproval(e.target.checked)}
                    className="rounded border-white/[0.2] bg-white/[0.05]"
                  />
                  <span>Exigir aprovação do Líder para novos dispositivos</span>
                </label>

                <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={newMustChangePassword}
                    onChange={(e) => setNewMustChangePassword(e.target.checked)}
                    className="rounded border-white/[0.2] bg-white/[0.05]"
                  />
                  <span>Forçar troca de senha no primeiro login</span>
                </label>
              </div>

              <div className="pt-4 border-t border-white/[0.06] flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsNewMemberModalOpen(false)}
                  className="px-4 py-2 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] text-xs font-semibold text-slate-300"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl bg-amber-500 text-slate-950 font-bold text-xs shadow-md shadow-amber-500/20"
                >
                  Cadastrar Liderado
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ===================== MODAL DE EDITAR LIDERADO ===================== */}
      {editingMember && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
          <div className="w-full max-w-md bg-[#0d1428] border border-white/[0.1] rounded-2xl p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-4 border-b border-white/[0.06]">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-amber-500/20 text-amber-300 flex items-center justify-center">
                  <Pencil size={16} />
                </div>
                <div>
                  <h3 className="font-bold text-sm text-slate-100">Editar Liderado</h3>
                  <p className="text-[11px] text-slate-400">Atualize nome, usuário, cargo ou defina uma nova senha.</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setEditingMember(null)}
                className="p-1.5 rounded-lg bg-white/[0.04] text-slate-400 hover:text-slate-200"
              >
                <X size={16} />
              </button>
            </div>

            <form onSubmit={handleSaveEditMember} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Nome Completo</label>
                <input
                  type="text"
                  required
                  placeholder="ex: Ana Silva"
                  value={editFullName}
                  onChange={(e) => setEditFullName(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-white/[0.04] border border-white/[0.1] text-xs text-slate-200 focus:outline-none focus:border-amber-400/50"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Nome de Usuário (login)</label>
                <input
                  type="text"
                  required
                  placeholder="ex: ana.silva"
                  value={editUsername}
                  onChange={(e) => setEditUsername(e.target.value.toLowerCase())}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-white/[0.04] border border-white/[0.1] text-xs text-slate-200 focus:outline-none focus:border-amber-400/50"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">Cargo / Função</label>
                  <input
                    type="text"
                    required
                    value={editRole}
                    onChange={(e) => setEditRole(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-white/[0.04] border border-white/[0.1] text-xs text-slate-200 focus:outline-none focus:border-amber-400/50"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">
                    Nova Senha <span className="text-[10px] text-slate-400 font-normal">(opcional)</span>
                  </label>
                  <input
                    type="password"
                    placeholder="Mín. 8 caracteres"
                    value={editPassword}
                    onChange={(e) => setEditPassword(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-white/[0.04] border border-white/[0.1] text-xs text-slate-200 focus:outline-none focus:border-amber-400/50"
                  />
                </div>
              </div>

              <div className="space-y-2 pt-1">
                <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={editRequireDeviceApproval}
                    onChange={(e) => setEditRequireDeviceApproval(e.target.checked)}
                    className="rounded border-white/[0.2] bg-white/[0.05]"
                  />
                  <span>Exigir aprovação do Líder para novos dispositivos</span>
                </label>

                <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={editIsActive}
                    onChange={(e) => setEditIsActive(e.target.checked)}
                    className="rounded border-white/[0.2] bg-white/[0.05]"
                  />
                  <span>Liderado Ativo (permite login no portal da equipe)</span>
                </label>
              </div>

              <div className="pt-4 border-t border-white/[0.06] flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => handleDeleteMember(editingMember)}
                  className="px-3.5 py-2 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 border border-rose-500/30 text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer"
                >
                  <Trash2 size={13} />
                  <span>Excluir Liderado</span>
                </button>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setEditingMember(null)}
                    className="px-4 py-2 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] text-xs font-semibold text-slate-300 cursor-pointer"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={isSavingMember}
                    className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs shadow-md shadow-amber-500/20 cursor-pointer disabled:opacity-50"
                  >
                    {isSavingMember ? 'Salvando...' : 'Salvar Alterações'}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ===================== MODAL DE REDEFINIR SENHA ===================== */}
      {passwordModalMember && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
          <div className="w-full max-w-md bg-[#0d1428] border border-white/[0.1] rounded-2xl p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-4 border-b border-white/[0.06]">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-blue-500/20 text-blue-300 flex items-center justify-center">
                  <KeyRound size={16} />
                </div>
                <div>
                  <h3 className="font-bold text-sm text-slate-100">Redefinir Senha</h3>
                  <p className="text-[11px] text-slate-400">
                    Definir nova senha para {passwordModalMember.full_name} (@{passwordModalMember.username})
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setPasswordModalMember(null)}
                className="p-1.5 rounded-lg bg-white/[0.04] text-slate-400 hover:text-slate-200"
              >
                <X size={16} />
              </button>
            </div>

            <form onSubmit={handleSaveResetPassword} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Nova Senha</label>
                <input
                  type="password"
                  required
                  placeholder="Mínimo 8 caracteres"
                  value={resetPasswordInput}
                  onChange={(e) => setResetPasswordInput(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-white/[0.04] border border-white/[0.1] text-xs text-slate-200 focus:outline-none focus:border-amber-400/50"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Confirmar Nova Senha</label>
                <input
                  type="password"
                  required
                  placeholder="Repita a nova senha"
                  value={resetPasswordConfirm}
                  onChange={(e) => setResetPasswordConfirm(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-white/[0.04] border border-white/[0.1] text-xs text-slate-200 focus:outline-none focus:border-amber-400/50"
                />
              </div>

              <div className="p-3 rounded-xl bg-blue-500/10 border border-blue-500/20 text-[11px] text-blue-300">
                Ao redefinir a senha, eventuais sessões ativas deste liderado serão invalidadas imediatamente para sua proteção.
              </div>

              <div className="pt-4 border-t border-white/[0.06] flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setPasswordModalMember(null)}
                  className="px-4 py-2 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] text-xs font-semibold text-slate-300 cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isResettingPassword}
                  className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs shadow-md shadow-amber-500/20 cursor-pointer disabled:opacity-50"
                >
                  {isResettingPassword ? 'Atualizando...' : 'Salvar Nova Senha'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ===================== MODAL DE ATRIBUIR DEMANDA ===================== */}
      {isNewTaskModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-md bg-[#0d1428] border border-white/[0.1] rounded-2xl p-6 shadow-2xl">
            <div className="flex items-center justify-between pb-4 border-b border-white/[0.06] mb-4">
              <h3 className="font-bold text-base text-slate-100 flex items-center gap-2">
                <CheckSquare size={18} className="text-amber-400" />
                <span>Atribuir Demanda a um Liderado</span>
              </h3>
              <button
                onClick={() => setIsNewTaskModalOpen(false)}
                className="p-1.5 rounded-lg bg-white/[0.04] text-slate-400 hover:text-slate-200"
              >
                <X size={16} />
              </button>
            </div>

            <form onSubmit={handleAssignTask} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Liderado Responsável</label>
                <select
                  value={assignMemberId}
                  onChange={(e) => setAssignMemberId(parseInt(e.target.value))}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-white/[0.04] border border-white/[0.1] text-xs text-slate-200 focus:outline-none focus:border-amber-400/50"
                >
                  {summary.map((m) => (
                    <option key={m.id} value={m.id} className="bg-[#0d1428]">
                      {m.full_name} ({m.username})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Título da Demanda</label>
                <input
                  type="text"
                  required
                  placeholder="ex: Revisar chamados prioritários"
                  value={taskTitle}
                  onChange={(e) => setTaskTitle(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-white/[0.04] border border-white/[0.1] text-xs text-slate-200 focus:outline-none focus:border-amber-400/50"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Descrição / Instruções</label>
                <textarea
                  rows={3}
                  placeholder="Orientações específicas do Líder..."
                  value={taskDesc}
                  onChange={(e) => setTaskDesc(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-white/[0.04] border border-white/[0.1] text-xs text-slate-200 focus:outline-none focus:border-amber-400/50"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">Categoria</label>
                  <input
                    type="text"
                    value={taskCategory}
                    onChange={(e) => setTaskCategory(e.target.value)}
                    placeholder="ex: Operacional"
                    className="w-full px-3.5 py-2.5 rounded-xl bg-white/[0.04] border border-white/[0.1] text-xs text-slate-200 focus:outline-none focus:border-amber-400/50"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">Data Agendada (Opcional)</label>
                  <input
                    type="date"
                    value={taskScheduledDate}
                    onChange={(e) => setTaskScheduledDate(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-white/[0.04] border border-white/[0.1] text-xs text-slate-200 focus:outline-none focus:border-amber-400/50"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">Horas Estimadas</label>
                  <input
                    type="number"
                    step="0.5"
                    min="0.5"
                    value={taskEstimatedHours}
                    onChange={(e) => setTaskEstimatedHours(parseFloat(e.target.value) || 1)}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-white/[0.04] border border-white/[0.1] text-xs text-slate-200 focus:outline-none focus:border-amber-400/50"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">Prioridade</label>
                  <select
                    value={taskPriority}
                    onChange={(e) => setTaskPriority(e.target.value)}
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
                  Atribuir Demanda
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ===================== MODAL DE NOVO FLUXO DIÁRIO ===================== */}
      {isNewRoutineModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-md bg-[#0d1428] border border-white/[0.1] rounded-2xl p-6 shadow-2xl">
            <div className="flex items-center justify-between pb-4 border-b border-white/[0.06] mb-4">
              <h3 className="font-bold text-base text-slate-100 flex items-center gap-2">
                <CalendarDays size={18} className="text-amber-400" />
                <span>Definir Fluxo Diário & Checklist</span>
              </h3>
              <button
                onClick={() => setIsNewRoutineModalOpen(false)}
                className="p-1.5 rounded-lg bg-white/[0.04] text-slate-400 hover:text-slate-200"
              >
                <X size={16} />
              </button>
            </div>

            <form onSubmit={handleCreateRoutine} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Liderado</label>
                <select
                  value={routineMemberId}
                  onChange={(e) => setRoutineMemberId(parseInt(e.target.value))}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-white/[0.04] border border-white/[0.1] text-xs text-slate-200 focus:outline-none focus:border-amber-400/50"
                >
                  <option value={0} className="bg-[#0d1428]">
                    Toda a Equipe (Geral)
                  </option>
                  {summary.map((m) => (
                    <option key={m.id} value={m.id} className="bg-[#0d1428]">
                      {m.full_name} ({m.username})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Título do Fluxo Diário</label>
                <input
                  type="text"
                  required
                  placeholder="ex: Abertura do Dia & Triagem"
                  value={routineTitle}
                  onChange={(e) => setRoutineTitle(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-white/[0.04] border border-white/[0.1] text-xs text-slate-200 focus:outline-none focus:border-amber-400/50"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">Horário Início</label>
                  <input
                    type="time"
                    required
                    value={routineStartTime}
                    onChange={(e) => setRoutineStartTime(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-white/[0.04] border border-white/[0.1] text-xs text-slate-200 focus:outline-none focus:border-amber-400/50"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">Horário Fim</label>
                  <input
                    type="time"
                    required
                    value={routineEndTime}
                    onChange={(e) => setRoutineEndTime(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-white/[0.04] border border-white/[0.1] text-xs text-slate-200 focus:outline-none focus:border-amber-400/50"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  Checklist de Etapas Obrigatórias
                </label>
                <div className="space-y-2">
                  {checklistInputs.map((val, idx) => (
                    <div key={idx} className="flex items-center gap-2">
                      <input
                        type="text"
                        placeholder={`Etapa ${idx + 1}...`}
                        value={val}
                        onChange={(e) => {
                          const next = [...checklistInputs];
                          next[idx] = e.target.value;
                          setChecklistInputs(next);
                        }}
                        className="flex-1 px-3 py-1.5 rounded-xl bg-white/[0.04] border border-white/[0.1] text-xs text-slate-200"
                      />
                      {checklistInputs.length > 1 && (
                        <button
                          type="button"
                          onClick={() => setChecklistInputs(checklistInputs.filter((_, i) => i !== idx))}
                          className="p-1.5 text-slate-500 hover:text-rose-400"
                        >
                          <X size={14} />
                        </button>
                      )}
                    </div>
                  ))}
                  <button
                    type="button"
                    onClick={() => setChecklistInputs([...checklistInputs, ''])}
                    className="text-xs text-amber-400 font-semibold hover:underline mt-1"
                  >
                    + Adicionar Etapa
                  </button>
                </div>
              </div>

              <div className="pt-4 border-t border-white/[0.06] flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsNewRoutineModalOpen(false)}
                  className="px-4 py-2 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] text-xs font-semibold text-slate-300"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl bg-amber-500 text-slate-950 font-bold text-xs shadow-md shadow-amber-500/20"
                >
                  Criar Fluxo Diário
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ===================== MODAL DE NOVO POP ===================== */}
      {isNewPopModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="w-full max-w-2xl bg-[#0d1428] border border-white/[0.12] rounded-3xl p-6 shadow-2xl flex flex-col max-h-[90vh]">
            <div className="flex items-center justify-between pb-4 border-b border-white/[0.08] mb-4">
              <h3 className="font-bold text-base text-slate-100 flex items-center gap-2">
                <BookOpen size={18} className="text-amber-400" />
                <span>Publicar Novo POP da Equipe</span>
              </h3>
              <button
                onClick={() => setIsNewPopModalOpen(false)}
                className="p-1.5 rounded-lg bg-white/[0.04] text-slate-400 hover:text-slate-200"
              >
                <X size={16} />
              </button>
            </div>

            <form onSubmit={handleCreatePop} className="space-y-4 flex-1 flex flex-col overflow-hidden">
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Título do POP</label>
                <input
                  type="text"
                  required
                  placeholder="ex: POP-001: Atendimento Inicial"
                  value={popTitle}
                  onChange={(e) => setPopTitle(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-white/[0.04] border border-white/[0.1] text-xs text-slate-200 focus:outline-none focus:border-amber-400/50"
                />
              </div>

              <div className="flex-1 flex flex-col overflow-hidden">
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-medium text-slate-300">Conteúdo do Procedimento (Markdown)</label>
                  <div className="flex items-center gap-1 p-0.5 bg-white/[0.03] rounded-lg border border-white/[0.08]">
                    <button
                      type="button"
                      onClick={() => setNewPopTab('edit')}
                      className={`px-2.5 py-1 rounded text-[11px] font-semibold flex items-center gap-1 ${
                        newPopTab === 'edit' ? 'bg-amber-500/20 text-amber-200' : 'text-slate-400'
                      }`}
                    >
                      <Code size={11} />
                      <span>Editor</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setNewPopTab('preview')}
                      className={`px-2.5 py-1 rounded text-[11px] font-semibold flex items-center gap-1 ${
                        newPopTab === 'preview' ? 'bg-amber-500/20 text-amber-200' : 'text-slate-400'
                      }`}
                    >
                      <Eye size={11} />
                      <span>Prévia</span>
                    </button>
                  </div>
                </div>

                <div className="flex-1 flex flex-col rounded-2xl border border-white/[0.08] bg-[#070c1b] overflow-hidden min-h-[220px]">
                  <div className="flex flex-wrap items-center gap-1 p-2 bg-white/[0.03] border-b border-white/[0.08] text-slate-300">
                    <button
                      type="button"
                      onClick={() => {
                        const el = popTextareaRef.current;
                        if (!el) { setPopContent(popContent + '# '); return; }
                        const s = el.selectionStart;
                        setPopContent(popContent.substring(0, s) + '# ' + popContent.substring(el.selectionEnd));
                      }}
                      className="px-2 py-1 rounded hover:bg-white/[0.08] text-xs font-bold text-amber-300"
                    >
                      H1
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        const el = popTextareaRef.current;
                        if (!el) { setPopContent(popContent + '## '); return; }
                        const s = el.selectionStart;
                        setPopContent(popContent.substring(0, s) + '## ' + popContent.substring(el.selectionEnd));
                      }}
                      className="px-2 py-1 rounded hover:bg-white/[0.08] text-xs font-bold text-amber-300"
                    >
                      H2
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        const el = popTextareaRef.current;
                        if (!el) { setPopContent(popContent + '**texto**'); return; }
                        const s = el.selectionStart;
                        const sel = popContent.substring(s, el.selectionEnd) || 'texto';
                        setPopContent(popContent.substring(0, s) + `**${sel}**` + popContent.substring(el.selectionEnd));
                      }}
                      className="p-1.5 rounded hover:bg-white/[0.08]"
                    >
                      <Bold size={13} />
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        const el = popTextareaRef.current;
                        if (!el) { setPopContent(popContent + '*texto*'); return; }
                        const s = el.selectionStart;
                        const sel = popContent.substring(s, el.selectionEnd) || 'texto';
                        setPopContent(popContent.substring(0, s) + `*${sel}*` + popContent.substring(el.selectionEnd));
                      }}
                      className="p-1.5 rounded hover:bg-white/[0.08]"
                    >
                      <Italic size={13} />
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        const el = popTextareaRef.current;
                        if (!el) { setPopContent(popContent + '- '); return; }
                        const s = el.selectionStart;
                        setPopContent(popContent.substring(0, s) + '- ' + popContent.substring(el.selectionEnd));
                      }}
                      className="p-1.5 rounded hover:bg-white/[0.08]"
                      title="Lista de Itens (-)"
                    >
                      <List size={13} />
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        const el = popTextareaRef.current;
                        if (!el) { setPopContent(popContent + '1. '); return; }
                        const s = el.selectionStart;
                        setPopContent(popContent.substring(0, s) + '1. ' + popContent.substring(el.selectionEnd));
                      }}
                      className="p-1.5 rounded hover:bg-white/[0.08]"
                      title="Lista Numerada (1.)"
                    >
                      <ListOrdered size={13} />
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        const el = popTextareaRef.current;
                        if (!el) { setPopContent(popContent + '- [ ] '); return; }
                        const s = el.selectionStart;
                        setPopContent(popContent.substring(0, s) + '- [ ] ' + popContent.substring(el.selectionEnd));
                      }}
                      className="p-1.5 rounded hover:bg-white/[0.08]"
                    >
                      <CheckSquare size={13} />
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        const el = popTextareaRef.current;
                        if (!el) { setPopContent(popContent + '> '); return; }
                        const s = el.selectionStart;
                        setPopContent(popContent.substring(0, s) + '> ' + popContent.substring(el.selectionEnd));
                      }}
                      className="p-1.5 rounded hover:bg-white/[0.08]"
                    >
                      <Quote size={13} />
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        const el = popTextareaRef.current;
                        if (!el) { setPopContent(popContent + '\n| Coluna 1 | Coluna 2 |\n| :--- | :--- |\n| Item 1 | Item 2 |\n'); return; }
                        const s = el.selectionStart;
                        setPopContent(popContent.substring(0, s) + '\n| Coluna 1 | Coluna 2 |\n| :--- | :--- |\n| Item 1 | Item 2 |\n' + popContent.substring(el.selectionEnd));
                      }}
                      className="p-1.5 rounded hover:bg-white/[0.08]"
                    >
                      <TableIcon size={13} />
                    </button>
                  </div>

                  {newPopTab === 'edit' ? (
                    <textarea
                      ref={popTextareaRef}
                      rows={8}
                      required
                      placeholder="Instruções em Markdown... (use # para títulos, - para listas, etc.)"
                      value={popContent}
                      onChange={(e) => setPopContent(e.target.value)}
                      className="w-full flex-1 p-4 bg-transparent text-slate-100 font-mono text-xs focus:outline-none resize-none leading-relaxed"
                    />
                  ) : (
                    <div className="flex-1 p-4 overflow-y-auto bg-white/[0.01]">
                      <MarkdownRenderer content={popContent || '*Nenhum conteúdo para pré-visualizar.*'} />
                    </div>
                  )}
                </div>
              </div>

              <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer pt-1">
                <input
                  type="checkbox"
                  checked={popAllowEdit}
                  onChange={(e) => setPopAllowEdit(e.target.checked)}
                  className="rounded border-white/[0.2] bg-white/[0.05]"
                />
                <span>Permitir que liderados editem este POP (deixe desmarcado para Somente Leitura)</span>
              </label>

              <div className="pt-4 border-t border-white/[0.06] flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsNewPopModalOpen(false)}
                  className="px-4 py-2 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] text-xs font-semibold text-slate-300"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs shadow-md shadow-amber-500/20"
                >
                  Publicar POP
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ===================== MODAL DE VISUALIZAÇÃO DE POP (LÍDER) ===================== */}
      {selectedPopForView && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="w-full max-w-3xl max-h-[90vh] bg-[#0d1428] border border-white/[0.12] rounded-3xl p-6 shadow-2xl flex flex-col overflow-hidden">
            <div className="flex items-center justify-between pb-4 border-b border-white/[0.08] mb-4">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-500/15 border border-blue-500/30 text-blue-300">
                    {selectedPopForView.allow_member_edit ? 'Edição Permitida para Liderados' : 'Somente Leitura do Líder'}
                  </span>
                  <span className="text-[10px] text-slate-500 font-mono">POP Oficial da Equipe</span>
                </div>
                <h3 className="font-bold text-xl text-slate-100">{selectedPopForView.title}</h3>
              </div>
              <button
                onClick={() => setSelectedPopForView(null)}
                className="p-1.5 rounded-lg bg-white/[0.04] text-slate-400 hover:text-slate-200"
              >
                <X size={18} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto bg-[#070c1b] p-6 rounded-2xl border border-white/[0.08] min-h-[250px]">
              <MarkdownRenderer content={selectedPopForView.content} />
            </div>

            <div className="pt-4 border-t border-white/[0.08] flex justify-between items-center mt-4">
              <button
                type="button"
                onClick={() => {
                  const p = selectedPopForView;
                  setSelectedPopForView(null);
                  handleDeletePop(p);
                }}
                className="px-3.5 py-1.5 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 border border-rose-500/30 text-xs font-semibold flex items-center gap-1.5 transition-all"
              >
                <Trash2 size={13} />
                <span>Excluir POP</span>
              </button>

              <button
                type="button"
                onClick={() => setSelectedPopForView(null)}
                className="px-5 py-2 rounded-xl bg-white/[0.06] hover:bg-white/[0.1] text-xs font-semibold text-slate-200"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ===================== MODAL DE EDITAR DEMANDA ===================== */}
      {editingTask && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
          <div className="w-full max-w-lg bg-[#0d1428] border border-white/[0.1] rounded-2xl p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-white/[0.06]">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-amber-500/20 text-amber-300 flex items-center justify-center">
                  <Pencil size={15} />
                </div>
                <div>
                  <h3 className="font-bold text-sm text-slate-100">Editar Demanda</h3>
                  <p className="text-[11px] text-slate-400">Atualize os dados ou reatribua esta demanda para outro liderado.</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setEditingTask(null)}
                className="p-1.5 rounded-lg bg-white/[0.04] text-slate-400 hover:text-slate-200"
              >
                <X size={16} />
              </button>
            </div>

            <form onSubmit={handleSaveEditTask} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Liderado Responsável</label>
                <select
                  value={editTaskMemberId}
                  onChange={(e) => setEditTaskMemberId(parseInt(e.target.value))}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-white/[0.04] border border-white/[0.1] text-xs text-slate-200 focus:outline-none focus:border-amber-400/50"
                >
                  {summary.map((m) => (
                    <option key={m.id} value={m.id} className="bg-[#0d1428]">
                      {m.full_name} ({m.username})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Título da Demanda</label>
                <input
                  type="text"
                  required
                  value={editTaskTitle}
                  onChange={(e) => setEditTaskTitle(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-white/[0.04] border border-white/[0.1] text-xs text-slate-200 focus:outline-none focus:border-amber-400/50"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Descrição / Instruções</label>
                <textarea
                  rows={3}
                  value={editTaskDesc}
                  onChange={(e) => setEditTaskDesc(e.target.value)}
                  placeholder="Orientações específicas do Líder..."
                  className="w-full px-3.5 py-2.5 rounded-xl bg-white/[0.04] border border-white/[0.1] text-xs text-slate-200 focus:outline-none focus:border-amber-400/50"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">Categoria</label>
                  <input
                    type="text"
                    value={editTaskCategory}
                    onChange={(e) => setEditTaskCategory(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-white/[0.04] border border-white/[0.1] text-xs text-slate-200 focus:outline-none focus:border-amber-400/50"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">Status</label>
                  <select
                    value={editTaskStatus}
                    onChange={(e) => setEditTaskStatus(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-white/[0.04] border border-white/[0.1] text-xs text-slate-200 focus:outline-none focus:border-amber-400/50"
                  >
                    <option value="pending" className="bg-[#0d1428]">Pendente</option>
                    <option value="in_progress" className="bg-[#0d1428]">Em Andamento</option>
                    <option value="completed" className="bg-[#0d1428]">Concluída</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">Horas Estimadas</label>
                  <input
                    type="number"
                    step="0.5"
                    min="0.5"
                    value={editTaskEstimatedHours}
                    onChange={(e) => setEditTaskEstimatedHours(parseFloat(e.target.value) || 1)}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-white/[0.04] border border-white/[0.1] text-xs text-slate-200 focus:outline-none focus:border-amber-400/50"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">Prioridade</label>
                  <select
                    value={editTaskPriority}
                    onChange={(e) => setEditTaskPriority(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-white/[0.04] border border-white/[0.1] text-xs text-slate-200 focus:outline-none focus:border-amber-400/50"
                  >
                    <option value="Baixa" className="bg-[#0d1428]">Baixa</option>
                    <option value="Média" className="bg-[#0d1428]">Média</option>
                    <option value="Alta" className="bg-[#0d1428]">Alta</option>
                    <option value="Crítica" className="bg-[#0d1428]">Crítica</option>
                  </select>
                </div>
              </div>

              <div className="pt-4 border-t border-white/[0.06] flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => handleDeleteTask(editingTask)}
                  className="px-3.5 py-2 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 border border-rose-500/30 text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer"
                >
                  <Trash2 size={13} />
                  <span>Excluir Demanda</span>
                </button>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setEditingTask(null)}
                    className="px-4 py-2 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] text-xs font-semibold text-slate-300 cursor-pointer"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={isUpdatingTask}
                    className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs shadow-md shadow-amber-500/20 cursor-pointer disabled:opacity-50"
                  >
                    {isUpdatingTask ? 'Salvando...' : 'Salvar Alterações'}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
