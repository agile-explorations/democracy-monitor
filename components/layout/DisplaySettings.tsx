import type { ReadingLevel } from '@/lib/contexts/ReadingLevelContext';
import { useReadingLevel } from '@/lib/contexts/ReadingLevelContext';
import type { ThemePreference } from '@/lib/contexts/ThemeContext';
import { useTheme } from '@/lib/contexts/ThemeContext';

const READING_OPTIONS: Array<{ value: ReadingLevel; label: string }> = [
  { value: 'summary', label: 'Summary' },
  { value: 'detailed', label: 'Detailed' },
];

const THEME_OPTIONS: Array<{ value: ThemePreference; label: string }> = [
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
  { value: 'system', label: 'System' },
];

function PillButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`px-3 py-1 transition-colors ${
        active ? 'bg-dm-accent text-white' : 'hover:bg-dm-border'
      }`}
    >
      {children}
    </button>
  );
}

export function DisplaySettings() {
  const { readingLevel, setReadingLevel } = useReadingLevel();
  const { theme, setTheme } = useTheme();

  return (
    <div className="flex items-center justify-center sm:justify-start gap-2 text-xs text-dm-text-secondary w-full sm:w-auto">
      <span className="hidden sm:inline">Display:</span>
      <div className="flex rounded-full border border-dm-border bg-dm-card overflow-hidden">
        {READING_OPTIONS.map((opt) => (
          <PillButton
            key={opt.value}
            active={readingLevel === opt.value}
            onClick={() => setReadingLevel(opt.value)}
          >
            {opt.label}
          </PillButton>
        ))}
        <span className="w-px bg-dm-border" />
        {THEME_OPTIONS.map((opt) => (
          <PillButton
            key={opt.value}
            active={theme === opt.value}
            onClick={() => setTheme(opt.value)}
          >
            {opt.label}
          </PillButton>
        ))}
      </div>
    </div>
  );
}
