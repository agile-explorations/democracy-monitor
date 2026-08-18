import { EROSION_ACTOR_LABELS } from '@/lib/data/assessment-labels';
import { AI_CONCERN_THRESHOLD } from '@/lib/methodology/scoring-config';
import type { AIAssessmentSummary } from '@/lib/types/structural';

export interface AIAssessmentPanelProps {
  summary: AIAssessmentSummary | null;
  readingLevel: 'summary' | 'detailed';
}

const CONCERN_LABELS: Array<{
  key: keyof AIAssessmentSummary['concernDistribution'];
  label: string;
  color: string;
}> = [
  { key: 'routine', label: 'Routine', color: 'bg-dm-accent/20' },
  { key: 'novelNotConcerning', label: 'Novel (not concerning)', color: 'bg-status-stable' },
  { key: 'potentiallyConcerning', label: 'Potentially concerning', color: 'bg-status-warning' },
  { key: 'clearlyConcerning', label: 'Clearly concerning', color: 'bg-status-capture' },
];

function ConcernBar({
  distribution,
}: {
  distribution: AIAssessmentSummary['concernDistribution'];
}) {
  const total =
    distribution.routine +
    distribution.novelNotConcerning +
    distribution.potentiallyConcerning +
    distribution.clearlyConcerning;
  if (total === 0) return null;

  return (
    <div className="space-y-1.5">
      <div className="flex h-2 rounded-full overflow-hidden">
        {CONCERN_LABELS.map(({ key, color }) => {
          const pct = (distribution[key] / total) * 100;
          if (pct === 0) return null;
          return (
            <div
              key={key}
              className={`${color}`}
              style={{ width: `${pct}%` }}
              title={`${key}: ${pct.toFixed(1)}%`}
            />
          );
        })}
      </div>
      <div className="flex flex-wrap gap-x-3 gap-y-1">
        {CONCERN_LABELS.map(({ key, label, color }) => {
          const pct = (distribution[key] / total) * 100;
          if (pct === 0) return null;
          return (
            <span key={key} className="flex items-center gap-1 text-[10px] text-dm-text-secondary">
              <span className={`inline-block w-2 h-2 rounded-full ${color}`} />
              {label}: {pct.toFixed(0)}%
            </span>
          );
        })}
      </div>
    </div>
  );
}

/**
 * "Concerning by actor" context line (#537). Renders only when the week's
 * ai_detail carries actorConfirmations (aggregates enriched pre-attribution
 * lack it) and at least one confirmed doc exists. Context only — actor
 * attribution does not affect the weekly status.
 */
function ActorMixLine({
  actorConfirmations,
}: {
  actorConfirmations?: AIAssessmentSummary['actorConfirmations'];
}) {
  if (!actorConfirmations) return null;
  const parts = Object.entries(actorConfirmations)
    .map(([actor, counts]) => ({
      actor,
      n: counts.potentiallyConcerning + counts.clearlyConcerning,
    }))
    .filter((p) => p.n > 0)
    .sort((a, b) => b.n - a.n)
    .map(
      (p) =>
        `${p.n} ${p.actor === 'unattributed' ? 'unattributed' : (EROSION_ACTOR_LABELS[p.actor] ?? p.actor)}`,
    );
  if (parts.length === 0) return null;
  return (
    <div className="mb-4">
      <h3 className="text-[11px] font-semibold text-dm-text-secondary mb-1">Departures by Actor</h3>
      <p className="text-xs text-dm-text-secondary">{parts.join(' · ')}</p>
    </div>
  );
}

export function AIAssessmentPanel({ summary, readingLevel }: AIAssessmentPanelProps) {
  if (!summary) {
    return (
      <section>
        <h2 className="text-xs font-semibold uppercase tracking-wider text-dm-text-secondary mb-3">
          AI Document Assessment (Layer 2)
        </h2>
        <p className="text-xs text-dm-muted italic">No AI assessment data available.</p>
      </section>
    );
  }

  const concernElevated = summary.concernRate >= AI_CONCERN_THRESHOLD;
  const concernClass = concernElevated ? 'text-status-drift font-medium' : 'text-dm-text-primary';

  // Summary mode
  if (readingLevel === 'summary') {
    return (
      <section>
        <h2 className="text-xs font-semibold uppercase tracking-wider text-dm-text-secondary mb-3">
          AI Document Assessment (Layer 2)
        </h2>
        <div className="flex items-center gap-4 text-xs">
          <span className="text-dm-text-secondary">
            Flag rate:{' '}
            <span className="text-dm-text-primary font-medium">
              {(summary.flagRate * 100).toFixed(1)}%
            </span>
          </span>
          <span className="text-dm-text-secondary">
            Concern rate:{' '}
            <span className={concernClass}>{(summary.concernRate * 100).toFixed(1)}%</span>
          </span>
        </div>
      </section>
    );
  }

  // Detailed mode
  return (
    <section>
      <h2 className="text-xs font-semibold uppercase tracking-wider text-dm-text-secondary mb-3">
        AI Document Assessment (Layer 2)
      </h2>

      {/* Flag rate */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
        <div>
          <p className="text-[11px] text-dm-muted">Flag Rate</p>
          <p className="text-sm font-medium text-dm-text-primary">
            {(summary.flagRate * 100).toFixed(1)}%
          </p>
        </div>
        <div>
          <p className="text-[11px] text-dm-muted">Baseline Flag Rate</p>
          <p className="text-sm text-dm-text-secondary">
            {(summary.baselineFlagRate * 100).toFixed(1)}%
          </p>
        </div>
        <div>
          <p className="text-[11px] text-dm-muted">Flag Rate Z-Score</p>
          <p className="text-sm text-dm-text-primary font-mono">
            {summary.flagRateZScore.toFixed(2)}
          </p>
        </div>
        <div>
          <p className="text-[11px] text-dm-muted">Departure Rate</p>
          <p className={`text-sm ${concernClass}`}>
            {(summary.concernRate * 100).toFixed(1)}%{concernElevated && ' (elevated)'}
          </p>
        </div>
      </div>

      {/* Concern distribution bar */}
      <div className="mb-4">
        <h3 className="text-[11px] font-semibold text-dm-text-secondary mb-2">
          Concern Distribution ({summary.flagCount} flagged / {summary.totalDocuments} total)
        </h3>
        <ConcernBar distribution={summary.concernDistribution} />
      </div>

      <ActorMixLine actorConfirmations={summary.actorConfirmations} />

      {/* Audit */}
      <div className="mb-3">
        <h3 className="text-[11px] font-semibold text-dm-text-secondary mb-1">Audit</h3>
        <p className="text-xs text-dm-text-secondary">
          {summary.auditSample.sampled} sampled &middot; {summary.auditSample.falseNegatives} false
          negatives &middot; FN rate: {(summary.auditSample.falseNegativeRate * 100).toFixed(1)}%
        </p>
      </div>

      {/* Models */}
      <p className="text-[11px] text-dm-muted">
        Pass 1: {summary.pass1Model} &middot; Pass 2: {summary.pass2Model}
      </p>
    </section>
  );
}
