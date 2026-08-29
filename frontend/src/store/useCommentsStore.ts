import { create } from 'zustand';
import type { Comment } from '../types';

const API_URL = 'http://localhost:8000';

interface CommentsState {
  comments: Comment[];
  
  fetchComments: (noteId: number) => Promise<void>;
  createComment: (noteId: number, content: string, selectedText: string) => Promise<Comment | null>;
  updateComment: (id: number, content: string) => Promise<void>;
  deleteComment: (id: number) => Promise<void>;
  clearComments: () => void;
}

export const useCommentsStore = create<CommentsState>((set) => ({
  comments: [],

  fetchComments: async (noteId) => {
    try {
      const res = await fetch(`${API_URL}/notes/${noteId}/comments`);
      const data = await res.json();
      set({ comments: data });
    } catch (error) {
      console.error('Error fetching comments', error);
    }
  },

  createComment: async (noteId, content, selectedText) => {
    try {
      const res = await fetch(`${API_URL}/notes/${noteId}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ note_id: noteId, content, selected_text: selectedText })
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

  clearComments: () => set({ comments: [] })
}));
