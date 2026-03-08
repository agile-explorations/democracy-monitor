import { useState } from 'react';
import { Markdown } from '@/components/ui/Markdown';
import type { ReadingLevel } from '@/lib/contexts/ReadingLevelContext';
import type { EditorialRecord } from '@/lib/types';

export interface NarrativeSectionProps {
  narrative: { expert: string; public: string } | null;
  readingLevel: ReadingLevel;
  loading?: boolean;
  failed?: boolean;
  editorial?: EditorialRecord | null;
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

function EditorialPanel({
  editorial,
  readingLevel,
}: {
  editorial: EditorialRecord;
  readingLevel: ReadingLevel;
}) {
  const [open, setOpen] = useState(false);
  const draft = readingLevel === 'detailed' ? editorial.expertDraft : editorial.publicDraft;
  const hasDraft = draft || editorial.feedback;

  if (!hasDraft) return null;

  return (
    <div className="mt-3 border-t border-dm-border pt-3">
      <button
        onClick={() => setOpen(!open)}
        className="text-xs text-dm-text-secondary hover:text-dm-text-primary transition-colors"
      >
        {open ? '▾ Hide editorial process' : '▸ View editorial process'}
      </button>
      {open && (
        <div className="mt-3 space-y-4">
          {draft && (
            <div className="rounded border border-dm-border/50 bg-dm-bg/50 p-3">
              <h4 className="text-[10px] font-semibold uppercase tracking-wider text-dm-muted mb-2">
                Initial Draft
              </h4>
              <Markdown className="text-xs text-dm-text-secondary leading-relaxed">
                {draft}
              </Markdown>
            </div>
          )}
          {editorial.feedback && (
            <div className="rounded border border-amber-500/30 bg-amber-500/5 p-3">
              <h4 className="text-[10px] font-semibold uppercase tracking-wider text-amber-600 dark:text-amber-400 mb-2">
                Editorial Feedback (GPT-4o)
              </h4>
              <Markdown className="text-xs text-dm-text-secondary leading-relaxed">
                {editorial.feedback}
              </Markdown>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function NarrativeSection({
  narrative,
  readingLevel,
  loading,
  failed,
  editorial,
}: NarrativeSectionProps) {
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
      {editorial && <EditorialPanel editorial={editorial} readingLevel={readingLevel} />}
    </div>
  );
}
