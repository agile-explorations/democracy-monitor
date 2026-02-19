import type { ReactNode } from 'react';
import { createContext, useContext, useEffect, useState } from 'react';
import { useLocalStorage } from '@/lib/hooks/useLocalStorage';

export type ThemePreference = 'light' | 'dark' | 'system';

interface ThemeContextValue {
  theme: ThemePreference;
  setTheme: (theme: ThemePreference) => void;
  /** The resolved mode after applying system preference */
  resolvedMode: 'light' | 'dark';
}

const ThemeContext = createContext<ThemeContextValue>({
  theme: 'system',
  setTheme: () => {},
  resolvedMode: 'light',
});

function getSystemPreference(): 'light' | 'dark' {
  if (typeof window === 'undefined') return 'light';
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useLocalStorage<ThemePreference>('dm_theme', 'system');
  const [systemPref, setSystemPref] = useState<'light' | 'dark'>(getSystemPreference);

  // Track OS-level preference changes
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = () => setSystemPref(mq.matches ? 'dark' : 'light');
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  const resolvedMode = theme === 'system' ? systemPref : theme;

  // Apply dark class to <html>
  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle('dark', resolvedMode === 'dark');
  }, [resolvedMode]);

  return (
    <ThemeContext.Provider value={{ theme, setTheme, resolvedMode }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}
