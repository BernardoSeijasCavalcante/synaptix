import { create } from 'zustand';

interface PromptState {
  isOpen: boolean;
  title: string;
  resolve: ((value: string | null) => void) | null;
  openPrompt: (title: string) => Promise<string | null>;
  closePrompt: (value: string | null) => void;
}

export const usePromptStore = create<PromptState>((set, get) => ({
  isOpen: false,
  title: '',
  resolve: null,
  openPrompt: (title: string) => {
    return new Promise((resolve) => {
      // Se houver um prompt aberto, cancela o anterior
      const currentResolve = get().resolve;
      if (currentResolve) {
        currentResolve(null);
      }
      set({ isOpen: true, title, resolve });
    });
  },
  closePrompt: (value: string | null) => {
    const { resolve } = get();
    if (resolve) {
      resolve(value);
    }
    set({ isOpen: false, title: '', resolve: null });
  },
}));
