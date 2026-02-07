import { describe, it, expect } from 'vitest';
import { categorizeEvidence } from '@/lib/services/evidence-balance';

describe('categorizeEvidence', () => {
  it('categorizes concerning items as evidenceFor (non-Stable)', () => {
    const items = [
      { title: 'Agency violated the law and was found in contempt' },
      { title: 'Officials fired and terminated without cause' },
    ];
    const { evidenceFor, evidenceAgainst } = categorizeEvidence(items, 'Drift');

    expect(evidenceFor.length).toBeGreaterThan(0);
    expect(evidenceFor[0].direction).toBe('concerning');
  });

  it('categorizes reassuring items as evidenceAgainst (non-Stable)', () => {
    const items = [
      { title: 'Court upheld protections and safeguarded transparency' },
      { title: 'Bipartisan oversight committee restored accountability' },
    ];
    const { evidenceFor, evidenceAgainst } = categorizeEvidence(items, 'Drift');

    expect(evidenceAgainst.length).toBeGreaterThan(0);
    expect(evidenceAgainst[0].direction).toBe('reassuring');
  });

  it('flips perspective for Stable status', () => {
    const items = [
      { title: 'Agency upheld transparency and accountability measures' },
      { title: 'Officials violated the law in systematic pattern' },
    ];
    const { evidenceFor, evidenceAgainst } = categorizeEvidence(items, 'Stable');

    // For Stable: reassuring items support the "stable" assessment
    // so evidenceFor should contain the reassuring item
    expect(evidenceFor.length).toBeGreaterThan(0);
    expect(evidenceFor[0].direction).toBe('reassuring');
  });

  it('skips error and warning items', () => {
    const items = [
      { title: 'Agency violated the law', isError: false },
      { title: 'Error fetching data', isError: true },
      { title: 'Source unavailable', isWarning: true },
    ];
    const { evidenceFor, evidenceAgainst } = categorizeEvidence(items, 'Drift');

    const allEvidence = [...evidenceFor, ...evidenceAgainst];
    expect(allEvidence.every(e => e.text !== 'Error fetching data')).toBe(true);
    expect(allEvidence.every(e => e.text !== 'Source unavailable')).toBe(true);
  });

  it('limits results to 5 items per category', () => {
    const items = Array.from({ length: 20 }, (_, i) => ({
      title: `Agency violated and blocked and obstructed case ${i}`,
    }));
    const { evidenceFor } = categorizeEvidence(items, 'Capture');
    expect(evidenceFor.length).toBeLessThanOrEqual(5);
  });

  it('handles items with no indicator matches', () => {
    const items = [
      { title: 'Regular government meeting held today' },
      { title: 'Agency published quarterly report' },
    ];
    const { evidenceFor, evidenceAgainst } = categorizeEvidence(items, 'Warning');

    expect(evidenceFor).toHaveLength(0);
    expect(evidenceAgainst).toHaveLength(0);
  });

  it('prefers concerning when concerning indicators outnumber reassuring', () => {
    const items = [
      { title: 'Agency violated the law, refused to comply, and blocked oversight' },
    ];
    // "violated", "refused", "blocked" = 3 concerning vs 0 reassuring
    const { evidenceFor } = categorizeEvidence(items, 'Drift');
    expect(evidenceFor.length).toBeGreaterThan(0);
    expect(evidenceFor[0].direction).toBe('concerning');
  });

  it('includes agency as source when available', () => {
    const items = [
      { title: 'Agency violated the law', agency: 'GAO' },
    ];
    const { evidenceFor } = categorizeEvidence(items, 'Drift');
    expect(evidenceFor[0].source).toBe('GAO');
  });

  it('returns empty arrays for empty items', () => {
    const { evidenceFor, evidenceAgainst } = categorizeEvidence([], 'Warning');
    expect(evidenceFor).toHaveLength(0);
    expect(evidenceAgainst).toHaveLength(0);
  });
});
