import { useEffect, useRef, useState } from 'react';

export function useLocalStorage<T>(key: string, initial: T) {
  const [value, setValue] = useState<T>(initial);
  const isHydrated = useRef(false);

  // Read from localStorage after hydration (client-only)
  useEffect(() => {
    try {
      const raw = localStorage.getItem(key);
      if (raw) setValue(JSON.parse(raw) as T);
    } catch {
      // localStorage may be unavailable
    }
    isHydrated.current = true;
  }, [key]);

  // Persist changes to localStorage after hydration
  useEffect(() => {
    if (!isHydrated.current) return;
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      // localStorage may be unavailable
    }
  }, [key, value]);

  return [value, setValue] as const;
}
