import type { ReactNode } from 'react';
import { createContext, useContext } from 'react';
import { useLocalStorage } from '@/lib/hooks/useLocalStorage';

export type ReadingLevel = 'summary' | 'detailed';

interface ReadingLevelContextValue {
  readingLevel: ReadingLevel;
  setReadingLevel: (level: ReadingLevel) => void;
}

const ReadingLevelContext = createContext<ReadingLevelContextValue>({
  readingLevel: 'detailed',
  setReadingLevel: () => {},
});

export function ReadingLevelProvider({ children }: { children: ReactNode }) {
  // Detailed is the default (owner decision 2026-08-10): the site's audience —
  // reporters, academics, legislators — wants specifics; a stored toggle choice
  // still wins.
  const [readingLevel, setReadingLevel] = useLocalStorage<ReadingLevel>(
    'dm_reading_level',
    'detailed',
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
