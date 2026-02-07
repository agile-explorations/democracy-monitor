import { describe, it, expect } from 'vitest';
import { getCrossReference, getAllCrossReferences } from '@/lib/services/cross-reference-service';

describe('getCrossReference', () => {
  it('returns correct interpretation for liberal_democracy + Stable', () => {
    const ref = getCrossReference('liberal_democracy', 'Stable');
    expect(ref.intentCategory).toBe('liberal_democracy');
    expect(ref.institutionalStatus).toBe('Stable');
    expect(ref.severity).toBe('low');
    expect(ref.interpretation).toContain('functioning as designed');
  });

  it('returns critical severity for competitive_authoritarian + Capture', () => {
    const ref = getCrossReference('competitive_authoritarian', 'Capture');
    expect(ref.severity).toBe('critical');
    expect(ref.interpretation).toContain('competitive authoritarianism');
  });

  it('returns critical severity for personalist_rule + Drift', () => {
    const ref = getCrossReference('personalist_rule', 'Drift');
    expect(ref.severity).toBe('critical');
    expect(ref.interpretation).toContain('democratic emergency');
  });

  it('returns medium severity for executive_dominant + Stable', () => {
    const ref = getCrossReference('executive_dominant', 'Stable');
    expect(ref.severity).toBe('medium');
  });

  it('returns high severity for illiberal_democracy + Warning', () => {
    const ref = getCrossReference('illiberal_democracy', 'Warning');
    expect(ref.severity).toBe('high');
  });

  it('covers all 5 governance categories x 4 status levels', () => {
    const categories = [
      'liberal_democracy',
      'competitive_authoritarian',
      'executive_dominant',
      'illiberal_democracy',
      'personalist_rule',
    ] as const;
    const statuses = ['Stable', 'Warning', 'Drift', 'Capture'] as const;

    for (const cat of categories) {
      for (const status of statuses) {
        const ref = getCrossReference(cat, status);
        expect(ref.intentCategory).toBe(cat);
        expect(ref.institutionalStatus).toBe(status);
        expect(ref.interpretation).toBeTruthy();
        expect(['low', 'medium', 'high', 'critical']).toContain(ref.severity);
      }
    }
  });

  it('severity generally increases with more authoritarian intent', () => {
    const stableRefs = [
      getCrossReference('liberal_democracy', 'Stable'),
      getCrossReference('competitive_authoritarian', 'Stable'),
      getCrossReference('executive_dominant', 'Stable'),
    ];

    const severityOrder = { low: 0, medium: 1, high: 2, critical: 3 };
    // liberal_democracy + Stable should be less severe than executive_dominant + Stable
    expect(severityOrder[stableRefs[0].severity]).toBeLessThanOrEqual(
      severityOrder[stableRefs[2].severity],
    );
  });
});

describe('getAllCrossReferences', () => {
  it('produces references for all valid status entries', () => {
    const statusMap = { civilService: 'Drift', fiscal: 'Stable', courts: 'Capture' };
    const refs = getAllCrossReferences('competitive_authoritarian', statusMap);

    expect(Object.keys(refs)).toHaveLength(3);
    expect(refs.civilService.institutionalStatus).toBe('Drift');
    expect(refs.fiscal.institutionalStatus).toBe('Stable');
    expect(refs.courts.institutionalStatus).toBe('Capture');
  });

  it('skips entries with invalid status values', () => {
    const statusMap = { civilService: 'Drift', fiscal: 'Unknown', courts: '' };
    const refs = getAllCrossReferences('liberal_democracy', statusMap);

    expect(Object.keys(refs)).toHaveLength(1);
    expect(refs.civilService).toBeDefined();
  });

  it('returns empty object for empty statusMap', () => {
    const refs = getAllCrossReferences('liberal_democracy', {});
    expect(Object.keys(refs)).toHaveLength(0);
  });
});
