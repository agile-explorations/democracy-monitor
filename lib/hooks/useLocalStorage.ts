import { useEffect, useState } from 'react';

export function useLocalStorage<T>(key: string, initial: T) {
  const [value, setValue] = useState<T>(initial);
  // Hydration gate must be STATE, not a ref: a ref flips synchronously inside
  // the read effect, so the persist effect (same effect pass, stale closure
  // over `value`) would immediately overwrite the just-read stored value with
  // the default. Under React StrictMode's double effect pass that clobber
  // happens before the second read — saved preferences could never survive a
  // reload in dev, and prod had a transient overwrite window (#533 review).
  const [hydrated, setHydrated] = useState(false);

  // Read from localStorage after hydration (client-only)
  useEffect(() => {
    try {
      const raw = localStorage.getItem(key);
      if (raw) setValue(JSON.parse(raw) as T);
    } catch {
      // localStorage may be unavailable
    }
    setHydrated(true);
  }, [key]);

  // Persist changes to localStorage, starting the render AFTER the read applied
  useEffect(() => {
    if (!hydrated) return;
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      // localStorage may be unavailable
    }
  }, [key, value, hydrated]);

  return [value, setValue] as const;
}
