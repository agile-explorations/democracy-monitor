interface SourceBadgeProps {
  type: 'primary' | 'watchdog' | 'archive';
}

const BADGE_STYLES: Record<string, { bg: string; text: string; label: string }> = {
  primary: { bg: 'bg-green-100', text: 'text-green-800', label: 'Official' },
  watchdog: { bg: 'bg-blue-100', text: 'text-blue-800', label: 'Watchdog' },
  archive: { bg: 'bg-amber-100', text: 'text-amber-800', label: 'Archive' },
};

export function SourceBadge({ type }: SourceBadgeProps) {
  const style = BADGE_STYLES[type] || BADGE_STYLES.primary;

  return (
    <span
      className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium ${style.bg} ${style.text}`}
    >
      {style.label}
    </span>
  );
}
