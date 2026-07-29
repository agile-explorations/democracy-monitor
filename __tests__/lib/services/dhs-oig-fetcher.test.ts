import * as cheerio from 'cheerio';
import { describe, expect, it } from 'vitest';
import {
  dedupeByReportNumber,
  isImmigrationRelatedTitle,
  parseDhsOigParams,
  parseReportRow,
  toContentItem,
} from '@/lib/services/dhs-oig-fetcher';
import type { DhsOigReport } from '@/lib/services/dhs-oig-fetcher';

// Fixture mirrors the live oig.dhs.gov listing-table markup (captured 2026-07-28):
// direct PDF href in the title cell, time.datetime, report number and FY columns.
const SAMPLE_ROW_HTML = `
<table><tbody>
<tr>
  <td headers="view-field-report-number-table-column" class="views-field views-field-field-report-number">OIG-26-18          </td>
  <td headers="view-title-table-column" class="views-field views-field-title"><a href="/sites/default/files/assets/2026-07/OIG-26-18-Jul26.pdf" title=" View the ICE&#039;s Electronic Health Record System PDF">ICE&#039;s Electronic Health Record System Does Not Fully Address Capability Needs</a><span class="hidden"></span></td>
  <td headers="view-field-issue-date-table-column" class="views-field views-field-field-issue-date is-active views-align-center"><time datetime="2026-07-23T12:00:00Z" class="datetime">07/23/2026</time></td>
  <td headers="view-field-fy-table-column" class="views-field views-field-field-fy views-align-center">2026          </td>
</tr>
</tbody></table>`;

function loadRow(html: string) {
  const $ = cheerio.load(html);
  return $('tbody tr').first();
}

describe('parseDhsOigParams', () => {
  it('returns empty params for the bare signal URL', () => {
    expect(parseDhsOigParams('oig://dhs')).toEqual({});
  });

  it('parses the immigration components filter', () => {
    expect(parseDhsOigParams('oig://dhs?components=immigration')).toEqual({
      components: 'immigration',
    });
  });

  it('ignores unknown components values', () => {
    expect(parseDhsOigParams('oig://dhs?components=maritime')).toEqual({});
  });
});

describe('parseReportRow', () => {
  it('extracts all fields from a listing row', () => {
    const report = parseReportRow(loadRow(SAMPLE_ROW_HTML), 'Audit/Inspection');

    expect(report).not.toBeNull();
    expect(report!.title).toBe(
      "ICE's Electronic Health Record System Does Not Fully Address Capability Needs",
    );
    expect(report!.url).toBe(
      'https://www.oig.dhs.gov/sites/default/files/assets/2026-07/OIG-26-18-Jul26.pdf',
    );
    expect(report!.publishedAt).toBe('2026-07-23T12:00:00.000Z');
    expect(report!.reportType).toBe('Audit/Inspection');
    expect(report!.reportNumber).toBe('OIG-26-18');
  });

  it('returns null when the datetime attribute is missing', () => {
    const html = `<table><tbody><tr>
      <td class="views-field views-field-title"><a href="/sites/default/files/a.pdf">Report</a></td>
      <td class="views-field views-field-field-issue-date"><time class="datetime">07/23/2026</time></td>
    </tr></tbody></table>`;
    expect(parseReportRow(loadRow(html), 'Audit/Inspection')).toBeNull();
  });

  it('returns null when the title link is missing', () => {
    const html = `<table><tbody><tr>
      <td class="views-field views-field-title">No link</td>
      <td class="views-field views-field-field-issue-date"><time datetime="2026-01-01T00:00:00Z" class="datetime">01/01/2026</time></td>
    </tr></tbody></table>`;
    expect(parseReportRow(loadRow(html), 'Audit/Inspection')).toBeNull();
  });

  it('passes absolute URLs through unchanged', () => {
    const html = `<table><tbody><tr>
      <td class="views-field views-field-field-report-number">OIG-20-01</td>
      <td class="views-field views-field-title"><a href="https://example.com/report.pdf">External</a></td>
      <td class="views-field views-field-field-issue-date"><time datetime="2026-01-01T00:00:00Z" class="datetime">01/01/2026</time></td>
    </tr></tbody></table>`;
    const report = parseReportRow(loadRow(html), 'Management Alert');
    expect(report!.url).toBe('https://example.com/report.pdf');
  });

  it('tolerates a missing report-number cell', () => {
    const html = `<table><tbody><tr>
      <td class="views-field views-field-title"><a href="/sites/default/files/roi.pdf">Whistleblower ROI</a></td>
      <td class="views-field views-field-field-issue-date"><time datetime="2019-09-24T12:00:00Z" class="datetime">09/24/2019</time></td>
    </tr></tbody></table>`;
    const report = parseReportRow(loadRow(html), 'Whistleblower Retaliation Investigation');
    expect(report).not.toBeNull();
    expect(report!.reportNumber).toBe('');
  });
});

