import { useState } from 'react';
import { Markdown } from '@/components/ui/Markdown';
import type { ReadingLevel } from '@/lib/contexts/ReadingLevelContext';
import type { EditorialRecord } from '@/lib/types';
import { EditorialPanel, modelLabel } from './EditorialPanel';

export interface NarrativeSectionProps {
  narrative: { expert: string; public: string } | null;
  readingLevel: ReadingLevel;
  loading?: boolean;
  failed?: boolean;
  editorial?: EditorialRecord | null;
  placeholder?: string;
  /** Start collapsed, showing a short teaser instead of the full narrative. */
  defaultCollapsed?: boolean;
}

/** First ~220 chars of narrative body text, markdown markers stripped. */
function teaserText(text: string): string {
  const body = text
    .split('\n')
    .filter((line) => line.trim() && !line.trim().startsWith('#'))
    .join(' ')
    .replace(/[*_`>]/g, '')
    .trim();
  return body.length > 220 ? `${body.slice(0, 220)}…` : body;
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

export function NarrativeSection({
  narrative,
  readingLevel,
  loading,
  failed,
  editorial,
  placeholder,
  defaultCollapsed = false,
}: NarrativeSectionProps) {
  const [collapsed, setCollapsed] = useState(defaultCollapsed);

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

  if (failed) {
    return (
      <div className="rounded-lg border border-red-500/30 bg-red-500/5 p-5">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-red-600 dark:text-red-400 mb-2">
          AI Narrative — Generation Failed
        </h3>
        <p className="text-xs text-dm-text-secondary">
          Narrative generation failed for this category-week. Use{' '}
          <code className="text-[10px] bg-dm-bg px-1 rounded">pnpm narratives:retry</code> to
          re-attempt.
        </p>
      </div>
    );
  }

  if (!narrative) {
    if (!placeholder) return null;
    return (
      <div className="rounded-lg border border-dm-border bg-dm-card p-5">
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="w-full flex items-center justify-between"
        >
          <h3 className="text-xs font-semibold uppercase tracking-wider text-dm-text-secondary">
            AI Narrative
          </h3>
          <span className="text-dm-muted text-xs">{collapsed ? '\u25BC' : '\u25B2'}</span>
        </button>
        {!collapsed && <p className="mt-3 text-sm text-dm-muted italic">{placeholder}</p>}
      </div>
    );
  }

  const text = readingLevel === 'detailed' ? narrative.expert : narrative.public;

  if (!text) return null;

  return (
    <div className="rounded-lg border border-dm-border bg-dm-card p-5">
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="w-full flex items-center justify-between"
      >
        <h3 className="text-xs font-semibold uppercase tracking-wider text-dm-text-secondary">
          AI Narrative
          <span className="ml-2 text-[10px] font-normal normal-case tracking-normal text-dm-muted">
            {readingLevel === 'detailed' ? 'Expert view' : 'Summary view'}
            {editorial?.finalModel && ` — ${modelLabel(editorial.finalModel)}`}
          </span>
        </h3>
        <span className="text-dm-muted text-xs">{collapsed ? '\u25BC' : '\u25B2'}</span>
      </button>
      {collapsed ? (
        <button onClick={() => setCollapsed(false)} className="block w-full text-left">
          <p className="mt-3 text-sm text-dm-text-secondary leading-relaxed">{teaserText(text)}</p>
          <span className="mt-1.5 inline-block text-xs text-dm-accent hover:underline">
            Read the full narrative
          </span>
        </button>
      ) : (
        <>
          <div className="mt-3 max-h-80 overflow-y-auto">
            <Markdown className="text-sm text-dm-text-primary leading-relaxed">{text}</Markdown>
          </div>
          {editorial && <EditorialPanel editorial={editorial} readingLevel={readingLevel} />}
        </>
      )}
    </div>
  );
}
