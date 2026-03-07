import { describe, expect, it } from 'vitest';
import {
  parseSsaDate,
  parseSsaOigParams,
  parseReportsFromHtml,
  toContentItem,
} from '@/lib/services/ssa-oig-fetcher';
import type { SsaOigReport } from '@/lib/services/ssa-oig-fetcher';

const SAMPLE_PAGE_HTML = `
<html><body>
<div class="grid-row">
  <div class="desktop:grid-col-8">
    <h1 class="margin-y-2">Published Reports from the Office of Audit</h1>
    <div>
      March 05, 2026
    </div>
    <div class="padding-bottom-5 margin-top-4 border-bottom-1px border-gray-10">
      <h3 class="margin-bottom-1">
        <a class="usa-link text-no-underline"
           href="https://oig.ssa.gov/assets/uploads/002612.pdf">
          OIG Audit Recommendations Not Implemented as of January 2026
        </a>
      </h3>
      <div class="margin-bottom-1 text-italic">
        Number: 002612
      </div>
    </div>
    <div>
      February 19, 2026
    </div>
    <div class="padding-bottom-5 margin-top-4 border-bottom-1px border-gray-10">
      <h3 class="margin-bottom-1">
        <a class="usa-link text-no-underline"
           href="/assets/uploads/032509.pdf">
          SSA Federal Rulemaking Process
        </a>
      </h3>
      <div class="margin-bottom-1 text-italic">
        Number: 032509
      </div>
    </div>
    <div>
      February 10, 2026
    </div>
    <div class="padding-bottom-5 margin-top-4 border-bottom-1px border-gray-10">
      <h3 class="margin-bottom-1">
        <a class="usa-link text-no-underline"
           href="/assets/uploads/772609.pdf">
          Single Audit of Oklahoma FY 2023
        </a>
      </h3>
      <div class="margin-bottom-1 text-italic">
        Number: 772609
      </div>
    </div>
  </div>
</div>
</body></html>`;

describe('parseSsaOigParams', () => {
  it('returns empty object for any signal URL', () => {
    expect(parseSsaOigParams('oig://ssa')).toEqual({});
  });
});

describe('parseSsaDate', () => {
  it('parses standard date format', () => {
    expect(parseSsaDate('March 05, 2026')).toBe('2026-03-05T12:00:00Z');
  });

  it('parses all months', () => {
    expect(parseSsaDate('January 01, 2025')).toBe('2025-01-01T12:00:00Z');
    expect(parseSsaDate('December 31, 2024')).toBe('2024-12-31T12:00:00Z');
    expect(parseSsaDate('June 15, 2020')).toBe('2020-06-15T12:00:00Z');
  });

  it('returns null for invalid format', () => {
    expect(parseSsaDate('03/05/2026')).toBeNull();
    expect(parseSsaDate('2026-03-05')).toBeNull();
    expect(parseSsaDate('')).toBeNull();
  });

  it('returns null for invalid month', () => {
    expect(parseSsaDate('Smarch 05, 2026')).toBeNull();
  });
});

describe('parseReportsFromHtml', () => {
  it('extracts all reports from sample HTML', () => {
    const reports = parseReportsFromHtml(SAMPLE_PAGE_HTML);

    expect(reports).toHaveLength(3);
  });

  it('extracts correct fields for first report', () => {
    const reports = parseReportsFromHtml(SAMPLE_PAGE_HTML);
    const first = reports[0];

    expect(first.title).toBe('OIG Audit Recommendations Not Implemented as of January 2026');
    expect(first.url).toBe('https://oig.ssa.gov/assets/uploads/002612.pdf');
    expect(first.publishedAt).toBe('2026-03-05T12:00:00Z');
    expect(first.reportNumber).toBe('002612');
  });

  it('handles relative URLs by prepending base URL', () => {
    const reports = parseReportsFromHtml(SAMPLE_PAGE_HTML);
    const second = reports[1];

    expect(second.url).toBe('https://oig.ssa.gov/assets/uploads/032509.pdf');
  });

  it('preserves absolute URLs', () => {
    const reports = parseReportsFromHtml(SAMPLE_PAGE_HTML);
    const first = reports[0];

    expect(first.url).toBe('https://oig.ssa.gov/assets/uploads/002612.pdf');
  });

  it('assigns correct dates to each report', () => {
    const reports = parseReportsFromHtml(SAMPLE_PAGE_HTML);

    expect(reports[0].publishedAt).toBe('2026-03-05T12:00:00Z');
    expect(reports[1].publishedAt).toBe('2026-02-19T12:00:00Z');
    expect(reports[2].publishedAt).toBe('2026-02-10T12:00:00Z');
  });

  it('returns empty array for HTML with no reports', () => {
    const html =
      '<html><body><div class="desktop:grid-col-8"><h1>No reports</h1></div></body></html>';
    expect(parseReportsFromHtml(html)).toHaveLength(0);
  });

  it('returns empty array when content area is missing', () => {
    const html = '<html><body><div>Wrong structure</div></body></html>';
    expect(parseReportsFromHtml(html)).toHaveLength(0);
  });
});

describe('toContentItem', () => {
  it('converts an SsaOigReport to a ContentItem', () => {
    const report: SsaOigReport = {
      title: 'Test Audit',
      url: 'https://oig.ssa.gov/assets/uploads/123456.pdf',
      publishedAt: '2026-01-15T12:00:00Z',
      reportNumber: '123456',
    };

    const item = toContentItem(report);

    expect(item.title).toBe('Test Audit');
    expect(item.link).toBe('https://oig.ssa.gov/assets/uploads/123456.pdf');
    expect(item.pubDate).toBe('2026-01-15T12:00:00Z');
    expect(item.agency).toBe('SSA Office of the Inspector General');
    expect(item.summary).toBe('Report 123456');
    expect(item.type).toBe('ig_report');
    expect(item.sourceOrigin).toBe('oig');
  });
});
