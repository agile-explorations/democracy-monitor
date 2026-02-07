import { useEffect, useRef } from 'react';

export function useAutoRefresh(intervalMs: number, tick: () => void) {
  const saved = useRef(tick);

  useEffect(() => {
    saved.current = tick;
  }, [tick]);

  useEffect(() => {
    if (!intervalMs) return;
    const id = setInterval(() => saved.current(), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
}
