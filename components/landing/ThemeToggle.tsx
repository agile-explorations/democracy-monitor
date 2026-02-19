import type { ThemePreference } from '@/lib/contexts/ThemeContext';
import { useTheme } from '@/lib/contexts/ThemeContext';

const OPTIONS: Array<{ value: ThemePreference; label: string }> = [
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
  { value: 'system', label: 'System' },
];

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();

  return (
    <div className="flex items-center gap-2 text-xs text-dm-text-secondary">
      <div className="flex rounded-full border border-dm-border bg-dm-card overflow-hidden">
        {OPTIONS.map((opt) => (
          <button
            key={opt.value}
            onClick={() => setTheme(opt.value)}
            className={`px-3 py-1 transition-colors ${
              theme === opt.value ? 'bg-dm-accent text-white' : 'hover:bg-dm-border'
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  );
}
