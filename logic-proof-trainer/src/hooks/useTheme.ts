import { create } from 'zustand';
import { persist } from 'zustand/middleware';

type Theme = 'dark' | 'high-contrast';

interface ThemeState {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  toggleHighContrast: () => void;
}

export const useTheme = create<ThemeState>()(
  persist(
    (set, get) => ({
      theme: 'dark',
      setTheme: (theme) => {
        document.documentElement.setAttribute('data-theme', theme === 'dark' ? '' : theme);
        set({ theme });
      },
      toggleHighContrast: () => {
        const newTheme = get().theme === 'dark' ? 'high-contrast' : 'dark';
        document.documentElement.setAttribute('data-theme', newTheme === 'dark' ? '' : newTheme);
        set({ theme: newTheme });
      },
    }),
    {
      name: 'theme-storage',
      onRehydrateStorage: () => (state) => {
        // Apply theme on page load
        if (state?.theme && state.theme !== 'dark') {
          document.documentElement.setAttribute('data-theme', state.theme);
        }
      },
    }
  )
);
