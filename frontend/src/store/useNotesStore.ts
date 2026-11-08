import { create } from 'zustand';
import type { Notebook, Note, Workspace } from '../types';
import { trackSiteEvent } from '../security/eventTracker';

const API_URL = '';

interface NotesState {
  workspaces: Workspace[];
  notebooks: Notebook[];
  notes: Note[];
  activeWorkspaceId: number | null;
  activeNotebookId: number | null;
  activeNoteId: number | null;

  // Actions
  setActiveWorkspace: (id: number | null) => void;
  setActiveNotebook: (id: number | null) => void;
  setActiveNote: (id: number | null) => void;
  
  fetchWorkspaces: () => Promise<void>;
  createWorkspace: (title: string) => Promise<void>;
  inactivateWorkspace: (id: number) => Promise<void>;

  fetchNotebooks: () => Promise<void>;
  createNotebook: (title: string, parentId?: number | null) => Promise<void>;
  updateNotebook: (id: number, updates: Partial<Notebook>) => Promise<void>;
  inactivateNotebook: (id: number) => Promise<void>;

  fetchNotes: (notebookId?: number) => Promise<void>;
  createNote: (title: string, content: string, notebookId?: number | null, type?: string, file_url?: string | null) => Promise<Note | null>;
  updateNote: (id: number, updates: Partial<Note>) => Promise<void>;
  deleteNote: (id: number) => Promise<void>;
  uploadFile: (file: File) => Promise<string | null>;

  // Password Protection State & Actions
  unlockedNotebookIds: Record<number, string>;
  unlockedNoteIds: Record<number, string>;
  isNotebookUnlocked: (id: number) => boolean;
  isNoteUnlocked: (id: number) => boolean;
  unlockNotebook: (id: number, password: string) => Promise<boolean>;
  lockNotebook: (id: number) => void;
  setNotebookPassword: (id: number, password: string, currentPassword?: string) => Promise<void>;
  removeNotebookPassword: (id: number, password: string) => Promise<void>;
  unlockNote: (id: number, password: string) => Promise<boolean>;
  lockNote: (id: number) => void;
  setNotePassword: (id: number, password: string, currentPassword?: string) => Promise<void>;
  removeNotePassword: (id: number, password: string) => Promise<void>;

  // Transfer Note Actions
  transferModalNote: Note | null;
  openTransferModal: (note: Note) => void;
  closeTransferModal: () => void;
  transferNote: (noteId: number, targetWorkspaceId: number, targetNotebookId?: number | null) => Promise<void>;
  fetchAllNotebooks: () => Promise<Notebook[]>;
}

