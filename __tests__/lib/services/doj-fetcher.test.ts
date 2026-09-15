import { describe, expect, it } from 'vitest';
import {
  matchesComponentSlug,
  parseDojSignalParams,
  partitionReleases,
  toContentItem,
} from '@/lib/services/doj-fetcher';

describe('partitionReleases (#892 corpus-only DOJ releases)', () => {
  const inRange = String(Math.floor(new Date('2026-03-04T12:00:00Z').getTime() / 1000));
  const outOfRange = String(Math.floor(new Date('2026-02-01T12:00:00Z').getTime() / 1000));
  const window = { fromDate: new Date('2026-03-02'), toDate: new Date('2026-03-08') };
  const release = (title: string, component: string, date = inRange) => ({
    title,
    url: `/opa/pr/${title.toLowerCase().replace(/\s+/g, '-')}`,
    date,
    component: [{ uuid: 'u', name: component }],
  });

  it('routes releases matching the signal component and sets aside corpus-component rejects', () => {
    const { items, excludedItems } = partitionReleases(
      [
        release('Indictment unsealed', 'Criminal Division'),
        release('AG statement', 'Office of the Attorney General'),
        release('Local case', 'U.S. Attorney - District of Nowhere'),
      ],
      { component: 'criminal-division', ...window },
    );

    expect(items.map((i) => i.title)).toEqual(['Indictment unsealed']);
    expect(excludedItems.map((i) => i.title)).toEqual(['AG statement']);
  });

  it('applies the date window to both buckets', () => {
    const { items, excludedItems } = partitionReleases(
      [
        release('Old indictment', 'Criminal Division', outOfRange),
        release('Old AG statement', 'Office of the Attorney General', outOfRange),
      ],
      { component: 'criminal-division', ...window },
    );

    expect(items).toEqual([]);
    expect(excludedItems).toEqual([]);
  });

  it('routes everything when the signal has no component filter', () => {
    const { items, excludedItems } = partitionReleases(
      [release('AG statement', 'Office of the Attorney General')],
      { ...window },
    );

    expect(items).toHaveLength(1);
    expect(excludedItems).toEqual([]);
  });
});

describe('parseDojSignalParams', () => {
  it('extracts component from URL', () => {
    const result = parseDojSignalParams('doj://press?component=criminal-division');
    expect(result.component).toBe('criminal-division');
  });

  it('extracts topic from URL', () => {
    const result = parseDojSignalParams('doj://press?topic=civil+rights');
    expect(result.topic).toBe('civil rights');
  });

  it('extracts both component and topic', () => {
    const result = parseDojSignalParams(
      'doj://press?component=civil-rights-division&topic=housing',
    );
    expect(result.component).toBe('civil-rights-division');
    expect(result.topic).toBe('housing');
  });

  it('returns undefined for missing params', () => {
    const result = parseDojSignalParams('doj://press');
    expect(result.component).toBeUndefined();
    expect(result.topic).toBeUndefined();
  });
});

