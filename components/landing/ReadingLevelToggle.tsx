import { useReadingLevel } from '@/lib/contexts/ReadingLevelContext';

export function ReadingLevelToggle() {
  const { readingLevel, setReadingLevel } = useReadingLevel();

  return (
    <div className="flex items-center gap-2 text-xs text-dm-text-secondary">
      <span>Reading level:</span>
      <div className="flex rounded-full border border-dm-border bg-dm-card overflow-hidden">
        <button
          onClick={() => setReadingLevel('summary')}
          className={`px-3 py-1 transition-colors ${
            readingLevel === 'summary' ? 'bg-dm-accent text-white' : 'hover:bg-dm-border'
          }`}
        >
          Summary
        </button>
        <button
          onClick={() => setReadingLevel('detailed')}
          className={`px-3 py-1 transition-colors ${
            readingLevel === 'detailed' ? 'bg-dm-accent text-white' : 'hover:bg-dm-border'
          }`}
        >
          Detailed
        </button>
      </div>
    </div>
  );
}
