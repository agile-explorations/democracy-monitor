import { describe, expect, it } from 'vitest';
import {
  buildConvergenceSummary,
  extractNarrativeExcerpt,
  toDateKey,
} from '@/lib/services/category-summary-format';
import type { ConcernAssessment } from '@/lib/types/structural';

function assessment(overrides: Partial<ConcernAssessment> = {}): ConcernAssessment {
  return {
    status: 'Stable',
    structuralElevated: false,
    aiElevated: false,
    silenceElevated: false,
    thematicElevated: false,
    layersElevated: 0,
    pattern: 'All layers within baseline ranges',
    bootstrap: false,
    ...overrides,
  };
}

describe('buildConvergenceSummary', () => {
  it('describes a quiet stable week with no documents', () => {
    const text = buildConvergenceSummary(assessment(), {
      flagged: 0,
      concerning: 0,
      total: 0,
    });
    expect(text).toBe('No documents were published in this category this week.');
  });

  it('describes a stable week with documents reviewed', () => {
    const text = buildConvergenceSummary(assessment(), {
      flagged: 0,
      concerning: 0,
      total: 41,
    });
    expect(text).toBe(
      "AI review found no concerning government actions in this week's 41 documents.",
    );
  });

  it('describes an elevated week with flag counts', () => {
    const text = buildConvergenceSummary(
      assessment({ status: 'Elevated', aiElevated: true, layersElevated: 1 }),
      { flagged: 3, concerning: 1, total: 65 },
    );
    expect(text).toBe("AI review flagged 3 of this week's 65 documents as potentially concerning.");
  });

  it('describes a confirmed concern week with concerning counts', () => {
    const text = buildConvergenceSummary(
      assessment({ status: 'ConfirmedConcern', aiElevated: true, layersElevated: 1 }),
      { flagged: 4, concerning: 2, total: 53 },
    );
    expect(text).toBe(
      "AI review confirmed concerning government actions in 2 of this week's 53 documents.",
    );
  });

  it('falls back to the flag count when concerning count is missing', () => {
    const text = buildConvergenceSummary(
      assessment({ status: 'ConfirmedConcern', aiElevated: true, layersElevated: 1 }),
      { flagged: 4, concerning: 0, total: 53 },
    );
    expect(text).toContain('in 4 of');
  });

  it('uses singular wording for a single document', () => {
    const text = buildConvergenceSummary(
      assessment({ status: 'Elevated', aiElevated: true, layersElevated: 1 }),
      { flagged: 1, concerning: 0, total: 1 },
    );
    expect(text).toBe("AI review flagged 1 of this week's 1 document as potentially concerning.");
  });

  it('appends context signals without letting them drive the status wording', () => {
    const text = buildConvergenceSummary(
      assessment({
        status: 'Elevated',
        aiElevated: true,
        layersElevated: 1,
        structuralElevated: true,
        thematicElevated: true,
      }),
      { flagged: 2, concerning: 0, total: 20 },
    );
    expect(text).toContain('publication patterns are unusual');
    expect(text).toContain('topic emphasis is shifting');
    expect(text).toContain('does not affect the status');
  });

  it('mentions government silence when the silence layer is elevated', () => {
    const text = buildConvergenceSummary(assessment({ silenceElevated: true }), {
      flagged: 0,
      concerning: 0,
      total: 12,
    });
    expect(text).toContain('government sources are unusually quiet');
  });
});

describe('extractNarrativeExcerpt', () => {
  it('returns the first paragraph only', () => {
    const text = extractNarrativeExcerpt('First paragraph here.\n\nSecond paragraph here.');
    expect(text).toBe('First paragraph here.');
  });

  it('strips markdown links and bold emphasis', () => {
    const text = extractNarrativeExcerpt(
      'The order [Addressing DEI Discrimination](https://example.gov/eo) was **assessed** this week.',
    );
    expect(text).toBe('The order Addressing DEI Discrimination was assessed this week.');
  });

  it('collapses internal whitespace', () => {
    expect(extractNarrativeExcerpt('One  two\n three')).toBe('One two three');
  });

  it('truncates long paragraphs at a word boundary with an ellipsis', () => {
    const long = `${'word '.repeat(100)}end`;
    const text = extractNarrativeExcerpt(long);
    expect(text.length).toBeLessThanOrEqual(321);
    expect(text.endsWith('…')).toBe(true);
    expect(text).not.toContain('  ');
  });
});

describe('toDateKey', () => {
  it('formats Date objects using local calendar components', () => {
    expect(toDateKey(new Date(2026, 2, 30))).toBe('2026-03-30');
  });

  it('passes through ISO date strings', () => {
    expect(toDateKey('2026-03-30')).toBe('2026-03-30');
  });

  it('trims timestamps down to the date part', () => {
    expect(toDateKey('2026-03-30T00:00:00.000Z')).toBe('2026-03-30');
  });
});
