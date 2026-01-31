import { create } from 'zustand';
import { persist } from 'zustand/middleware';

type Theme = 'dark' | 'high-contrast';

interface ThemeState {
  theme: Theme;
  coloredBrackets: boolean;
  showBracketLines: boolean;
  setTheme: (theme: Theme) => void;
  toggleHighContrast: () => void;
  toggleColoredBrackets: () => void;
  toggleShowBracketLines: () => void;
}

export const useTheme = create<ThemeState>()(
  persist(
    (set, get) => ({
      theme: 'dark',
      coloredBrackets: true,
      showBracketLines: false,
      setTheme: (theme) => {
        document.documentElement.setAttribute('data-theme', theme === 'dark' ? '' : theme);
        set({ theme });
      },
      toggleHighContrast: () => {
        const newTheme = get().theme === 'dark' ? 'high-contrast' : 'dark';
        document.documentElement.setAttribute('data-theme', newTheme === 'dark' ? '' : newTheme);
        set({ theme: newTheme });
      },
      toggleColoredBrackets: () => {
        set({ coloredBrackets: !get().coloredBrackets });
      },
      toggleShowBracketLines: () => {
        set({ showBracketLines: !get().showBracketLines });
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
