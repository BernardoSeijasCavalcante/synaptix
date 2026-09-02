import { create } from 'zustand';
import type { Notebook, Note } from '../types';

const API_URL = 'http://localhost:8000';

interface NotesState {
  notebooks: Notebook[];
  notes: Note[];
  activeNotebookId: number | null;
  activeNoteId: number | null;

  // Actions
  setActiveNotebook: (id: number | null) => void;
  setActiveNote: (id: number | null) => void;
  
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
  notebooks: [],
  notes: [],
  activeNotebookId: null,
  activeNoteId: null,

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

  fetchNotebooks: async () => {
    try {
      const res = await fetch(`${API_URL}/notebooks`);
      const data = await res.json();
      set({ notebooks: data });
    } catch (error) {
      console.error('Error fetching notebooks', error);
    }
  },

  createNotebook: async (title, parentId = null) => {
    try {
      const res = await fetch(`${API_URL}/notebooks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, parent_id: parentId })
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
      const url = notebookId 
        ? `${API_URL}/notes?notebook_id=${notebookId}` 
        : `${API_URL}/notes`;
      const res = await fetch(url);
      const data = await res.json();
      set({ notes: data });
    } catch (error) {
      console.error('Error fetching notes', error);
    }
  },

  createNote: async (title, content, notebookId = null, type = 'markdown', file_url = null) => {
    try {
      const res = await fetch(`${API_URL}/notes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, content, notebook_id: notebookId, type, file_url })
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
