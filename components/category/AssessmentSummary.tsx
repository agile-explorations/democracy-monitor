export interface AssessmentSummaryProps {
  reason: string;
  howWeCouldBeWrong: string[];
  readingLevel: 'summary' | 'detailed';
}

export function AssessmentSummary({
  reason,
  howWeCouldBeWrong,
  readingLevel,
}: AssessmentSummaryProps) {
  return (
    <section>
      <h2 className="text-xs font-semibold uppercase tracking-wider text-dm-text-secondary mb-3">
        Assessment Summary
      </h2>

      <p className="text-sm text-dm-text-primary leading-relaxed">{reason}</p>

      {howWeCouldBeWrong.length > 0 && (
        <div className="mt-4">
          <h3 className="text-xs font-semibold text-dm-text-secondary mb-2">
            How we could be wrong
          </h3>
          <ul className="space-y-1.5">
            {howWeCouldBeWrong.map((item, i) => (
              <li
                key={i}
                className="flex items-start gap-2 text-xs text-dm-text-secondary leading-relaxed"
              >
                <span className="shrink-0 text-dm-muted mt-0.5">{'\u2022'}</span>
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {readingLevel === 'detailed' && howWeCouldBeWrong.length === 0 && (
        <p className="mt-4 text-xs text-dm-muted italic">
          No alternative interpretations available for this assessment.
        </p>
      )}
    </section>
  );
}
