import { toNarrativeLayerData } from '@/lib/services/narrative-pipeline';

/** Build a minimal weekly_aggregates-shaped row for testing. */
function buildRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    category: 'judicialIndependence',
    weekOf: '2025-06-02',
    totalSeverity: 12.5,
    documentCount: 30,
    avgSeverityPerDoc: 0.417,
    captureProportion: 0.2,
    driftProportion: 0.5,
    warningProportion: 0.3,
    severityMix: 0.6,
    captureMatchCount: 6,
    driftMatchCount: 15,
    warningMatchCount: 9,
    suppressedMatchCount: 2,
    topKeywords: ['court', 'judge', 'ruling'],
    structuralScore: null as number | null,
    structuralDetail: null as unknown,
    thematicScore: null as number | null,
    thematicDetail: null as unknown,
    convergenceScore: null as number | null,
    convergenceDetail: null as unknown,
    aiScore: null as number | null,
    aiDetail: null as unknown,
    computedAt: new Date('2025-06-03T00:00:00Z'),
    ...overrides,
  };
}

const CAT = { key: 'judicialIndependence', title: 'Judicial Independence' };

describe('toNarrativeLayerData', () => {
  it('maps basic fields from row and category metadata', () => {
    const row = buildRow();
    const result = toNarrativeLayerData(CAT, row as never);

    expect(result.category).toBe('judicialIndependence');
    expect(result.categoryTitle).toBe('Judicial Independence');
    expect(result.weekOf).toBe('2025-06-02');
  });

  it('passes through numeric layer scores', () => {
    const row = buildRow({
      structuralScore: 0.72,
      aiScore: 0.45,
      thematicScore: 0.33,
      convergenceScore: 0.85,
    });
    const result = toNarrativeLayerData(CAT, row as never);

    expect(result.structuralScore).toBe(0.72);
    expect(result.aiScore).toBe(0.45);
    expect(result.thematicScore).toBe(0.33);
    expect(result.convergenceScore).toBe(0.85);
  });

  it('preserves null scores when layers have no data', () => {
    const row = buildRow();
    const result = toNarrativeLayerData(CAT, row as never);

    expect(result.structuralScore).toBeNull();
    expect(result.aiScore).toBeNull();
    expect(result.thematicScore).toBeNull();
    expect(result.convergenceScore).toBeNull();
  });

  it('casts JSONB detail columns to typed interfaces', () => {
    const structural = { anomalous: true, compositeScore: 0.72, dimensions: {} };
    const ai = { flagCount: 3, totalDocuments: 50, flagRate: 0.06, concernRate: 0.1 };
    const thematic = { rollingCentroidDistance: 0.15, zScore: 2.1, novelDocumentRate: 0.08 };
    const convergence = { status: 'Elevated', layersElevated: 2, pattern: 'structural+ai' };

    const row = buildRow({
      structuralDetail: structural,
      aiDetail: ai,
      thematicDetail: thematic,
      convergenceDetail: convergence,
    });
    const result = toNarrativeLayerData(CAT, row as never);

    expect(result.structuralDetail).toEqual(structural);
    expect(result.aiDetail).toEqual(ai);
    expect(result.thematicDetail).toEqual(thematic);
    expect(result.convergenceDetail).toEqual(convergence);
  });

  it('handles null detail columns', () => {
    const row = buildRow();
    const result = toNarrativeLayerData(CAT, row as never);

    expect(result.structuralDetail).toBeNull();
    expect(result.aiDetail).toBeNull();
    expect(result.thematicDetail).toBeNull();
    expect(result.convergenceDetail).toBeNull();
  });

  it('converts weekOf to string regardless of input type', () => {
    // DB date columns can return Date objects or strings depending on driver
    const row = buildRow({ weekOf: new Date('2025-06-02') });
    const result = toNarrativeLayerData(CAT, row as never);

    // String() on a Date gives a long form, but the function uses String()
    expect(typeof result.weekOf).toBe('string');
  });
});
