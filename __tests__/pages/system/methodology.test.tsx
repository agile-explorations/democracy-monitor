import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { STANCE_SENTENCE } from '@/lib/data/charter-copy';
import { CONCERN_LEVEL_THRESHOLDS } from '@/lib/data/concern-level-explanations';
import { DetailedContent, SummaryContent } from '@/pages/system/methodology';

/**
 * The concern-status *calculation* (Pass 2 count thresholds) must appear in the
 * Concern Synthesis of BOTH reading levels — not just the detailed AI-review
 * section (#673). Assert the shared threshold copy renders in each view.
 */
describe('methodology page — concern-status calculation', () => {
  const thresholds = [
    CONCERN_LEVEL_THRESHOLDS.Stable,
    CONCERN_LEVEL_THRESHOLDS.Elevated,
    CONCERN_LEVEL_THRESHOLDS.ConfirmedConcern,
  ];

  it('summary view shows the count threshold for every status', () => {
    const { container } = render(<SummaryContent />);
    for (const t of thresholds) {
      expect(container.textContent).toContain(t);
    }
  });

  it('detailed view shows the count threshold for every status', () => {
    const { container } = render(<DetailedContent />);
    for (const t of thresholds) {
      expect(container.textContent).toContain(t);
    }
  });
});

describe('methodology page — the stance, both reading levels (#813)', () => {
  it('states the good-repair stance identically in summary and detailed views', () => {
    for (const View of [SummaryContent, DetailedContent]) {
      const { container } = render(<View />);
      const t = container.textContent ?? '';
      expect(t).toContain(STANCE_SENTENCE);
      expect(t).not.toContain('witness, not verdict');
    }
  });
});
