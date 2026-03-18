import { useLocalStorage } from '@/lib/hooks/useLocalStorage';

const MAX_HISTORY = 20;
const STORAGE_KEY = 'dm_search_history';

const CURATED_SEARCHES = [
  'What executive orders has the administration issued on federal workforce restructuring?',
  'Has the administration changed inspector general independence or oversight?',
  'What actions has the government taken on immigration enforcement?',
  'How has the federal rulemaking process changed under the current administration?',
  'What court cases have challenged executive authority?',
  'What has the government done about federal agency funding and spending?',
  'Has the administration taken steps affecting press access or media freedom?',
  'What changes have been made to election administration or voting procedures?',
];

export function useSearchHistory() {
  const [history, setHistory] = useLocalStorage<string[]>(STORAGE_KEY, []);

  const addEntry = (query: string) => {
    const trimmed = query.trim();
    if (!trimmed) return;
    setHistory((prev) => {
      const filtered = prev.filter((q) => q.toLowerCase() !== trimmed.toLowerCase());
      return [trimmed, ...filtered].slice(0, MAX_HISTORY);
    });
  };

  const clearHistory = () => setHistory([]);

  return { history, addEntry, clearHistory };
}

function SectionHeader({
  label,
  action,
}: {
  label: string;
  action?: { text: string; onClick: () => void };
}) {
  return (
    <div className="flex items-center justify-between px-3 py-1.5 border-b border-dm-border">
      <span className="text-[10px] font-semibold uppercase tracking-wider text-dm-muted">
        {label}
      </span>
      {action && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            action.onClick();
          }}
          className="text-[10px] text-dm-muted hover:text-dm-text-secondary transition-colors"
        >
          {action.text}
        </button>
      )}
    </div>
  );
}

function SuggestionList({
  items,
  onSelect,
  onClose,
}: {
  items: string[];
  onSelect: (q: string) => void;
  onClose: () => void;
}) {
  return (
    <ul>
      {items.map((q, i) => (
        <li key={i}>
          <button
            type="button"
            onClick={() => {
              onSelect(q);
              onClose();
            }}
            className="w-full text-left px-3 py-1.5 text-sm text-dm-text-secondary hover:bg-dm-accent/5 hover:text-dm-text-primary transition-colors"
          >
            {q}
          </button>
        </li>
      ))}
    </ul>
  );
}

export function SearchHistoryDropdown({
  history,
  onSelect,
  onClear,
  onClose,
  showCurated = true,
}: {
  history: string[];
  onSelect: (query: string) => void;
  onClear: () => void;
  onClose: () => void;
  showCurated?: boolean;
}) {
  if (!showCurated && history.length === 0) return null;

  return (
    <div className="absolute left-0 right-0 top-full mt-1 z-20 rounded-lg border border-dm-border bg-dm-card shadow-lg overflow-hidden max-h-96 overflow-y-auto">
      {history.length > 0 && (
        <>
          <SectionHeader label="Recent searches" action={{ text: 'Clear', onClick: onClear }} />
          <SuggestionList items={history} onSelect={onSelect} onClose={onClose} />
        </>
      )}
      {showCurated && (
        <>
          <SectionHeader label="Curated searches" />
          <SuggestionList items={CURATED_SEARCHES} onSelect={onSelect} onClose={onClose} />
        </>
      )}
    </div>
  );
}
