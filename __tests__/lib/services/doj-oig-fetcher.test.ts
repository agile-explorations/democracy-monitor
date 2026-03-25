import * as cheerio from 'cheerio';
import { describe, expect, it } from 'vitest';
import { parseDojOigParams, parseReportRow, toContentItem } from '@/lib/services/doj-oig-fetcher';
import type { DojOigReport } from '@/lib/services/doj-oig-fetcher';

const SAMPLE_ROW_HTML = `
<div class="views-row">
  <div class="views-field views-field-field-publication-date">
    <div class="field-content">
      <time datetime="2026-03-05T12:00:00Z" class="datetime">03/05/2026</time>
    </div>
  </div>
  <div class="views-field views-field-title">
    <span class="field-content">
      <a href="/reports/audit-federal-bureau-prisons" hreflang="en">Audit of the Federal Bureau of Prisons</a>
    </span>
  </div>
  <span><span>Type: </span><span>Audit</span></span> |
  <span class="views-field views-field-field-doj-component">
    <span class="views-label views-label-field-doj-component">Component(s): </span>
    <span class="field-content">Federal Bureau of Prisons</span>
  </span>
</div>`;

const INVESTIGATION_ROW_HTML = `
<div class="views-row">
  <div class="views-field views-field-field-publication-date">
    <div class="field-content">
      <time datetime="2025-11-15T12:00:00Z" class="datetime">11/15/2025</time>
    </div>
  </div>
  <div class="views-field views-field-title">
    <span class="field-content">
      <a href="/reports/investigation-misconduct-by-doj-employee" hreflang="en">Investigation of Misconduct by DOJ Employee</a>
    </span>
  </div>
  <span><span>Type: </span><span>Investigation</span></span> |
  <span class="views-field views-field-field-doj-component">
    <span class="views-label views-label-field-doj-component">Component(s): </span>
    <span class="field-content">Criminal Division, Other Component</span>
  </span>
</div>`;

describe('parseDojOigParams', () => {
  it('returns empty object for any signal URL', () => {
    expect(parseDojOigParams('oig://doj')).toEqual({});
  });
});

describe('parseReportRow', () => {
  it('extracts all fields from an audit report row', () => {
    const $ = cheerio.load(SAMPLE_ROW_HTML);
    const report = parseReportRow($('.views-row').first(), $);

    expect(report).not.toBeNull();
    expect(report!.title).toBe('Audit of the Federal Bureau of Prisons');
    expect(report!.url).toBe('https://oig.justice.gov/reports/audit-federal-bureau-prisons');
    expect(report!.publishedAt).toBe('2026-03-05T12:00:00.000Z');
    expect(report!.reportType).toBe('Audit');
    expect(report!.component).toBe('Federal Bureau of Prisons');
  });

  it('extracts investigation reports with multiple components', () => {
    const $ = cheerio.load(INVESTIGATION_ROW_HTML);
    const report = parseReportRow($('.views-row').first(), $);

    expect(report).not.toBeNull();
    expect(report!.reportType).toBe('Investigation');
    expect(report!.component).toBe('Criminal Division, Other Component');
  });

  it('returns null when datetime attribute is missing', () => {
    const html = `<div class="views-row">
      <div class="views-field views-field-field-publication-date">
        <div class="field-content"><time class="datetime">03/05/2026</time></div>
      </div>
      <div class="views-field views-field-title">
        <span class="field-content"><a href="/reports/test">Test</a></span>
      </div>
    </div>`;
    const $ = cheerio.load(html);
    expect(parseReportRow($('.views-row').first(), $)).toBeNull();
  });

  it('returns null when link is missing', () => {
    const html = `<div class="views-row">
      <div class="views-field views-field-field-publication-date">
        <div class="field-content"><time datetime="2026-01-01T00:00:00Z" class="datetime">01/01/2026</time></div>
      </div>
      <div class="views-field views-field-title">
        <span class="field-content">No link here</span>
      </div>
    </div>`;
    const $ = cheerio.load(html);
    expect(parseReportRow($('.views-row').first(), $)).toBeNull();
  });

  it('handles absolute URLs in href', () => {
    const html = `<div class="views-row">
      <div class="views-field views-field-field-publication-date">
        <div class="field-content"><time datetime="2026-01-01T00:00:00Z" class="datetime">01/01/2026</time></div>
      </div>
      <div class="views-field views-field-title">
        <span class="field-content"><a href="https://external.example.com/report">External Report</a></span>
      </div>
    </div>`;
    const $ = cheerio.load(html);
    const report = parseReportRow($('.views-row').first(), $);
    expect(report!.url).toBe('https://external.example.com/report');
  });
});

describe('toContentItem', () => {
  it('converts a DojOigReport to a ContentItem', () => {
    const report: DojOigReport = {
      title: 'Test Audit Report',
      url: 'https://oig.justice.gov/reports/test-audit',
      publishedAt: '2026-01-15T12:00:00.000Z',
      reportType: 'Audit',
      component: 'FBI',
    };

    const item = toContentItem(report);

    expect(item.title).toBe('Test Audit Report');
    expect(item.link).toBe('https://oig.justice.gov/reports/test-audit');
    expect(item.pubDate).toBe('2026-01-15T12:00:00.000Z');
    expect(item.agency).toBe('DOJ Office of the Inspector General');
    expect(item.content).toBe('Audit — FBI');
    expect(item.type).toBe('ig_report');
    expect(item.sourceOrigin).toBe('oig');
  });
});
