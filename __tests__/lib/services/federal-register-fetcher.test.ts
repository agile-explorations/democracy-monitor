import { describe, it, expect } from 'vitest';
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

  it('includes agency when provided', () => {
    const url = buildFrApiUrl({ agency: 'epa' }, 1, '2025-01-01', '2025-01-31', 20);
    expect(url).toContain('conditions%5Bagencies%5D%5B%5D=epa');
  });

  it('includes type when provided', () => {
    const url = buildFrApiUrl({ type: 'PRESDOCU' }, 1, '2025-01-01', '2025-01-31', 20);
    expect(url).toContain('conditions%5Btype%5D%5B%5D=PRESDOCU');
  });

  it('includes term when provided', () => {
    const url = buildFrApiUrl({ term: '"schedule f"' }, 1, '2025-01-01', '2025-01-31', 20);
    expect(url).toContain('conditions%5Bterm%5D=%22schedule+f%22');
  });

  it('omits agency/type/term when not provided', () => {
    const url = buildFrApiUrl({}, 1, '2025-01-01', '2025-01-31', 20);
    expect(url).not.toContain('agencies');
    expect(url).not.toContain('conditions%5Btype%5D');
    expect(url).not.toContain('conditions%5Bterm%5D');
  });

  it('uses provided page number', () => {
    const url = buildFrApiUrl({}, 5, '2025-01-01', '2025-01-31', 20);
    expect(url).toContain('page=5');
  });
});

describe('parseSignalParams', () => {
  it('extracts agency from signal URL', () => {
    const params = parseSignalParams('/api/federal-register?agency=personnel-management-office');
    expect(params.agency).toBe('personnel-management-office');
    expect(params.type).toBeUndefined();
    expect(params.term).toBeUndefined();
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
    expect(params.agency).toBeUndefined();
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
    expect(item.summary).toBe('A test abstract.');
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
    expect(item.summary!.length).toBeLessThan(1000);
    expect(item.summary!.endsWith('\u2026')).toBe(true);
  });

  it('returns undefined summary when no abstract', () => {
    const item = toContentItem({ title: 'No abstract doc' });
    expect(item.summary).toBeUndefined();
  });
});
