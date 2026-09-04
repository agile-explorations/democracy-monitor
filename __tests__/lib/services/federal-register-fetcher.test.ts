import { describe, it, expect } from 'vitest';
import { CATEGORIES } from '@/lib/data/categories';
import {
  buildFrApiUrl,
  parseSignalParams,
  toContentItem,
} from '@/lib/services/federal-register-fetcher';

describe('buildFrApiUrl', () => {
  it('builds a valid FR API URL with date range', () => {
    const url = buildFrApiUrl({}, 1, '2025-01-01', '2025-01-31', 100);
    expect(url).toContain('federalregister.gov/api/v1/documents.json');
    expect(url).toContain('per_page=100');
    expect(url).toContain('page=1');
    expect(url).toContain('2025-01-01');
    expect(url).toContain('2025-01-31');
    expect(url).toContain('order=oldest');
  });

  it('includes single agency when provided', () => {
    const url = buildFrApiUrl({ agencies: ['epa'] }, 1, '2025-01-01', '2025-01-31', 20);
    expect(url).toContain('conditions%5Bagencies%5D%5B%5D=epa');
  });

  it('includes multiple agencies when provided', () => {
    const url = buildFrApiUrl(
      { agencies: ['personnel-management-office', 'executive-office-of-the-president'] },
      1,
      '2025-01-01',
      '2025-01-31',
      20,
    );
    expect(url).toContain('conditions%5Bagencies%5D%5B%5D=personnel-management-office');
    expect(url).toContain('conditions%5Bagencies%5D%5B%5D=executive-office-of-the-president');
  });

  it('includes type when provided', () => {
    const url = buildFrApiUrl({ type: 'PRESDOCU' }, 1, '2025-01-01', '2025-01-31', 20);
    expect(url).toContain('conditions%5Btype%5D%5B%5D=PRESDOCU');
  });

  it('includes term when provided', () => {
    const url = buildFrApiUrl({ term: '"schedule f"' }, 1, '2025-01-01', '2025-01-31', 20);
    expect(url).toContain('conditions%5Bterm%5D=%22schedule+f%22');
  });

  it('omits agency/type/term conditions when not provided', () => {
    const url = buildFrApiUrl({}, 1, '2025-01-01', '2025-01-31', 20);
    expect(url).not.toContain('conditions%5Bagencies%5D');
    expect(url).not.toContain('conditions%5Btype%5D');
    expect(url).not.toContain('conditions%5Bterm%5D');
  });

  it('uses provided page number', () => {
    const url = buildFrApiUrl({}, 5, '2025-01-01', '2025-01-31', 20);
    expect(url).toContain('page=5');
  });

  it('requests raw_text_url field for Presidential Document content', () => {
    const url = buildFrApiUrl({}, 1, '2025-01-01', '2025-01-31', 20);
    expect(url).toContain('fields%5B%5D=raw_text_url');
  });

  it('requests all fields needed by toContentItem', () => {
    const url = buildFrApiUrl({}, 1, '2025-01-01', '2025-01-31', 20);
    for (const field of [
      'title',
      'html_url',
      'publication_date',
      'agencies',
      'type',
      'subtype',
      'action',
      'abstract',
      'raw_text_url',
    ]) {
      expect(url).toContain(`fields%5B%5D=${field}`);
    }
  });
});

describe('parseSignalParams', () => {
  it('extracts single agency from signal URL', () => {
    const params = parseSignalParams('/api/federal-register?agency=personnel-management-office');
    expect(params.agencies).toEqual(['personnel-management-office']);
    expect(params.type).toBeUndefined();
    expect(params.term).toBeUndefined();
  });

  it('extracts comma-separated agencies from signal URL', () => {
    const params = parseSignalParams(
      '/api/federal-register?agency=personnel-management-office,executive-office-of-the-president,management-and-budget-office',
    );
    expect(params.agencies).toEqual([
      'personnel-management-office',
      'executive-office-of-the-president',
      'management-and-budget-office',
    ]);
  });

  it('extracts type from signal URL', () => {
    const params = parseSignalParams('/api/federal-register?type=PRESDOCU');
    expect(params.type).toBe('PRESDOCU');
  });

  it('extracts term from signal URL', () => {
    const params = parseSignalParams('/api/federal-register?term=%22schedule+f%22');
    expect(params.term).toBe('"schedule f"');
  });

  it('extracts multiple params', () => {
    const params = parseSignalParams(
      '/api/federal-register?type=PRESDOCU&term=workforce+|+personnel',
    );
    expect(params.type).toBe('PRESDOCU');
    expect(params.term).toBe('workforce | personnel');
  });

  it('returns all undefined for URL with no params', () => {
    const params = parseSignalParams('/api/federal-register');
    expect(params.agencies).toBeUndefined();
    expect(params.type).toBeUndefined();
    expect(params.term).toBeUndefined();
  });
});

