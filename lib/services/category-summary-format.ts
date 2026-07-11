import type { ConcernAssessment } from '@/lib/types/structural';

/**
 * Pure formatting helpers for the overview category summaries (#540).
 * Kept free of DB access so they are unit-testable; the query side lives
 * in category-summary-service.ts.
 */

/** Normalize a pg date value (Date object or string) to YYYY-MM-DD. */
export function toDateKey(value: unknown): string {
  if (value instanceof Date) {
    const y = value.getFullYear();
    const m = String(value.getMonth() + 1).padStart(2, '0');
    const d = String(value.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  return String(value).slice(0, 10);
}

const EXCERPT_MAX_LENGTH = 320;

/**
 * First paragraph of a narrative, with markdown links/emphasis stripped,
 * truncated at a word boundary.
 */
export function extractNarrativeExcerpt(content: string): string {
  const firstParagraph = (content.trim().split(/\n\s*\n/)[0] ?? '')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
  if (firstParagraph.length <= EXCERPT_MAX_LENGTH) return firstParagraph;
  const cut = firstParagraph.slice(0, EXCERPT_MAX_LENGTH);
  return `${cut.slice(0, cut.lastIndexOf(' '))}…`;
}

/** Plain-English description of elevated context layers (they never drive status). */
function describeContextSignals(convergence: ConcernAssessment): string | null {
  const signals: string[] = [];
  if (convergence.silenceElevated) signals.push('government sources are unusually quiet');
  if (convergence.structuralElevated) signals.push('publication patterns are unusual');
  if (convergence.thematicElevated) signals.push('topic emphasis is shifting');
  if (signals.length === 0) return null;
  return `Also observed: ${signals.join('; ')} — context that does not affect the status.`;
}

export interface SummaryCounts {
  flagged: number;
  concerning: number;
  total: number;
}

function pluralDocs(count: number): string {
  return count === 1 ? 'document' : 'documents';
}

/** Build a reader-facing summary of why the convergence status is what it is. */
export function buildConvergenceSummary(
  convergence: ConcernAssessment,
  counts: SummaryCounts,
): string {
  const { status } = convergence;
  const { flagged, concerning, total } = counts;

  let lead: string;
  if (status === 'Stable') {
    lead =
      total === 0
        ? 'No documents were published in this category this week.'
        : `AI review found no concerning government actions in this week's ${total} ${pluralDocs(total)}.`;
  } else if (status === 'ConfirmedConcern') {
    const n = concerning > 0 ? concerning : flagged;
    lead = `AI review confirmed concerning government actions in ${n} of this week's ${total} ${pluralDocs(total)}.`;
  } else {
    lead = `AI review flagged ${flagged} of this week's ${total} ${pluralDocs(total)} as potentially concerning.`;
  }

  const context = describeContextSignals(convergence);
  return context ? `${lead} ${context}` : lead;
}