describe('toContentItem', () => {
  it('maps DOJ API fields correctly', () => {
    const item = toContentItem({
      uuid: 'abc-123',
      title: 'DOJ Announces Settlement',
      body: '<p>The Department of Justice today announced...</p>',
      teaser: 'The Department of Justice today announced a major settlement.',
      date: '1751328000',
      component: [{ uuid: 'comp-1', name: 'Civil Division' }],
      url: '/opa/pr/settlement-announced',
    });

    expect(item.title).toBe('DOJ Announces Settlement');
    expect(item.link).toBe('https://www.justice.gov/opa/pr/settlement-announced');
    expect(item.pubDate).toBe(new Date(1751328000 * 1000).toISOString());
    expect(item.agency).toBe('Civil Division');
    expect(item.content).toContain('Department of Justice today announced');
    expect(item.type).toBe('press_release');
    expect(item.sourceOrigin).toBe('doj');
  });

  it('converts Unix timestamp to ISO date string', () => {
    // 1231156800 = 2009-01-05T12:00:00.000Z
    const item = toContentItem({ date: '1231156800' });
    expect(item.pubDate).toBe(new Date(1231156800 * 1000).toISOString());
  });

  it('prefers body over teaser for summary', () => {
    const item = toContentItem({
      teaser: '<p>Short teaser text</p>',
      body: '<p>Much longer body text with more detail</p>',
    });
    expect(item.content).toBe('Much longer body text with more detail');
  });

  it('falls back to teaser when body is absent', () => {
    const item = toContentItem({
      teaser: '<p>Teaser text as fallback</p>',
    });
    expect(item.content).toBe('Teaser text as fallback');
  });

  it('extracts agency from first component name', () => {
    const item = toContentItem({
      component: [
        { uuid: 'c1', name: 'Criminal Division' },
        { uuid: 'c2', name: 'Office of Public Affairs' },
      ],
    });
    expect(item.agency).toBe('Criminal Division');
  });

  it('strips HTML tags from title', () => {
    const item = toContentItem({ title: 'Line One<br />Line Two' });
    expect(item.title).toBe('Line One Line Two');
  });

  it('prepends justice.gov for relative URLs', () => {
    const item = toContentItem({ url: '/opa/pr/test' });
    expect(item.link).toBe('https://www.justice.gov/opa/pr/test');
  });

  it('preserves absolute URLs', () => {
    const item = toContentItem({ url: 'https://www.justice.gov/full-url' });
    expect(item.link).toBe('https://www.justice.gov/full-url');
  });

  it('handles missing fields gracefully', () => {
    const item = toContentItem({});
    expect(item.title).toBe('(untitled release)');
    expect(item.link).toBeUndefined();
    expect(item.pubDate).toBeUndefined();
    expect(item.agency).toBe('Department of Justice');
    expect(item.type).toBe('press_release');
    expect(item.sourceOrigin).toBe('doj');
  });

  it('stores full body text without truncation', () => {
    const longBody = '<p>' + 'X'.repeat(10000) + '</p>';
    const item = toContentItem({ body: longBody });
    expect(item.content!.length).toBe(10000);
  });

  it('strips HTML tags from body', () => {
    const item = toContentItem({ body: '<p>Hello <strong>world</strong></p>' });
    expect(item.content).toBe('Hello world');
  });
});

describe('matchesComponentSlug', () => {
  it('matches when component name contains slug pattern', () => {
    const components = [{ uuid: 'c1', name: 'Criminal Division' }];
    expect(matchesComponentSlug(components, 'criminal-division')).toBe(true);
  });

  it('matches case-insensitively', () => {
    const components = [{ uuid: 'c1', name: 'CIVIL RIGHTS DIVISION' }];
    expect(matchesComponentSlug(components, 'civil-rights-division')).toBe(true);
  });

  it('matches any component in the array', () => {
    const components = [
      { uuid: 'c1', name: 'Office of Public Affairs' },
      { uuid: 'c2', name: 'Criminal Division' },
    ];
    expect(matchesComponentSlug(components, 'criminal-division')).toBe(true);
  });

  it('returns false when no components match', () => {
    const components = [{ uuid: 'c1', name: 'Civil Division' }];
    expect(matchesComponentSlug(components, 'criminal-division')).toBe(false);
  });

  it('returns true when slug is undefined (no filter)', () => {
    const components = [{ uuid: 'c1', name: 'Civil Division' }];
    expect(matchesComponentSlug(components, undefined)).toBe(true);
  });

  it('returns true when slug is undefined and components are empty', () => {
    expect(matchesComponentSlug([], undefined)).toBe(true);
    expect(matchesComponentSlug(undefined, undefined)).toBe(true);
  });

  it('returns false when components are empty but slug is set', () => {
    expect(matchesComponentSlug([], 'criminal-division')).toBe(false);
  });

  it('returns false when components are undefined but slug is set', () => {
    expect(matchesComponentSlug(undefined, 'criminal-division')).toBe(false);
  });
});
