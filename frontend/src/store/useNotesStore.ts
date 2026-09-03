import { create } from 'zustand';
import type { Notebook, Note, Workspace } from '../types';

const API_URL = 'http://localhost:8000';

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
  createNote: (title: string, content: string, notebookId?: number | null, type?: string, file_url?: string | null) => Promise<void>;
  updateNote: (id: number, updates: Partial<Note>) => Promise<void>;
  deleteNote: (id: number) => Promise<void>;
  uploadFile: (file: File) => Promise<string | null>;
}

export const useNotesStore = create<NotesState>((set, get) => ({
  workspaces: [],
  notebooks: [],
  notes: [],
  activeWorkspaceId: null,
  activeNotebookId: null,
  activeNoteId: null,

  setActiveWorkspace: (id) => {
    set({ activeWorkspaceId: id, activeNotebookId: null, activeNoteId: null });
    get().fetchNotebooks();
    get().fetchNotes();
  },
  setActiveNotebook: (id) => set({ activeNotebookId: id }),
  setActiveNote: (id) => set({ activeNoteId: id }),

  uploadFile: async (file: File) => {
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await fetch(`${API_URL}/upload`, {
        method: 'POST',
        body: formData,
      });
      const data = await res.json();
      return data.file_url;
    } catch (error) {
      console.error('Error uploading file', error);
      return null;
    }
  },

  fetchWorkspaces: async () => {
    try {
      const res = await fetch(`${API_URL}/workspaces`);
      const data = await res.json();
      set({ workspaces: data });
      if (data.length > 0 && get().activeWorkspaceId === null) {
        get().setActiveWorkspace(data[0].id);
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
      const data = await res.json();
      set({ notebooks: data });
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
      const data = await res.json();
      set({ notes: data });
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
      const newNote = await res.json();
      set((state) => ({ notes: [...state.notes, newNote] }));
    } catch (error) {
      console.error('Error creating note', error);
    }
  },

  updateNote: async (id, updates) => {
    try {
      const res = await fetch(`${API_URL}/notes/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates)
      });
      const updatedNote = await res.json();
      set((state) => ({
        notes: state.notes.map((n) => (n.id === id ? updatedNote : n))
      }));
    } catch (error) {
      console.error('Error updating note', error);
    }
  },

  deleteNote: async (id) => {
    try {
      await fetch(`${API_URL}/notes/${id}`, { method: 'DELETE' });
      set((state) => ({
        notes: state.notes.filter((n) => n.id !== id)
      }));
    } catch (error) {
      console.error('Error deleting note', error);
    }
  }
}));
