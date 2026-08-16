import { useState } from 'react';
import { categoryLabel } from './helpers';
import type { ExploreDocResult } from './types';

/**
 * Assessment display on Explore cards (#728 follow-up): the per-category
 * badge rows were incomprehensible jargon repeated up to 5× per card, so the
 * card now leads with ONE plain-language summary line — the AI reviewer's
 * worst verdict and the document's top assessment score — and the full
 * per-category detail renders only behind an explicit "assessment details"
 * disclosure. Interim design: the full redesign belongs to the lens model
 * (DECISIONS 2026-08-16).
 */

export interface AssessmentSummary {
  verdict: string | null;
  confidence: number | null;
  verdictCategories: number;
  totalCategories: number;
  topScore: number | null;
  topCategory: string | null;
}

const VERDICT_RANK: Record<string, number> = {
  clearly_concerning: 2,
  potentially_concerning: 1,
};

/** Reduce a document's category rows to the headline signals. Pure. */
export function summarizeAssessment(categories: ExploreDocResult[]): AssessmentSummary {
  let verdict: string | null = null;
  let confidence: number | null = null;
  for (const c of categories) {
    if (!c.aiAssessment) continue;
    const better =
      verdict === null || (VERDICT_RANK[c.aiAssessment] ?? 0) > (VERDICT_RANK[verdict] ?? 0);
    if (better) {
      verdict = c.aiAssessment;
      confidence = c.aiConfidence ?? null;
    } else if (c.aiAssessment === verdict && (c.aiConfidence ?? 0) > (confidence ?? 0)) {
      confidence = c.aiConfidence ?? null;
    }
  }
  const verdictCategories = verdict
    ? categories.filter((c) => c.aiAssessment === verdict).length
    : 0;
  let topScore: number | null = null;
  let topCategory: string | null = null;
  for (const c of categories) {
    if (c.finalScore != null && (topScore === null || c.finalScore > topScore)) {
      topScore = c.finalScore;
      topCategory = c.category;
    }
  }
  return {
    verdict,
    confidence,
    verdictCategories,
    totalCategories: categories.length,
    topScore,
    topCategory,
  };
}

function verdictColor(verdict: string): string {
  if (verdict === 'clearly_concerning') return 'text-red-500';
  if (verdict === 'potentially_concerning') return 'text-amber-500';
  return 'text-dm-muted';
}

function VerdictPhrase({ s }: { s: AssessmentSummary }) {
  if (!s.verdict) return <span className="text-dm-muted">Not flagged in weekly assessment</span>;
  const scope =
    s.totalCategories === 1
      ? ''
      : s.verdictCategories === s.totalCategories
        ? ` across all ${s.totalCategories} categories`
        : ` in ${s.verdictCategories} of ${s.totalCategories} categories`;
  return (
    <span
      className={`font-medium cursor-help ${verdictColor(s.verdict)}`}
      title="The AI document reviewer's strongest verdict for this document, with its confidence — the signal that drives concern status"
    >
      AI: {s.verdict.replace(/_/g, ' ')}
      {s.confidence != null && ` (${(s.confidence * 100).toFixed(0)}%)`}
      {scope}
    </span>
  );
}

/** One-line summary + expandable per-category detail rows. */
export function CardAssessment({ categories }: { categories: ExploreDocResult[] }) {
  const [expanded, setExpanded] = useState(false);
  const s = summarizeAssessment(categories);
  return (
    <div className="mt-2">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px]">
        <VerdictPhrase s={s} />
        {s.topScore != null && s.topScore > 0 && s.topCategory && (
          <span
            className="text-dm-text-secondary cursor-help"
            title="The document's highest weekly-assessment score across its categories — higher means more or stronger concern signals"
          >
            Top score: {s.topScore.toFixed(1)} ({categoryLabel(s.topCategory)})
          </span>
        )}
        <button
          type="button"
          onClick={() => setExpanded((e) => !e)}
          className="text-[11px] text-dm-accent hover:underline"
          aria-expanded={expanded}
        >
          {expanded ? 'Hide assessment details' : 'Assessment details'}
        </button>
      </div>
      {expanded && (
        <div className="mt-1.5 space-y-1">
          {categories.map((doc) => (
            <CategoryRow key={doc.id} doc={doc} />
          ))}
        </div>
      )}
    </div>
  );
}

/** Erosion-lens badges per category row (#728: tooltips + humanized labels
 *  as the interim legibility fix — the full redesign belongs to the lens
 *  model, DECISIONS 2026-08-16). */
export function CategoryRow({ doc }: { doc: ExploreDocResult }) {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px]">
      <span
        className="px-1.5 py-0 rounded bg-dm-border/50 text-dm-muted cursor-help"
        title="Monitoring category this document was routed to — one document can be assessed in several categories, each with its own scores"
      >
        {categoryLabel(doc.category)}
      </span>
      {doc.finalScore != null && (
        <span
          className="text-dm-text-secondary cursor-help"
          title="Weekly assessment score for this document IN THIS CATEGORY — 0.0 means none of this category's scoring signals matched; higher means more or stronger concern signals"
        >
          Score: {doc.finalScore.toFixed(1)}
        </span>
      )}
      {doc.documentClass && doc.classMultiplier != null && doc.classMultiplier !== 1.0 && (
        <span
          className="text-dm-muted cursor-help"
          title={`Document type and the weight the assessment gives it (${doc.documentClass.replace(/_/g, ' ')} documents count ${doc.classMultiplier.toFixed(1)}× toward category scores)`}
        >
          {doc.documentClass.replace(/_/g, ' ')} &times;{doc.classMultiplier.toFixed(1)}
        </span>
      )}
      {(doc.captureCount ?? 0) > 0 && (
        <span
          className="text-red-500 cursor-help"
          title="Capture-tier keyword annotations matched in this document — the most severe annotation tier"
        >
          {doc.captureCount} capture signal{doc.captureCount === 1 ? '' : 's'}
        </span>
      )}
      {(doc.driftCount ?? 0) > 0 && (
        <span
          className="text-amber-500 cursor-help"
          title="Drift-tier keyword annotations matched in this document — a moderate annotation tier"
        >
          {doc.driftCount} drift signal{doc.driftCount === 1 ? '' : 's'}
        </span>
      )}
      {doc.aiAssessment && (
        <span
          className={`font-medium cursor-help ${verdictColor(doc.aiAssessment)}`}
          title="The AI document reviewer's verdict for this category, with its confidence — the signal that drives concern status"
        >
          AI: {doc.aiAssessment.replace(/_/g, ' ')}
          {doc.aiConfidence != null && ` (${(doc.aiConfidence * 100).toFixed(0)}%)`}
        </span>
      )}
      {doc.aiErosionType && (
        <span
          className="text-dm-muted cursor-help"
          title="How this document erodes institutional checks, per the AI reviewer — see the methodology page for the erosion-type definitions"
        >
          {doc.aiErosionType.replace(/_/g, ' ')}
        </span>
      )}
    </div>
  );
}