describe('isImmigrationRelatedTitle', () => {
  it.each([
    "ICE's Electronic Health Record System Does Not Fully Address Capability Needs",
    "CBP's Unauthorized Procurement of Prototype May Have Violated the Antideficiency Act",
    'USCIS Should Improve Case Processing',
    'Results of an Unannounced Inspection of a Detention Facility',
    'DHS Oversight of Border Security Technology',
    'Review of 287(g) Agreements with Local Law Enforcement',
    // 2019 rehearsal misses — component not named, subject unmistakable:
    'Management Alert - DHS Needs to Address Dangerous Overcrowding Among Single Adults at El Paso Del Norte Processing Center',
    'Issues Requiring Action at the Essex County Correctional Facility in Newark, New Jersey',
    'DHS Lacked Technology Needed to Successfully Account for Separated Migrant Families',
    'Capping Report: Observations of Unannounced Inspections of Ports of Entry',
    'Care of Unaccompanied Children in DHS Custody',
  ])('matches immigration-related title: %s', (title) => {
    expect(isImmigrationRelatedTitle(title)).toBe(true);
  });

  it.each([
    'FEMA Properly Processed Ice Storm Disaster Claims in Kentucky', // "Ice" ≠ ICE
    'The Secret Service Missed Opportunities to Prevent the Attempted Assassination',
    "TSA's Screening Technology Needs Improvement",
    'Evaluation of DHS Compliance with Federal Information Security Modernization Act Requirements',
  ])('does not match non-immigration title: %s', (title) => {
    expect(isImmigrationRelatedTitle(title)).toBe(false);
  });
});

describe('dedupeByReportNumber', () => {
  const report = (reportNumber: string, url: string) => ({
    title: 'T',
    url,
    publishedAt: '2019-05-30T12:00:00.000Z',
    reportType: 'Audit/Inspection',
    reportNumber,
  });

  it('collapses the same report number across listings, first listing wins', () => {
    const audits = report(
      'OIG-19-46',
      'https://www.oig.dhs.gov/sites/default/files/assets/2019-05/OIG-19-46-May19.pdf',
    );
    const alert = report(
      'oig-19-46',
      'https://www.oig.dhs.gov/sites/default/files/assets/Mga/2019/oig-19-46-may19-mgmtalert.pdf',
    );
    const result = dedupeByReportNumber([audits, alert]);
    expect(result).toEqual([audits]);
  });

  it('keeps distinct report numbers', () => {
    const a = report('OIG-19-46', 'https://example.com/a.pdf');
    const b = report('OIG-19-47', 'https://example.com/b.pdf');
    expect(dedupeByReportNumber([a, b])).toHaveLength(2);
  });

  it('falls back to URL identity when the report number is empty', () => {
    const a = report('', 'https://example.com/roi-1.pdf');
    const b = report('', 'https://example.com/roi-2.pdf');
    const aDup = report('', 'https://example.com/roi-1.pdf');
    expect(dedupeByReportNumber([a, b, aDup])).toHaveLength(2);
  });
});

describe('toContentItem', () => {
  it('converts a DhsOigReport to a ContentItem', () => {
    const report: DhsOigReport = {
      title: 'Test Audit Report',
      url: 'https://www.oig.dhs.gov/sites/default/files/assets/2026-01/OIG-26-01.pdf',
      publishedAt: '2026-01-15T12:00:00.000Z',
      reportType: 'Audit/Inspection',
      reportNumber: 'OIG-26-01',
    };

    const item = toContentItem(report);

    expect(item.title).toBe('Test Audit Report');
    expect(item.link).toBe(
      'https://www.oig.dhs.gov/sites/default/files/assets/2026-01/OIG-26-01.pdf',
    );
    expect(item.pubDate).toBe('2026-01-15T12:00:00.000Z');
    expect(item.agency).toBe('DHS Office of Inspector General');
    expect(item.content).toBe('Audit/Inspection — OIG-26-01');
    expect(item.type).toBe('ig_report');
    expect(item.sourceOrigin).toBe('oig');
  });
});
