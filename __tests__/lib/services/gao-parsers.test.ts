import { readFileSync } from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';
import {
  buildGaoBody,
  canonicalGaoProduct,
  GAO_MIN_BODY_CHARS,
  gaoProductType,
  parseGaoParams,
  parseGaoProductPage,
  toContentItem,
} from '@/lib/services/gao-parsers';

const fixture = (name: string) =>
  readFileSync(path.join(__dirname, '../../fixtures/gao', name), 'utf8');

describe('canonicalGaoProduct (#739)', () => {
  it('canonicalizes host/scheme/case/query variants to one form', () => {
    for (const url of [
      'https://www.gao.gov/products/gao-26-108719',
      'http://www.gao.gov/products/GAO-26-108719',
      'https://gao.gov/products/GAO-26-108719?utm_campaign=usgao_email&utm_medium=email',
      'https://www.gao.gov/products/gao-26-108719#main',
    ]) {
      expect(canonicalGaoProduct(url), url).toEqual({
        productId: 'gao-26-108719',
        canonicalUrl: 'https://www.gao.gov/products/gao-26-108719',
      });
    }
  });

  it('keeps testimony/product suffixes in the id', () => {
    expect(canonicalGaoProduct('https://www.gao.gov/products/GAO-25-107123T')?.productId).toBe(
      'gao-25-107123t',
    );
  });

  it('rejects decisions, non-product pages, and other hosts', () => {
    for (const url of [
      'https://www.gao.gov/products/b-336489',
      'https://www.gao.gov/reports-testimonies',
      'https://www.gao.gov/products/d02123',
      'https://example.com/products/gao-26-108719',
    ]) {
      expect(canonicalGaoProduct(url), url).toBeNull();
    }
  });
});

describe('parseGaoProductPage', () => {
  it('parses the current-generation template', () => {
    const parsed = parseGaoProductPage(fixture('product-2026.html'));
    expect(parsed.title).toBe('Federal Agency Workforce Changes: Update for January to June 2025');
    expect(parsed.releaseDate).toBe('2026-02-24');
    expect(parsed.fastFacts).toContain('reduce the federal workforce');
    expect(parsed.whatGaoFound).toContain('Since January 2025');
    expect(parsed.whyStudy).toBeTruthy();
  });

  it('parses the 2017-era template (different title format, same sections)', () => {
    const parsed = parseGaoProductPage(fixture('product-2017.html'));
    expect(parsed.title).toBe(
      'Counternarcotics: Overview of U.S. Efforts in the Western Hemisphere',
    );
    expect(parsed.releaseDate).toBe('2017-10-13');
    expect(parsed.whatGaoFound).toContain('National Drug Control Strategy');
    expect(parsed.whyStudy).toBeTruthy();
  });

  it('returns nulls for a page without Highlights sections', () => {
    const parsed = parseGaoProductPage('<html><title>Empty | U.S. GAO</title><body></body></html>');
    expect(parsed.title).toBe('Empty');
    expect(parsed.whatGaoFound).toBeNull();
    expect(parsed.fastFacts).toBeNull();
  });
});

describe('toContentItem', () => {
  const ref = {
    productId: 'gao-26-108719',
    canonicalUrl: 'https://www.gao.gov/products/gao-26-108719',
  };

  it('maps a parsed page to a storable full_text item with provenance', () => {
    const parsed = parseGaoProductPage(fixture('product-2026.html'));
    const item = toContentItem({
      ref,
      parsed,
      captureUrl:
        'https://web.archive.org/web/20260224163324id_/https://www.gao.gov/products/gao-26-108719',
      firstCaptureTs: '20260224163324',
    });
    expect(item.type).toBe('gao_report');
    expect(item.sourceOrigin).toBe('gao');
    expect(item.link).toBe(ref.canonicalUrl);
    expect(item.pubDate).toBe('2026-02-24');
    expect(item.contentType).toBe('full_text');
    expect(item.content).toContain('What GAO Found:');
    expect(item.metadata).toMatchObject({
      productId: 'gao-26-108719',
      productType: 'report',
      retrievedVia: 'wayback',
    });
  });

  it('falls back to the first-capture date and metadata_only under the floor', () => {
    const item = toContentItem({
      ref,
      parsed: {
        title: null,
        releaseDate: null,
        fastFacts: null,
        whatGaoFound: null,
        whyStudy: null,
      },
      captureUrl: 'https://web.archive.org/web/x',
      firstCaptureTs: '20250601120000',
    });
    expect(item.title).toBe('GAO-26-108719');
    expect(item.pubDate).toBe('2025-06-01');
    expect(item.contentType).toBe('metadata_only');
    expect((item.content ?? '').length).toBeLessThan(GAO_MIN_BODY_CHARS);
  });
});

describe('gaoProductType', () => {
  it('classifies by id suffix', () => {
    expect(gaoProductType('gao-26-108719')).toBe('report');
    expect(gaoProductType('gao-25-107123t')).toBe('testimony');
  });
});

describe('buildGaoBody / parseGaoParams', () => {
  it('assembles labeled sections in reading order', () => {
    const body = buildGaoBody({
      title: 't',
      releaseDate: null,
      fastFacts: 'ff',
      whatGaoFound: 'wgf',
      whyStudy: 'ws',
    });
    expect(body).toBe('Fast Facts: ff\n\nWhat GAO Found: wgf\n\nWhy GAO Did This Study: ws');
  });

  it('recognizes the products pseudo-URL', () => {
    expect(parseGaoParams('gao://products').products).toBe(true);
    expect(parseGaoParams('oig://dhs').products).toBe(false);
  });
});
