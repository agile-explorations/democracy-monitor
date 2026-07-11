import { useEffect, useRef, useState } from 'react';
import { AIAssessmentPanel } from '@/components/category/AIAssessmentPanel';
import { ConcernHeader } from '@/components/category/ConcernHeader';
import { StructuralSignaturePanel } from '@/components/category/StructuralSignaturePanel';
import { ThematicDriftPanel } from '@/components/category/ThematicDriftPanel';
import { NarrativeSection } from '@/components/shared/NarrativeSection';
import { DocumentTable } from '@/components/week/DocumentTable';
import type { ReadingLevel } from '@/lib/contexts/ReadingLevelContext';
import type { EditorialRecord } from '@/lib/types';
import type { CategoryDetailLatestWeek } from '@/lib/types/category-detail';
import type { WeekExplanation } from '@/lib/types/explanation';
import { formatWeekLabel } from '@/lib/utils/date-utils';

/** Anchor id for the documents table — deep-linked from the overview's "documents behind this status" link. */
export const WEEK_DOCUMENTS_ANCHOR = 'week-documents';

/**
 * Scroll the documents table into view once it has rendered, when the page
 * was opened with the documents anchor in the URL hash. Native anchor
 * scrolling can't work here because the section loads asynchronously.
 */
function useScrollToDocumentsAnchor(ready: boolean) {
  const scrolled = useRef(false);
  useEffect(() => {
    if (!ready || scrolled.current) return;
    if (window.location.hash !== `#${WEEK_DOCUMENTS_ANCHOR}`) return;
    scrolled.current = true;
    document
      .getElementById(WEEK_DOCUMENTS_ANCHOR)
      ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [ready]);
}

export interface WeekDetailPanelProps {
  weekOf: string;
  categoryKey: string;
  layers: CategoryDetailLatestWeek | null;
  explanation: WeekExplanation | null;
  narrative: { expert: string; public: string } | null;
  editorial: EditorialRecord | null;
  readingLevel: ReadingLevel;
  loading: boolean;
  onClose: () => void;
}

function CollapsiblePanel({
  title,
  children,
  defaultOpen,
}: {
  title: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen ?? false);

  return (
    <div className="rounded-lg border border-dm-border bg-dm-card">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between p-4 text-left hover:bg-dm-border/20 transition-colors"
      >
        <span className="text-xs font-semibold uppercase tracking-wider text-dm-text-secondary">
          {title}
        </span>
        <span className="text-dm-muted text-xs">{open ? '\u25B2' : '\u25BC'}</span>
      </button>
      {open && <div className="px-5 pb-5">{children}</div>}
    </div>
  );
}

function WeekDetailSkeleton() {
  return (
    <div className="space-y-4">
      <p className="text-xs text-dm-muted flex items-center gap-2">
        <span className="inline-block w-3 h-3 border-2 border-dm-muted/50 border-t-dm-accent rounded-full animate-spin" />
        Loading week data&hellip;
      </p>
      <div className="animate-pulse space-y-4">
        <div className="h-16 bg-dm-border/30 rounded-lg" />
        <div className="h-24 bg-dm-border/30 rounded-lg" />
        <div className="h-12 bg-dm-border/30 rounded-lg" />
      </div>
    </div>
  );
}

export function WeekDetailPanel({
  weekOf,
  categoryKey,
  layers,
  explanation,
  narrative,
  editorial,
  readingLevel,
  loading,
  onClose,
}: WeekDetailPanelProps) {
  useScrollToDocumentsAnchor(!loading && explanation != null);

  return (
    <div className="space-y-4">
      {/* Week header */}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-bold text-dm-text-primary">
          Week of {formatWeekLabel(weekOf)}
        </h3>
        <button
          onClick={onClose}
          className="text-xs text-dm-muted hover:text-dm-text-secondary transition-colors"
        >
          Close
        </button>
      </div>

      {loading ? (
        <WeekDetailSkeleton />
      ) : (
        <>
          {/* Convergence status */}
          <ConcernHeader synthesis={layers?.convergenceDetail ?? null} />

          {/* Narrative */}
          <NarrativeSection
            narrative={narrative}
            readingLevel={readingLevel}
            editorial={editorial}
          />

          {/* Detail panels — collapsed by default */}
          <CollapsiblePanel title="Structural Anomaly">
            <StructuralSignaturePanel
              score={layers?.structuralDetail ?? null}
              readingLevel={readingLevel}
            />
          </CollapsiblePanel>

          <CollapsiblePanel title="AI Document Review">
            <AIAssessmentPanel summary={layers?.aiDetail ?? null} readingLevel={readingLevel} />
          </CollapsiblePanel>

          <CollapsiblePanel title="Thematic Drift">
            <ThematicDriftPanel
              drift={layers?.thematicDetail ?? null}
              readingLevel={readingLevel}
              category={categoryKey}
              weekOf={weekOf}
            />
          </CollapsiblePanel>

          {/* Document table */}
          {explanation && (
            <div
              id={WEEK_DOCUMENTS_ANCHOR}
              className="rounded-lg border border-dm-border bg-dm-card p-5 scroll-mt-4"
            >
              <DocumentTable
                documents={explanation.topDocuments}
                category={categoryKey}
                weekOf={weekOf}
              />
            </div>
          )}
        </>
      )}
    </div>
  );
}
