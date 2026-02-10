import * as cheerio from 'cheerio';
import { describe, it, expect } from 'vitest';
import type { TrackerConfig } from '@/lib/data/tracker-sources';
import { scrapeAndParse } from '@/lib/services/tracker-service';

const TEST_CONFIG: TrackerConfig = {
  url: 'https://example.com/tracker',
  selector: '.item',
  titleSelector: '.title',
  linkSelector: 'a',
  dateSelector: '.date',
};

function loadHtml(html: string) {
  return cheerio.load(html);
}

describe('scrapeAndParse', () => {
  it('extracts items matching selector', () => {
    const $ = loadHtml(`
      <div class="item">
        <span class="title">Executive Order on Immigration</span>
        <a href="https://example.com/eo1">Read more</a>
        <span class="date">2025-01-21</span>
      </div>
      <div class="item">
        <span class="title">Agency Restructuring Plan</span>
        <a href="https://example.com/plan">Read more</a>
        <span class="date">2025-01-22</span>
      </div>
    `);
    const result = scrapeAndParse($, TEST_CONFIG, 'test');
    expect(result.items).toHaveLength(2);
    expect(result.items[0].title).toBe('Executive Order on Immigration');
    expect(result.items[0].link).toBe('https://example.com/eo1');
    expect(result.items[0].date).toBe('2025-01-21');
    expect(result.items[1].title).toBe('Agency Restructuring Plan');
  });

  it('filters items with short titles (<=3 chars)', () => {
    const $ = loadHtml(`
      <div class="item">
        <span class="title">OK</span>
        <a href="/ok">Link</a>
      </div>
      <div class="item">
        <span class="title">---</span>
        <a href="/dash">Link</a>
      </div>
      <div class="item">
        <span class="title">Valid Title Here</span>
        <a href="/valid">Link</a>
      </div>
    `);
    const result = scrapeAndParse($, TEST_CONFIG, 'test');
    // "OK" (2 chars) and "---" (3 chars) are both <=3, should be filtered
    expect(result.items).toHaveLength(1);
    expect(result.items[0].title).toBe('Valid Title Here');
  });

  it('resolves relative links against config url', () => {
    const $ = loadHtml(`
      <div class="item">
        <span class="title">Some Policy Change</span>
        <a href="/relative/path">Read more</a>
      </div>
    `);
    const result = scrapeAndParse($, TEST_CONFIG, 'test');
    expect(result.items[0].link).toBe('https://example.com/relative/path');
  });

  it('uses config url when no link found', () => {
    const $ = loadHtml(`
      <div class="item">
        <span class="title">No Link Item</span>
      </div>
    `);
    const result = scrapeAndParse($, TEST_CONFIG, 'test');
    expect(result.items[0].link).toBe('https://example.com/tracker');
  });

  it('limits items to 15', () => {
    const items = Array.from(
      { length: 20 },
      (_, i) => `
      <div class="item">
        <span class="title">Item Number ${i + 1}</span>
        <a href="/item/${i}">Link</a>
      </div>
    `,
    ).join('');
    const $ = loadHtml(items);
    const result = scrapeAndParse($, TEST_CONFIG, 'test');
    expect(result.items).toHaveLength(15);
  });

  it('returns correct result shape', () => {
    const $ = loadHtml(`
      <div class="item">
        <span class="title">Test Item Title</span>
        <a href="https://example.com/test">Link</a>
      </div>
    `);
    const result = scrapeAndParse($, TEST_CONFIG, 'mySource');
    expect(result.type).toBe('tracker_scrape');
    expect(result.source).toBe('mySource');
    expect(result.sourceUrl).toBe('https://example.com/tracker');
    expect(result.scrapedAt).toBeDefined();
    expect(new Date(result.scrapedAt).getTime()).not.toBeNaN();
  });

  it('handles config without dateSelector', () => {
    const configNoDate: TrackerConfig = {
      url: 'https://example.com/tracker',
      selector: '.item',
      titleSelector: '.title',
      linkSelector: 'a',
    };
    const $ = loadHtml(`
      <div class="item">
        <span class="title">Item Without Date</span>
        <a href="/link">Link</a>
      </div>
    `);
    const result = scrapeAndParse($, configNoDate, 'test');
    expect(result.items[0].date).toBeUndefined();
  });

  it('returns empty items when no elements match selector', () => {
    const $ = loadHtml('<div class="other">Nothing here</div>');
    const result = scrapeAndParse($, TEST_CONFIG, 'test');
    expect(result.items).toEqual([]);
  });
});