export const useNotesStore = create<NotesState>((set, get) => ({
  workspaces: [],
  notebooks: [],
  notes: [],
  activeWorkspaceId: null,
  activeNotebookId: null,
  activeNoteId: null,
  transferModalNote: null,
  unlockedNotebookIds: {},
  unlockedNoteIds: {},


  setActiveWorkspace: (id) => {
    const prevId = get().activeWorkspaceId;
    set({ activeWorkspaceId: id, activeNotebookId: null, activeNoteId: null });
    get().fetchNotebooks();
    get().fetchNotes();
    if (id !== null && id !== prevId) {
      const ws = get().workspaces.find((w) => w.id === id);
      trackSiteEvent({
        event_type: 'WORKSPACE_OPENED',
        category: 'WORKSPACES',
        severity: 'INFO',
        endpoint: `/workspaces/${id}`,
        details: `Espaço de trabalho selecionado: '${ws ? ws.title : `#${id}`}'.`,
      });
    }
  },
  setActiveNotebook: (id) => {
    const prevId = get().activeNotebookId;
    set({ activeNotebookId: id });
    if (id !== null && id !== prevId) {
      const nb = get().notebooks.find((n) => n.id === id);
      trackSiteEvent({
        event_type: 'NOTEBOOK_OPENED',
        category: 'WORKSPACES',
        severity: 'INFO',
        endpoint: `/notebooks/${id}`,
        details: `Caderno aberto: '${nb ? nb.title : `#${id}`}'.`,
      });
    }
  },
  setActiveNote: (id) => {
    const prevId = get().activeNoteId;
    const note = get().notes.find((n) => n.id === id);
    set({
      activeNoteId: id,
      ...(note?.notebook_id ? { activeNotebookId: note.notebook_id } : {})
    });
    if (id !== null && id !== prevId) {
      trackSiteEvent({
        event_type: 'NOTE_OPENED',
        category: 'NOTES',
        severity: 'INFO',
        endpoint: `/notes/${id}`,
        details: `Nota/Documento aberto para leitura: '${note ? note.title : `#${id}`}' (${note?.type || 'markdown'}).`,
      });
    }
  },

  uploadFile: async (file: File) => {
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await fetch(`${API_URL}/upload`, {
        method: 'POST',
        body: formData,
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || `Falha no upload (Status ${res.status})`);
      }
      const data = await res.json();
      return data.file_url;
    } catch (error: any) {
      console.error('Error uploading file', error);
      alert(error?.message || 'Erro ao realizar upload do arquivo.');
      return null;
    }
  },

  fetchWorkspaces: async () => {
    try {
      const res = await fetch(`${API_URL}/workspaces`);
      if (!res.ok) {
        console.warn('Falha ao carregar workspaces:', res.status);
        return;
      }
      const data = await res.json();
      if (Array.isArray(data)) {
        set({ workspaces: data });
        if (data.length > 0 && get().activeWorkspaceId === null) {
          get().setActiveWorkspace(data[0].id);
        }
      }
    } catch (error) {
      console.error('Error fetching workspaces', error);
    }
  },

  createWorkspace: async (title: string) => {
    try {
      const res = await fetch(`${API_URL}/workspaces`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title })
      });
      const newWorkspace = await res.json();
      set((state) => ({ workspaces: [...state.workspaces, newWorkspace] }));
      get().setActiveWorkspace(newWorkspace.id);
    } catch (error) {
      console.error('Error creating workspace', error);
    }
  },

  inactivateWorkspace: async (id: number) => {
    try {
      await fetch(`${API_URL}/workspaces/${id}`, { method: 'DELETE' });
      set((state) => ({
        workspaces: state.workspaces.filter((w) => w.id !== id)
      }));
      if (get().activeWorkspaceId === id) {
        const remaining = get().workspaces;
        get().setActiveWorkspace(remaining.length > 0 ? remaining[0].id : null);
      }
    } catch (error) {
      console.error('Error inactivating workspace', error);
    }
  },

  fetchNotebooks: async () => {
    try {
      const wsId = get().activeWorkspaceId;
      const url = wsId ? `${API_URL}/notebooks?workspace_id=${wsId}` : `${API_URL}/notebooks`;
      const res = await fetch(url);
      if (!res.ok) return;
      const data = await res.json();
      if (Array.isArray(data)) {
        set({ notebooks: data });
      }
    } catch (error) {
      console.error('Error fetching notebooks', error);
    }
  },

  createNotebook: async (title, parentId = null) => {
    try {
      const wsId = get().activeWorkspaceId;
      const res = await fetch(`${API_URL}/notebooks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, parent_id: parentId, workspace_id: wsId })
      });
      const newNotebook = await res.json();
      set((state) => ({ notebooks: [...state.notebooks, newNotebook] }));
    } catch (error) {
      console.error('Error creating notebook', error);
    }
  },

  updateNotebook: async (id, updates) => {
    try {
      const res = await fetch(`${API_URL}/notebooks/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates)
      });
      const updatedNotebook = await res.json();
      set((state) => ({
        notebooks: state.notebooks.map((n) => (n.id === id ? updatedNotebook : n))
      }));
    } catch (error) {
      console.error('Error updating notebook', error);
    }
  },

  inactivateNotebook: async (id) => {
    await get().updateNotebook(id, { is_active: false });
    set((state) => ({
      notebooks: state.notebooks.filter((n) => n.id !== id)
    }));
  },

  fetchNotes: async (notebookId) => {
    try {
      const wsId = get().activeWorkspaceId;
      let url = `${API_URL}/notes`;
      const params = new URLSearchParams();
      if (notebookId) params.append('notebook_id', notebookId.toString());
      if (wsId) params.append('workspace_id', wsId.toString());
      if (params.toString()) {
        url += `?${params.toString()}`;
      }
      const res = await fetch(url);
      if (!res.ok) return;
      const data = await res.json();
      if (Array.isArray(data)) {
        set({ notes: data });
      }
    } catch (error) {
      console.error('Error fetching notes', error);
    }
  },

  createNote: async (title, content, notebookId = null, type = 'markdown', file_url = null) => {
    try {
      const wsId = get().activeWorkspaceId;
      const res = await fetch(`${API_URL}/notes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, content, notebook_id: notebookId, workspace_id: wsId, type, file_url })
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || `Falha ao criar nota (Status ${res.status})`);
      }
      const newNote = await res.json();
      set((state) => ({ 
        notes: [...state.notes, newNote],
        activeNoteId: newNote.id,
        ...(notebookId ? { activeNotebookId: notebookId } : {})
      }));
      return newNote;
    } catch (error: any) {
      console.error('Error creating note', error);
      alert(error?.message || 'Erro ao criar nota.');
      return null;
    }
  },

  updateNote: async (id, updates) => {
    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      const savedPwd = get().unlockedNoteIds[id];
      if (savedPwd) {
        headers['X-Item-Password'] = savedPwd;
      }
      const res = await fetch(`${API_URL}/notes/${id}`, {
        method: 'PUT',
        headers,
        body: JSON.stringify(updates)
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.detail || 'Falha ao atualizar nota');
      }
      const updatedNote = await res.json();
      set((state) => ({
        notes: state.notes.map((n) => (n.id === id ? { ...n, ...updatedNote } : n))
      }));
    } catch (error) {
      console.error('Error updating note', error);
      throw error;
    }
  },

  deleteNote: async (id) => {
    try {
      const headers: Record<string, string> = {};
      const savedPwd = get().unlockedNoteIds[id];
      if (savedPwd) {
        headers['X-Item-Password'] = savedPwd;
      }
      const res = await fetch(`${API_URL}/notes/${id}`, { method: 'DELETE', headers });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.detail || 'Falha ao excluir nota');
      }
      set((state) => {
        const nextUnlocked = { ...state.unlockedNoteIds };
        delete nextUnlocked[id];
        return {
          notes: state.notes.filter((n) => n.id !== id),
          activeNoteId: state.activeNoteId === id ? null : state.activeNoteId,
          unlockedNoteIds: nextUnlocked
        };
      });
    } catch (error) {
      console.error('Error deleting note', error);
      throw error;
    }
  },

  openTransferModal: (note) => set({ transferModalNote: note }),
  closeTransferModal: () => set({ transferModalNote: null }),

  fetchAllNotebooks: async () => {
    try {
      const res = await fetch(`${API_URL}/notebooks`);
      const data = await res.json();
      return data;
    } catch (error) {
      console.error('Error fetching all notebooks', error);
      return [];
    }
  },

  transferNote: async (noteId, targetWorkspaceId, targetNotebookId = null) => {
    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      const savedPwd = get().unlockedNoteIds[noteId];
      if (savedPwd) {
        headers['X-Item-Password'] = savedPwd;
      }
      const res = await fetch(`${API_URL}/notes/${noteId}`, {
        method: 'PUT',
        headers,
        body: JSON.stringify({
          workspace_id: targetWorkspaceId,
          notebook_id: targetNotebookId
        })
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.detail || 'Falha ao transferir nota');
      }
      const updatedNote = await res.json();
      const currentWsId = get().activeWorkspaceId;

      if (currentWsId !== targetWorkspaceId) {
        // Se transferiu para outro workspace, retira da lista do workspace ativo
        set((state) => ({
          notes: state.notes.filter((n) => n.id !== noteId),
          activeNoteId: state.activeNoteId === noteId ? null : state.activeNoteId
        }));
      } else {
        // Continua no workspace ativo, atualiza o caderno associado
        set((state) => ({
          notes: state.notes.map((n) => (n.id === noteId ? updatedNote : n)),
          activeNotebookId: targetNotebookId
        }));
      }
      set({ transferModalNote: null });
    } catch (error) {
      console.error('Error transferring note', error);
      throw error;
    }
  },

  // Password Protection Methods
  isNotebookUnlocked: (id: number) => {
    const nb = get().notebooks.find((n) => n.id === id);
    if (!nb || !nb.is_password_protected) return true;
    return Boolean(get().unlockedNotebookIds[id]);
  },

  unlockNotebook: async (id: number, password: string) => {
    const res = await fetch(`${API_URL}/notebooks/${id}/unlock`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password })
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail || 'Senha incorreta');
    }
    set((state) => ({
      unlockedNotebookIds: { ...state.unlockedNotebookIds, [id]: password }
    }));
    return true;
  },

  lockNotebook: (id: number) => {
    set((state) => {
      const next = { ...state.unlockedNotebookIds };
      delete next[id];
      return { unlockedNotebookIds: next };
    });
  },

  setNotebookPassword: async (id: number, password: string, currentPassword?: string) => {
    const res = await fetch(`${API_URL}/notebooks/${id}/set-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password, current_password: currentPassword })
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail || 'Erro ao definir senha do caderno');
    }
    set((state) => ({
      notebooks: state.notebooks.map((n) => (n.id === id ? { ...n, is_password_protected: true } : n)),
      unlockedNotebookIds: { ...state.unlockedNotebookIds, [id]: password }
    }));
  },

  removeNotebookPassword: async (id: number, password: string) => {
    const res = await fetch(`${API_URL}/notebooks/${id}/remove-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password })
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail || 'Erro ao remover senha do caderno');
    }
    set((state) => {
      const next = { ...state.unlockedNotebookIds };
      delete next[id];
      return {
        notebooks: state.notebooks.map((n) => (n.id === id ? { ...n, is_password_protected: false } : n)),
        unlockedNotebookIds: next
      };
    });
  },

  isNoteUnlocked: (id: number) => {
    const note = get().notes.find((n) => n.id === id);
    if (!note || !note.is_password_protected) return true;
    return Boolean(get().unlockedNoteIds[id]);
  },

  unlockNote: async (id: number, password: string) => {
    const res = await fetch(`${API_URL}/notes/${id}/unlock`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password })
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail || 'Senha incorreta');
    }
    const data = await res.json();
    const unlockedNote: Note = data.note;
    set((state) => ({
      notes: state.notes.map((n) => (n.id === id ? { ...n, ...unlockedNote } : n)),
      unlockedNoteIds: { ...state.unlockedNoteIds, [id]: password }
    }));
    return true;
  },

  lockNote: (id: number) => {
    set((state) => {
      const next = { ...state.unlockedNoteIds };
      delete next[id];
      return {
        unlockedNoteIds: next,
        notes: state.notes.map((n) => (n.id === id ? { ...n, content: '', file_url: null } : n))
      };
    });
  },

  setNotePassword: async (id: number, password: string, currentPassword?: string) => {
    const res = await fetch(`${API_URL}/notes/${id}/set-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password, current_password: currentPassword })
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail || 'Erro ao definir senha da nota');
    }
    set((state) => ({
      notes: state.notes.map((n) => (n.id === id ? { ...n, is_password_protected: true } : n)),
      unlockedNoteIds: { ...state.unlockedNoteIds, [id]: password }
    }));
  },

  removeNotePassword: async (id: number, password: string) => {
    const res = await fetch(`${API_URL}/notes/${id}/remove-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password })
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail || 'Erro ao remover senha da nota');
    }
    set((state) => {
      const next = { ...state.unlockedNoteIds };
      delete next[id];
      return {
        notes: state.notes.map((n) => (n.id === id ? { ...n, is_password_protected: false } : n)),
        unlockedNoteIds: next
      };
    });
  }
}));