describe('toContentItem', () => {
  it('maps all FR API fields to ContentItem', () => {
    const item = toContentItem({
      title: 'Test Rule',
      html_url: 'https://federalregister.gov/d/2025-12345',
      publication_date: '2025-02-15',
      agencies: [{ name: 'EPA' }, { name: 'DOI' }],
      type: 'Rule',
      subtype: undefined,
      action: 'Final rule.',
      abstract: 'A test abstract.',
    });

    expect(item.title).toBe('Test Rule');
    expect(item.link).toBe('https://federalregister.gov/d/2025-12345');
    expect(item.pubDate).toBe('2025-02-15');
    expect(item.agency).toBe('EPA, DOI');
    expect(item.type).toBe('Rule');
    expect(item.action).toBe('Final rule.');
    expect(item.content).toBe('A test abstract.');
  });

  it('passes through action field from FR API', () => {
    const item = toContentItem({
      action: 'Notice of a modified system of records.',
    });
    expect(item.action).toBe('Notice of a modified system of records.');
  });

  it('passes through subtype field', () => {
    const item = toContentItem({
      type: 'Presidential Document',
      subtype: 'Executive Order',
    });
    expect(item.subtype).toBe('Executive Order');
  });

  it('defaults title to (document) when missing', () => {
    const item = toContentItem({});
    expect(item.title).toBe('(document)');
  });

  it('joins multiple agencies with comma', () => {
    const item = toContentItem({
      agencies: [{ name: 'OPM' }, { name: 'OMB' }, { name: 'GSA' }],
    });
    expect(item.agency).toBe('OPM, OMB, GSA');
  });

  it('truncates long abstracts', () => {
    const longAbstract = 'A'.repeat(1000);
    const item = toContentItem({ abstract: longAbstract });
    expect(item.content!.length).toBeLessThan(1000);
    expect(item.content!.endsWith('\u2026')).toBe(true);
  });

  it('returns undefined summary when no abstract', () => {
    const item = toContentItem({ title: 'No abstract doc' });
    expect(item.content).toBeUndefined();
  });

  it('stores raw_text_url in metadata when present', () => {
    const item = toContentItem({
      title: 'Executive Order',
      type: 'Presidential Document',
      raw_text_url:
        'https://www.federalregister.gov/documents/full_text/text/2025/01/23/2025-01623.txt',
    });
    expect(item.metadata).toBeDefined();
    expect((item.metadata as Record<string, unknown>).raw_text_url).toBe(
      'https://www.federalregister.gov/documents/full_text/text/2025/01/23/2025-01623.txt',
    );
  });

  it('omits metadata when raw_text_url is absent', () => {
    const item = toContentItem({ title: 'Regular Rule', abstract: 'Some abstract' });
    expect(item.metadata).toBeUndefined();
  });
});

describe('signal URL regression', () => {
  const frSignals = CATEGORIES.flatMap((cat) =>
    cat.signals
      .filter((s) => s.type === 'federal_register')
      .map((s) => ({ categoryKey: cat.key, signal: s })),
  );

  it('all FR signal URLs parse without error', () => {
    for (const { signal } of frSignals) {
      expect(() => parseSignalParams(signal.url)).not.toThrow();
    }
  });

  it('no term-only FR signal lacks both agency and type params', () => {
    const unscoped: string[] = [];
    for (const { categoryKey, signal } of frSignals) {
      const params = parseSignalParams(signal.url);
      if (params.term && !params.agencies && !params.type) {
        unscoped.push(`${categoryKey}/${signal.id}`);
      }
    }
    // These signals are intentionally unscoped (cross-agency topics)
    const allowedUnscoped = new Set([
      'executiveOversight/fr_inspector_general',
      'executiveOversight/fr_oversight',
      'infoAvailability/fr_foia',
      'infoAvailability/fr_open_data',
      'mediaFreedom/fr_foia_regulations',
      'mediaFreedom/fr_foia_fees',
      'mediaFreedom/fr_press_credentials',
      'mediaFreedom/fr_press_freedom',
      'mediaFreedom/fr_shield_law',
      'mediaFreedom/fr_prepublication_review',
    ]);
    const unexpected = unscoped.filter((id) => !allowedUnscoped.has(id));
    expect(unexpected).toEqual([]);
  });
});
