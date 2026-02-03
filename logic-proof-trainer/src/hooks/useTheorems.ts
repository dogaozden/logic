import { create } from 'zustand';
import { invoke } from '@tauri-apps/api/core';
import type { Theorem, Difficulty, Formula } from '../types';

// Curated example theorems - one per difficulty level
export const CURATED_EXAMPLES: Record<Difficulty, { theorem: Theorem; description: string }> = {
  easy: {
    description: 'Simple direct inference (Modus Ponens)',
    theorem: {
      id: 'example-easy',
      premises: [
        { type: 'Implies', value: [{ type: 'Atom', value: 'P' }, { type: 'Atom', value: 'Q' }] } as Formula,
        { type: 'Atom', value: 'P' } as Formula,
      ],
      conclusion: { type: 'Atom', value: 'Q' } as Formula,
      difficulty: 'easy',
      difficulty_value: 15,
      theme: 'modusPonens',
      name: 'Modus Ponens',
      is_classic: true,
    },
  },
  medium: {
    description: 'Requires Conditional Proof',
    theorem: {
      id: 'example-medium',
      premises: [
        { type: 'Implies', value: [{ type: 'Atom', value: 'P' }, { type: 'Atom', value: 'Q' }] } as Formula,
      ],
      conclusion: {
        type: 'Implies',
        value: [
          { type: 'Not', value: { type: 'Atom', value: 'Q' } },
          { type: 'Not', value: { type: 'Atom', value: 'P' } },
        ],
      } as Formula,
      difficulty: 'medium',
      difficulty_value: 35,
      theme: 'conditionalProof',
      name: 'Contraposition',
      is_classic: true,
    },
  },
  hard: {
    description: 'Multiple steps with De Morgan',
    theorem: {
      id: 'example-hard',
      premises: [
        {
          type: 'Not',
          value: {
            type: 'And',
            value: [{ type: 'Atom', value: 'P' }, { type: 'Atom', value: 'Q' }],
          },
        } as Formula,
      ],
      conclusion: {
        type: 'Or',
        value: [
          { type: 'Not', value: { type: 'Atom', value: 'P' } },
          { type: 'Not', value: { type: 'Atom', value: 'Q' } },
        ],
      } as Formula,
      difficulty: 'hard',
      difficulty_value: 55,
      theme: 'equivalence',
      name: 'De Morgan',
      is_classic: true,
    },
  },
  expert: {
    description: 'Requires Indirect Proof',
    theorem: {
      id: 'example-expert',
      premises: [],
      conclusion: {
        type: 'Implies',
        value: [
          {
            type: 'Implies',
            value: [
              { type: 'Implies', value: [{ type: 'Atom', value: 'P' }, { type: 'Atom', value: 'Q' }] },
              { type: 'Atom', value: 'P' },
            ],
          },
          { type: 'Atom', value: 'P' },
        ],
      } as Formula,
      difficulty: 'expert',
      difficulty_value: 85,
      theme: 'indirectProof',
      name: "Peirce's Law",
      is_classic: true,
    },
  },
};

interface TheoremsState {
  customTheorems: Theorem[];
  selectedTheorem: Theorem | null;
  isLoading: boolean;
  error: string | null;

  // Actions
  loadCustomTheorems: () => Promise<void>;
  generateTheorem: (difficulty: Difficulty) => Promise<Theorem>;
  generateTheoremWithValue: (difficultyValue: number) => Promise<Theorem>;
  selectTheorem: (theorem: Theorem | null) => void;
  saveCustomTheorem: (theorem: Theorem) => Promise<void>;
}

export const useTheorems = create<TheoremsState>((set, get) => ({
  customTheorems: [],
  selectedTheorem: null,
  isLoading: false,
  error: null,

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
