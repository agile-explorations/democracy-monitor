import { useEffect, useRef, useState } from 'react';
import { AIAssessmentPanel } from '@/components/category/AIAssessmentPanel';
import { ConcernHeader } from '@/components/category/ConcernHeader';
import { LitigationPanel } from '@/components/category/LitigationPanel';
import { StructuralSignaturePanel } from '@/components/category/StructuralSignaturePanel';
import { ThematicDriftPanel } from '@/components/category/ThematicDriftPanel';
import { NarrativeSection } from '@/components/shared/NarrativeSection';
import { Chevron } from '@/components/ui/Chevron';
import { CollapsiblePanel } from '@/components/ui/CollapsiblePanel';
import { DocumentTable } from '@/components/week/DocumentTable';
import type { ReadingLevel } from '@/lib/contexts/ReadingLevelContext';
import type { EditorialRecord } from '@/lib/types';
import type { CategoryDetailLatestWeek } from '@/lib/types/category-detail';
import type { WeekExplanation } from '@/lib/types/explanation';
import { formatWeekLabel } from '@/lib/utils/date-utils';

/** Anchor id for the documents table — deep-linked from the overview's "documents behind this status" link. */
export const WEEK_DOCUMENTS_ANCHOR = 'week-documents';
/** Anchor id for the narrative — deep-linked from the overview's narrative excerpt. */
export const WEEK_NARRATIVE_ANCHOR = 'week-narrative';

const WEEK_ANCHORS = [WEEK_DOCUMENTS_ANCHOR, WEEK_NARRATIVE_ANCHOR];

/**
 * Scroll the anchored section into view once it has rendered, when the page
 * was opened with a known week anchor in the URL hash. Native anchor
 * scrolling can't work here because the sections load asynchronously.
 */
function useScrollToWeekAnchor(ready: boolean) {
  const scrolled = useRef(false);
  useEffect(() => {
    if (!ready || scrolled.current) return;
    const anchor = WEEK_ANCHORS.find((a) => window.location.hash === `#${a}`);
    if (!anchor) return;
    scrolled.current = true;
    document.getElementById(anchor)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [ready]);
}

export interface WeekDetailPanelProps {
  weekOf: string;
  categoryKey: string;
  layers: CategoryDetailLatestWeek | null;
  explanation: WeekExplanation | null;
  narrative: { expert: string; public: string; generatedAt?: string } | null;
  editorial: EditorialRecord | null;
  readingLevel: ReadingLevel;
  loading: boolean;
  onClose: () => void;
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
  useScrollToWeekAnchor(!loading);

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
          <div id={WEEK_NARRATIVE_ANCHOR} className="scroll-mt-4">
            <NarrativeSection
              narrative={narrative}
              readingLevel={readingLevel}
              editorial={editorial}
              dataAsOf={narrative?.generatedAt ?? null}
            />
          </div>

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

          {/* Tracked litigation — just above the documents section (owner request 2026-08-10) */}
          <LitigationPanel categoryKey={categoryKey} />

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
