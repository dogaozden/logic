import { create } from 'zustand';
import { invoke } from '@tauri-apps/api/core';
import type { Theorem, Difficulty } from '../types';

interface TheoremsState {
  classicTheorems: Theorem[];
  customTheorems: Theorem[];
  selectedTheorem: Theorem | null;
  isLoading: boolean;
  error: string | null;

  // Actions
  loadClassicTheorems: () => Promise<void>;
  loadCustomTheorems: () => Promise<void>;
  generateTheorem: (difficulty: Difficulty) => Promise<Theorem>;
  generateTheoremWithValue: (difficultyValue: number) => Promise<Theorem>;
  selectTheorem: (theorem: Theorem | null) => void;
  saveCustomTheorem: (theorem: Theorem) => Promise<void>;
}

export const useTheorems = create<TheoremsState>((set, get) => ({
  classicTheorems: [],
  customTheorems: [],
  selectedTheorem: null,
  isLoading: false,
  error: null,

  loadClassicTheorems: async () => {
    set({ isLoading: true, error: null });
    try {
      const theorems = await invoke<Theorem[]>('get_classic_theorems');
      set({ classicTheorems: theorems, isLoading: false });
    } catch (e) {
      set({ error: String(e), isLoading: false });
    }
  },

  loadCustomTheorems: async () => {
    set({ isLoading: true, error: null });
    try {
      const theorems = await invoke<Theorem[]>('load_custom_theorems');
      set({ customTheorems: theorems, isLoading: false });
    } catch (e) {
      set({ error: String(e), isLoading: false });
    }
  },

  generateTheorem: async (difficulty: Difficulty) => {
    set({ isLoading: true, error: null });
    try {
      const theorem = await invoke<Theorem>('generate_theorem', { difficulty });
      set({ selectedTheorem: theorem, isLoading: false });
      return theorem;
    } catch (e) {
      set({ error: String(e), isLoading: false });
      throw e;
    }
  },

  generateTheoremWithValue: async (difficultyValue: number) => {
    set({ isLoading: true, error: null });
    try {
      const theorem = await invoke<Theorem>('generate_theorem_with_value', { difficultyValue });
      set({ selectedTheorem: theorem, isLoading: false });
      return theorem;
    } catch (e) {
      set({ error: String(e), isLoading: false });
      throw e;
    }
  },

  selectTheorem: (theorem) => {
    set({ selectedTheorem: theorem });
  },

  saveCustomTheorem: async (theorem: Theorem) => {
    try {
      await invoke('save_custom_theorem', { theorem });
      const customs = get().customTheorems;
      set({ customTheorems: [...customs, theorem] });
    } catch (e) {
      set({ error: String(e) });
      throw e;
    }
  },
}));
