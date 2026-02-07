import { useLocalStorage } from './useLocalStorage';

export function useDevMode() {
  return useLocalStorage<boolean>('epd.devMode', false);
}
