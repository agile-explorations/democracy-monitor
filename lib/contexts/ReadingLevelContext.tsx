import type { ReactNode } from 'react';
import { createContext, useContext } from 'react';
import { useLocalStorage } from '@/lib/hooks/useLocalStorage';

export type ReadingLevel = 'summary' | 'detailed';

interface ReadingLevelContextValue {
  readingLevel: ReadingLevel;
  setReadingLevel: (level: ReadingLevel) => void;
}

const ReadingLevelContext = createContext<ReadingLevelContextValue>({
  readingLevel: 'summary',
  setReadingLevel: () => {},
});

export function ReadingLevelProvider({ children }: { children: ReactNode }) {
  const [readingLevel, setReadingLevel] = useLocalStorage<ReadingLevel>(
    'dm_reading_level',
    'summary',
  );

  return (
    <ReadingLevelContext.Provider value={{ readingLevel, setReadingLevel }}>
      {children}
    </ReadingLevelContext.Provider>
  );
}

export function useReadingLevel() {
  return useContext(ReadingLevelContext);
}
