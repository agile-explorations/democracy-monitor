import { describe, expect, it } from 'vitest';
import {
  buildAttributionPrompt,
  parseAttributionResponse,
  stratifiedSample,
  summarizeDistribution,
} from '@/lib/services/actor-attribution';
import type { AttributionCandidate } from '@/lib/services/actor-attribution';

function makeCandidate(overrides: Partial<AttributionCandidate> = {}): AttributionCandidate {
  return {
    id: 1,
    url: 'https://example.com/op/1',
    category: 'civilLiberties',
    title: 'United States v. Hinds County',
    reasoning: 'County held in contempt for violating a consent decree.',
    citedPassages: ['violated over two dozen provisions'],
    erosionType: 'noncompliance_refusal',
    assessment: 'clearly_concerning',
    contentHead: 'IN THE UNITED STATES DISTRICT COURT...',
    weekOf: '2022-01-31',
    ...overrides,
  };
}

describe('buildAttributionPrompt', () => {
  it('includes stored assessment context and the shared actor framework', () => {
    const prompt = buildAttributionPrompt(makeCandidate());
    expect(prompt).toContain('United States v. Hinds County');
    expect(prompt).toContain('consent decree');
    expect(prompt).toContain('violated over two dozen provisions');
    expect(prompt).toContain('Erosion actor framework:');
    expect(prompt).toContain('"erosionActor"');
  });

  it('tolerates missing reasoning, passages, and content', () => {
    const prompt = buildAttributionPrompt(
      makeCandidate({ reasoning: null, citedPassages: null, contentHead: null }),
    );
    expect(prompt).toContain('(none recorded)');
    expect(prompt).toContain('(content unavailable)');
  });
});

describe('parseAttributionResponse', () => {
  it('parses a valid response', () => {
    const parsed = parseAttributionResponse(
      JSON.stringify({
        erosionActor: 'state_local',
        confidence: 0.9,
        rationale: 'The county government violates the court order.',
      }),
    );
    expect(parsed?.erosionActor).toBe('state_local');
  });

  it('rejects invalid actors and garbage', () => {
    expect(
      parseAttributionResponse(
        JSON.stringify({ erosionActor: 'hoa', confidence: 0.5, rationale: 'x' }),
      ),
    ).toBeNull();
    expect(parseAttributionResponse('not json')).toBeNull();
  });
});

describe('stratifiedSample', () => {
  const rows = [
    ...Array.from({ length: 90 }, (_, i) => ({ category: 'big', id: i })),
    ...Array.from({ length: 10 }, (_, i) => ({ category: 'small', id: 100 + i })),
    ...Array.from({ length: 2 }, (_, i) => ({ category: 'tiny', id: 200 + i })),
  ];

  it('is proportional with a per-category floor', () => {
    const sample = stratifiedSample(rows, 20, 5);
    const byCat = summarizeDistributionByCategory(sample);
    expect(byCat.big).toBeGreaterThanOrEqual(15); // ~90% of 20, floored up
    expect(byCat.small).toBeGreaterThanOrEqual(5); // floor beats proportional (2)
    expect(byCat.tiny).toBe(2); // floor capped by available rows
  });

  it('is deterministic for identical input', () => {
    const a = stratifiedSample(rows, 20);
    const b = stratifiedSample(rows, 20);
    expect(a).toEqual(b);
  });

  function summarizeDistributionByCategory(sample: Array<{ category: string }>) {
    const out: Record<string, number> = {};
    for (const s of sample) out[s.category] = (out[s.category] ?? 0) + 1;
    return out;
  }
});

describe('summarizeDistribution', () => {
  it('counts actors per category', () => {
    const dist = summarizeDistribution([
      { category: 'fiscal', erosionActor: 'federal_executive' },
      { category: 'fiscal', erosionActor: 'federal_executive' },
      { category: 'fiscal', erosionActor: 'congress' },
      { category: 'elections', erosionActor: 'state_local' },
    ]);
    expect(dist.fiscal.federal_executive).toBe(2);
    expect(dist.fiscal.congress).toBe(1);
    expect(dist.elections.state_local).toBe(1);
  });
});
