import { useState } from 'react';
import { Chevron } from '@/components/ui/Chevron';
import { Markdown } from '@/components/ui/Markdown';
import type { ReadingLevel } from '@/lib/contexts/ReadingLevelContext';
import type { EditorialRecord } from '@/lib/types';

export function modelLabel(model: string): string {
  if (model.includes('claude')) return `Claude (${model})`;
  if (model.includes('gpt')) return `ChatGPT (${model})`;
  return model;
}

export function EditorialPanel({
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
        className="inline-flex items-center gap-1 text-xs text-dm-text-secondary hover:text-dm-text-primary transition-colors"
      >
        <Chevron open={open} className="w-3 h-3" />
        {open ? 'Hide editorial process' : 'View editorial process'}
      </button>
      {open && (
        <div className="mt-3 space-y-4">
          {draft && (
            <div className="rounded border border-dm-border/50 bg-dm-bg/50 p-3">
              <h4 className="text-[10px] font-semibold uppercase tracking-wider text-dm-muted mb-2">
                Initial Draft
                {editorial.draftModel && (
                  <span className="ml-2 font-normal normal-case tracking-normal">
                    — {modelLabel(editorial.draftModel)}
                  </span>
                )}
              </h4>
              <div className="max-h-64 overflow-y-auto">
                <Markdown className="text-sm text-dm-text-secondary leading-relaxed">
                  {draft}
                </Markdown>
              </div>
            </div>
          )}
          {editorial.feedback && (
            <div className="rounded border border-amber-500/30 bg-amber-500/5 p-3">
              <h4 className="text-[10px] font-semibold uppercase tracking-wider text-amber-600 dark:text-amber-400 mb-2">
                Editorial Feedback
                {editorial.feedbackModel && (
                  <span className="ml-2 font-normal normal-case tracking-normal">
                    — {modelLabel(editorial.feedbackModel)}
                  </span>
                )}
              </h4>
              <div className="max-h-64 overflow-y-auto">
                <Markdown className="text-sm text-dm-text-secondary leading-relaxed">
                  {editorial.feedback}
                </Markdown>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
