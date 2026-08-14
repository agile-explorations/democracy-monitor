import { describe, expect, it } from 'vitest';
import { CATEGORIES } from '@/lib/data/categories';
import type { IngestReport } from '@/lib/services/ingest-validation-service';
import { collectWarningDetails } from '@/lib/services/ingest-warnings';

const CAT = CATEGORIES[0]!.key;

function emptyReport(): IngestReport {
  return {
    contentCompleteness: [],
    contentCompletenessByOrigin: [],
    paginationFitness: [],
    frPeriodCoverage: [],
    sourcePeriodCoverage: [],
    signalCoverageGaps: [],
    fetchErrors: [],
    unfragmentedCrecGranules: 0,
    metadataOnlyClassification: [],
  } as unknown as IngestReport;
}

function fullFrCoverage() {
  const periods = ['biden_2022', 'biden_2021', 'trump_2017', 'trump_2018', 'trump_t2'];
  return CATEGORIES.flatMap((c) => periods.map((period) => ({ category: c.key, period })));
}

describe('collectWarningDetails', () => {
  it('returns only FR-coverage limitations for an otherwise empty report', () => {
    const w = collectWarningDetails(emptyReport());
    expect(w.every((x) => x.severity === 'limitation')).toBe(true);
    expect(w.some((x) => x.text.includes('no FR documents in any period'))).toBe(true);
  });

  it('is quiet when FR coverage is complete', () => {
    const report = { ...emptyReport(), frPeriodCoverage: fullFrCoverage() };
    expect(collectWarningDetails(report as IngestReport)).toEqual([]);
  });

  it('reports partially missing FR periods and honors the category filter', () => {
    const report = {
      ...emptyReport(),
      frPeriodCoverage: [{ category: CAT, period: 'trump_t2' }],
    };
    const w = collectWarningDetails(report as IngestReport, CAT);
    expect(w).toHaveLength(1);
    expect(w[0]!.text).toContain(`${CAT} missing FR documents in:`);
    expect(w[0]!.text).toContain('biden_2022');
  });

  it('flags fixable null-content populations as actions', () => {
    const report = {
      ...emptyReport(),
      frPeriodCoverage: fullFrCoverage(),
      contentCompleteness: [
        { sourceType: 'Presidential Document', nullContent: 5 },
        { sourceType: 'floor_speech', nullContent: 9 },
      ],
      paginationFitness: [
        { category: CAT, peakWeeklyCount: 950 },
        { category: 'other', peakWeeklyCount: 10 },
      ],
    };
    const w = collectWarningDetails(report as IngestReport);
    expect(w.map((x) => x.text).join('\n')).toContain('--source fr');
    expect(w.map((x) => x.text).join('\n')).toContain('pagination cap 900');
    expect(w.filter((x) => x.severity === 'action')).toHaveLength(2);
  });

  it('classifies source-period gaps: missing-from-T2, late start, asymmetry', () => {
    const rows = [
      { sourceOrigin: 'doj', period: 'biden_2022', count: 100, earliestDate: '2022-01-20' },
      { sourceOrigin: 'doj', period: 'trump_t2', count: 0, earliestDate: null },
      { sourceOrigin: 'oig', period: 'biden_2022', count: 50, earliestDate: '2022-01-20' },
      { sourceOrigin: 'oig', period: 'trump_t2', count: 10, earliestDate: '2025-06-01' },
      { sourceOrigin: 'fec', period: 'biden_2022', count: 1000, earliestDate: '2022-01-20' },
      { sourceOrigin: 'fec', period: 'trump_2017', count: 5, earliestDate: '2017-01-20' },
      { sourceOrigin: 'fec', period: 'trump_t2', count: 10, earliestDate: '2025-01-25' },
      { sourceOrigin: 'whitehouse', period: 'biden_2022', count: 9, earliestDate: '2022-01-20' },
      { sourceOrigin: 'skip', period: 'other', count: 9, earliestDate: '2020-01-01' },
    ];
    const report = {
      ...emptyReport(),
      frPeriodCoverage: fullFrCoverage(),
      sourcePeriodCoverage: rows,
    };
    const texts = collectWarningDetails(report as IngestReport).map((x) => x.text);
    expect(texts).toContainEqual(
      expect.stringContaining('doj: present in baselines but missing from T2'),
    );
    expect(texts).toContainEqual(expect.stringContaining('oig: T2 data starts 2025-06-01'));
    expect(texts).toContainEqual(expect.stringContaining('fec: >10x volume asymmetry'));
    expect(texts.join('\n')).not.toContain('whitehouse');
  });

  it('reports signal gaps, CREC fragmentation, fetch errors, and metadata classification', () => {
    const report = {
      ...emptyReport(),
      frPeriodCoverage: fullFrCoverage(),
      signalCoverageGaps: [
        { category: CAT, origin: 'signal', expectedSource: 'fr' },
        { category: CAT, origin: 'pipeline', expectedSource: 'doj' },
      ],
      unfragmentedCrecGranules: 3,
      fetchErrors: [
        {
          sourceOrigin: 'oig',
          totalIncomplete: 4,
          categories: 2,
          allBaseline: true,
          earliestWeek: '2021-01-04',
          latestWeek: '2021-02-01',
        },
        {
          sourceOrigin: 'doj',
          totalIncomplete: 1,
          categories: 1,
          allBaseline: false,
          earliestWeek: null,
          latestWeek: null,
        },
      ],
      metadataOnlyClassification: [
        {
          population: 'cl-stubs',
          pass: true,
          mode: 'none-present',
          total: 0,
          unmarked: 0,
          hint: 'x',
        },
        {
          population: 'cl-residual',
          pass: false,
          mode: 'none-present',
          total: 7,
          unmarked: 0,
          hint: 'pnpm docs:purge-stubs',
        },
        {
          population: 'oig-meta',
          pass: false,
          mode: 'marked',
          total: 10,
          unmarked: 4,
          hint: 'pnpm mark',
        },
      ],
    };
    const texts = collectWarningDetails(report as IngestReport).map((x) => x.text);
    expect(texts).toContainEqual(expect.stringContaining('missing signal-defined source: fr'));
    expect(texts).toContainEqual(expect.stringContaining('missing pipeline-routed source: doj'));
    expect(texts).toContainEqual(expect.stringContaining('3 whole-day multi-topic CREC'));
    expect(texts).toContainEqual(expect.stringContaining('all in baseline periods'));
    expect(texts).toContainEqual(expect.stringContaining('doj: 1 incomplete fetch(es)'));
    expect(texts).toContainEqual(expect.stringContaining('7 residual row(s) present'));
    expect(texts).toContainEqual(expect.stringContaining('4 of 10 not marked metadata_only'));
    expect(texts.join('\n')).not.toContain('cl-stubs:');
  });
});
