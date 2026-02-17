import { describe, it, expect } from 'vitest';
import {
  extractBigrams,
  getAllKeywords,
  countTermFrequencies,
  findGaps,
  buildGapReport,
  formatGapMarkdown,
} from '@/lib/seed/rhetoric-keyword-gaps';
import type { AssessmentRules } from '@/lib/types';

const mockRules: AssessmentRules = {
  courts: {
    keywords: {
      capture: ['court packing', 'judicial override'],
      drift: ['restructuring courts'],
      warning: ['judicial appointments'],
    },
  },
  military: {
    keywords: {
      capture: ['martial law'],
      drift: ['military deployment'],
      warning: ['national guard'],
    },
  },
};

describe('extractBigrams', () => {
  it('extracts bigrams from a title', () => {
    const bigrams = extractBigrams('Federal Court Issues Emergency Ruling');
    expect(bigrams).toContain('federal court');
    expect(bigrams).toContain('court issues');
    expect(bigrams).toContain('emergency ruling');
  });

  it('filters stopwords', () => {
    const bigrams = extractBigrams('The judge in the case');
    // "the", "in", "the" are stopwords; "judge" and "case" are ≤3 chars for "case"
    // Actually "case" is 4 chars so it passes, "judge" passes
    expect(bigrams).toContain('judge case');
  });

  it('lowercases all terms', () => {
    const bigrams = extractBigrams('SUPREME COURT Decision');
    expect(bigrams).toContain('supreme court');
    expect(bigrams).toContain('court decision');
  });

  it('returns empty for short titles', () => {
    expect(extractBigrams('Hi')).toEqual([]);
    expect(extractBigrams('')).toEqual([]);
  });

  it('strips punctuation', () => {
    const bigrams = extractBigrams('Court: emergency order!');
    expect(bigrams).toContain('court emergency');
    expect(bigrams).toContain('emergency order');
  });
});

describe('getAllKeywords', () => {
  it('returns all keywords across tiers for a category', () => {
    const keywords = getAllKeywords(mockRules, 'courts');
    expect(keywords.has('court packing')).toBe(true);
    expect(keywords.has('judicial override')).toBe(true);
    expect(keywords.has('restructuring courts')).toBe(true);
    expect(keywords.has('judicial appointments')).toBe(true);
  });

  it('returns empty set for unknown category', () => {
    expect(getAllKeywords(mockRules, 'unknown').size).toBe(0);
  });

  it('lowercases all keywords', () => {
    const rules: AssessmentRules = {
      test: {
        keywords: {
          capture: ['Upper Case'],
          drift: [],
          warning: [],
        },
      },
    };
    const keywords = getAllKeywords(rules, 'test');
    expect(keywords.has('upper case')).toBe(true);
  });
});

describe('countTermFrequencies', () => {
  it('counts bigram frequencies across titles', () => {
    const titles = [
      'Federal Court Issues Emergency Ruling',
      'Federal Court Denies Appeal',
      'Federal Court Orders Compliance',
    ];
    const freqs = countTermFrequencies(titles, 2);
    const federalCourt = freqs.find((f) => f.term === 'federal court');
    expect(federalCourt).toBeDefined();
    expect(federalCourt!.count).toBe(3);
  });

  it('deduplicates bigrams within a single title', () => {
    const titles = ['Court order court order court order'];
    const freqs = countTermFrequencies(titles, 1);
    const courtOrder = freqs.find((f) => f.term === 'court order');
    expect(courtOrder).toBeDefined();
    expect(courtOrder!.count).toBe(1);
  });

  it('filters below minimum threshold', () => {
    const titles = ['Emergency ruling today', 'Different topic entirely'];
    const freqs = countTermFrequencies(titles, 3);
    expect(freqs).toHaveLength(0);
  });

  it('sorts by count descending', () => {
    const titles = [
      'Alpha beta gamma',
      'Alpha beta delta',
      'Alpha beta epsilon',
      'Gamma delta epsilon',
    ];
    const freqs = countTermFrequencies(titles, 1);
    expect(freqs[0].term).toBe('alpha beta');
    expect(freqs[0].count).toBe(3);
  });
});

