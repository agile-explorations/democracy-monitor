import { Markdown } from '@/components/ui/Markdown';
import type { ReadingLevel } from '@/lib/contexts/ReadingLevelContext';

export interface NarrativeSectionProps {
  narrative: { expert: string; public: string } | null;
  readingLevel: ReadingLevel;
  loading?: boolean;
}

function NarrativeSkeleton() {
  return (
    <div className="animate-pulse space-y-2">
      <div className="h-3 w-full bg-dm-border/40 rounded" />
      <div className="h-3 w-5/6 bg-dm-border/40 rounded" />
      <div className="h-3 w-4/6 bg-dm-border/40 rounded" />
    </div>
  );
}

export function NarrativeSection({ narrative, readingLevel, loading }: NarrativeSectionProps) {
  if (loading) {
    return (
      <div className="rounded-lg border border-dm-border bg-dm-card p-5">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-dm-text-secondary mb-3">
          AI Narrative
        </h3>
        <NarrativeSkeleton />
      </div>
    );
  }

  if (!narrative) return null;

  const text = readingLevel === 'detailed' ? narrative.expert : narrative.public;

  if (!text) return null;

  return (
    <div className="rounded-lg border border-dm-border bg-dm-card p-5">
      <h3 className="text-xs font-semibold uppercase tracking-wider text-dm-text-secondary mb-3">
        AI Narrative
        <span className="ml-2 text-[10px] font-normal normal-case tracking-normal text-dm-muted">
          {readingLevel === 'detailed' ? 'Expert view' : 'Summary view'}
        </span>
      </h3>
      <Markdown className="text-sm text-dm-text-primary leading-relaxed">{text}</Markdown>
    </div>
  );
}
