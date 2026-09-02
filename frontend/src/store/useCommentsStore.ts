import { create } from 'zustand';
import type { Comment, CommentConnection } from '../types';

const API_URL = 'http://localhost:8000';

interface CommentsState {
  comments: Comment[];
  connections: CommentConnection[];
  
  fetchComments: (noteId: number) => Promise<void>;
  fetchNotebookComments: (notebookId: number) => Promise<void>;
  createComment: (noteId: number, content: string, selectedText?: string, page_number?: number | null, rect_x1?: number | null, rect_y1?: number | null, rect_x2?: number | null, rect_y2?: number | null) => Promise<Comment | null>;
  updateComment: (id: number, content: string) => Promise<void>;
  updateCommentPosition: (id: number, x: number, y: number) => Promise<void>;
  deleteComment: (id: number) => Promise<void>;
  clearComments: () => void;

  fetchNotebookConnections: (notebookId: number) => Promise<void>;
  createConnection: (sourceId: number, targetId: number) => Promise<CommentConnection | null>;
  updateConnectionObservation: (id: number, observation: string) => Promise<void>;
  deleteConnection: (id: number) => Promise<void>;
}

export const useCommentsStore = create<CommentsState>((set) => ({
  comments: [],
  connections: [],

  fetchComments: async (noteId) => {
    try {
      const res = await fetch(`${API_URL}/notes/${noteId}/comments`);
      const data = await res.json();
      set({ comments: data });
    } catch (error) {
      console.error('Error fetching comments', error);
    }
  },

  fetchNotebookComments: async (notebookId) => {
    try {
      const res = await fetch(`${API_URL}/notebooks/${notebookId}/comments`);
      const data = await res.json();
      set({ comments: data });
    } catch (error) {
      console.error('Error fetching notebook comments', error);
    }
  },

  createComment: async (noteId, content, selectedText, page_number, rect_x1, rect_y1, rect_x2, rect_y2) => {
    try {
      const res = await fetch(`${API_URL}/notes/${noteId}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ note_id: noteId, content, selected_text: selectedText, page_number, rect_x1, rect_y1, rect_x2, rect_y2 })
      });
      const newComment = await res.json();
      set((state) => ({ comments: [...state.comments, newComment] }));
      return newComment;
    } catch (error) {
      console.error('Error creating comment', error);
      return null;
    }
  },

  updateComment: async (id, content) => {
    try {
      const res = await fetch(`${API_URL}/comments/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content })
      });
      const updatedComment = await res.json();
      set((state) => ({
        comments: state.comments.map((c) => (c.id === id ? updatedComment : c))
      }));
    } catch (error) {
      console.error('Error updating comment', error);
    }
  },

  updateCommentPosition: async (id, x_position, y_position) => {
    try {
      const res = await fetch(`${API_URL}/comments/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ x_position, y_position })
      });
      const updatedComment = await res.json();
      set((state) => ({
        comments: state.comments.map((c) => (c.id === id ? updatedComment : c))
      }));
    } catch (error) {
      console.error('Error updating comment position', error);
    }
  },

  deleteComment: async (id) => {
    try {
      await fetch(`${API_URL}/comments/${id}`, { method: 'DELETE' });
      set((state) => ({
        comments: state.comments.filter((c) => c.id !== id)
      }));
    } catch (error) {
      console.error('Error deleting comment', error);
    }
  },

  clearComments: () => set({ comments: [], connections: [] }),

  fetchNotebookConnections: async (notebookId) => {
    try {
      const res = await fetch(`${API_URL}/notebooks/${notebookId}/comment-connections`);
      const data = await res.json();
      set({ connections: data });
    } catch (error) {
      console.error('Error fetching notebook connections', error);
    }
  },

  createConnection: async (sourceId, targetId) => {
    try {
      const res = await fetch(`${API_URL}/comment-connections`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ source_comment_id: sourceId, target_comment_id: targetId })
      });
      const newConn = await res.json();
      set((state) => ({ connections: [...state.connections, newConn] }));
      return newConn;
    } catch (error) {
      console.error('Error creating connection', error);
      return null;
    }
  },

  updateConnectionObservation: async (id, observation) => {
    try {
      const res = await fetch(`${API_URL}/comment-connections/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ observation })
      });
      const updatedConn = await res.json();
      set((state) => ({
        connections: state.connections.map((c) => (c.id === id ? updatedConn : c))
      }));
    } catch (error) {
      console.error('Error updating connection observation', error);
    }
  },

  deleteConnection: async (id) => {
    try {
      await fetch(`${API_URL}/comment-connections/${id}`, { method: 'DELETE' });
      set((state) => ({
        connections: state.connections.filter((c) => c.id !== id)
      }));
    } catch (error) {
      console.error('Error deleting connection', error);
    }
  }
}));