describe('findGaps', () => {
  it('filters out terms already in keyword dictionary', () => {
    const termFreqs = [
      { term: 'court packing', count: 5, categories: [] },
      { term: 'judicial crisis', count: 3, categories: [] },
    ];
    const existing = new Set(['court packing']);
    const gaps = findGaps(termFreqs, existing);
    expect(gaps).toHaveLength(1);
    expect(gaps[0].term).toBe('judicial crisis');
  });

  it('returns all terms when dictionary is empty', () => {
    const termFreqs = [
      { term: 'term one', count: 5, categories: [] },
      { term: 'term two', count: 3, categories: [] },
    ];
    const gaps = findGaps(termFreqs, new Set());
    expect(gaps).toHaveLength(2);
  });

  it('returns empty when all terms are in dictionary', () => {
    const termFreqs = [{ term: 'court packing', count: 5, categories: [] }];
    const existing = new Set(['court packing']);
    expect(findGaps(termFreqs, existing)).toHaveLength(0);
  });
});

describe('buildGapReport', () => {
  it('builds report across multiple categories', () => {
    const titlesByCategory = new Map([
      [
        'courts',
        [
          'Federal Court Emergency Session',
          'Federal Court Emergency Hearing',
          'Federal Court Emergency Order',
        ],
      ],
      ['military', ['Routine Training Exercise']],
    ]);

    const report = buildGapReport(titlesByCategory, mockRules, 2);

    expect(report.categories).toHaveLength(2);
    expect(report.minDocThreshold).toBe(2);

    const courtsReport = report.categories.find((c) => c.category === 'courts');
    expect(courtsReport).toBeDefined();
    expect(courtsReport!.totalDocuments).toBe(3);
    // "federal court" appears 3 times but is NOT in dictionary → should be a gap
    const federalCourtGap = courtsReport!.gaps.find((g) => g.term === 'federal court');
    expect(federalCourtGap).toBeDefined();
    expect(federalCourtGap!.count).toBe(3);
  });

  it('excludes terms that are already keywords', () => {
    const titlesByCategory = new Map([
      [
        'courts',
        [
          'Court Packing Crisis Deepens',
          'Court Packing Effort Stalls',
          'Court Packing Plan Revealed',
        ],
      ],
    ]);

    const report = buildGapReport(titlesByCategory, mockRules, 2);
    const courtsReport = report.categories.find((c) => c.category === 'courts');
    const courtPacking = courtsReport!.gaps.find((g) => g.term === 'court packing');
    expect(courtPacking).toBeUndefined();
  });

  it('sorts categories by gap count descending', () => {
    const titlesByCategory = new Map([
      ['military', ['Training exercise completed']],
      [
        'courts',
        [
          'Judicial emergency order filed',
          'Judicial emergency response delayed',
          'Judicial emergency hearing scheduled',
        ],
      ],
    ]);

    const report = buildGapReport(titlesByCategory, mockRules, 2);
    expect(report.categories[0].category).toBe('courts');
  });
});

describe('formatGapMarkdown', () => {
  it('formats report with category sections', () => {
    const report: ReturnType<typeof buildGapReport> = {
      generatedAt: '2026-02-15',
      minDocThreshold: 3,
      categories: [
        {
          category: 'courts',
          totalDocuments: 100,
          gaps: [{ term: 'judicial crisis', count: 15, category: 'courts' }],
        },
      ],
    };

    const md = formatGapMarkdown(report);
    expect(md).toContain('# Rhetoric-to-Keyword Gap Analysis');
    expect(md).toContain('Total gaps found: 1');
    expect(md).toContain('## courts (100 statements)');
    expect(md).toContain('| judicial crisis | 15 |');
  });

  it('shows no-gaps message when empty', () => {
    const report: ReturnType<typeof buildGapReport> = {
      generatedAt: '2026-02-15',
      minDocThreshold: 3,
      categories: [],
    };

    const md = formatGapMarkdown(report);
    expect(md).toContain('No gaps found');
  });
});
