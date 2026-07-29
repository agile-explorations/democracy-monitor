import * as cheerio from 'cheerio';
import { describe, expect, it } from 'vitest';
import {
  isImmigrationContentItem,
  isImmigrationRelatedTitle,
  isImmigrationReport,
  mergeReportWalks,
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

function report(overrides: Partial<DhsOigReport>): DhsOigReport {
  return {
    title: 'T',
    url: 'https://www.oig.dhs.gov/sites/default/files/a.pdf',
    publishedAt: '2019-05-30T12:00:00.000Z',
    reportType: 'Audit/Inspection',
    reportNumber: 'OIG-19-01',
    components: [],
    ...overrides,
  };
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
    const parsed = parseReportRow(loadRow(SAMPLE_ROW_HTML), 'Audit/Inspection');

    expect(parsed).not.toBeNull();
    expect(parsed!.title).toBe(
      "ICE's Electronic Health Record System Does Not Fully Address Capability Needs",
    );
    expect(parsed!.url).toBe(
      'https://www.oig.dhs.gov/sites/default/files/assets/2026-07/OIG-26-18-Jul26.pdf',
    );
    expect(parsed!.publishedAt).toBe('2026-07-23T12:00:00.000Z');
    expect(parsed!.reportType).toBe('Audit/Inspection');
    expect(parsed!.reportNumber).toBe('OIG-26-18');
    expect(parsed!.components).toEqual([]);
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
    const parsed = parseReportRow(loadRow(html), 'Management Alert');
    expect(parsed!.url).toBe('https://example.com/report.pdf');
  });

  it('tolerates a missing report-number cell', () => {
    const html = `<table><tbody><tr>
      <td class="views-field views-field-title"><a href="/sites/default/files/roi.pdf">Whistleblower ROI</a></td>
      <td class="views-field views-field-field-issue-date"><time datetime="2019-09-24T12:00:00Z" class="datetime">09/24/2019</time></td>
    </tr></tbody></table>`;
    const parsed = parseReportRow(loadRow(html), 'Whistleblower Retaliation Investigation');
    expect(parsed).not.toBeNull();
    expect(parsed!.reportNumber).toBe('');
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
    'Results of an Unannounced Inspection of Winn Correctional Center in Winnfield, Louisiana',
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

describe('isImmigrationReport (union routing rule)', () => {
  it('routes by official component tag even when the title never names one', () => {
    const winn = report({
      title: 'Results of an Unannounced Inspection of a County Jail in Springfield',
      components: ['ICE'],
    });
    expect(isImmigrationReport(winn)).toBe(true);
  });

  it('routes cross-component immigration subjects by title when tags miss', () => {
    const migrants = report({
      title: 'DHS Does Not Have Assurance That All Migrants Can be Located Once Released',
      components: ['MGMT'],
    });
    expect(isImmigrationReport(migrants)).toBe(true);
  });

  it('does not route reports with neither tag nor subject match', () => {
    const fema = report({
      title: 'FEMA Did Not Properly Review a Public Assistance Grant Request',
      components: ['FEMA'],
    });
    expect(isImmigrationReport(fema)).toBe(false);
  });
});

describe('mergeReportWalks', () => {
  it('unions component tags for the same report across walks', () => {
    const base = report({ reportNumber: 'OIG-19-46' });
    const merged = mergeReportWalks([
      { component: null, reports: [base] },
      { component: 'ICE', reports: [report({ reportNumber: 'OIG-19-46' })] },
      { component: 'CBP', reports: [report({ reportNumber: 'oig-19-46' })] },
    ]);
    expect(merged).toHaveLength(1);
    expect(merged[0].components).toEqual(['ICE', 'CBP']);
  });

  it('collapses cross-listed reports with different PDF paths, first occurrence wins', () => {
    const audits = report({
      reportNumber: 'OIG-19-46',
      url: 'https://www.oig.dhs.gov/sites/default/files/assets/2019-05/OIG-19-46-May19.pdf',
    });
    const alert = report({
      reportNumber: 'OIG-19-46',
      url: 'https://www.oig.dhs.gov/sites/default/files/assets/Mga/2019/oig-19-46-may19-mgmtalert.pdf',
      reportType: 'Management Alert',
    });
    const merged = mergeReportWalks([
      { component: null, reports: [audits] },
      { component: null, reports: [alert] },
    ]);
    expect(merged).toHaveLength(1);
    expect(merged[0].url).toBe(audits.url);
  });

  it('keeps reports found only in a filtered view (unfiltered coverage hole)', () => {
    const holeReport = report({ reportNumber: 'OIG-20-80', title: 'Joint Task Forces' });
    const merged = mergeReportWalks([
      { component: null, reports: [report({ reportNumber: 'OIG-20-79' })] },
      { component: 'ICE', reports: [holeReport] },
    ]);
    expect(merged).toHaveLength(2);
    expect(merged.find((r) => r.reportNumber === 'OIG-20-80')!.components).toEqual(['ICE']);
  });

  it('falls back to URL identity when the report number is empty', () => {
    const a = report({ reportNumber: '', url: 'https://example.com/roi-1.pdf' });
    const b = report({ reportNumber: '', url: 'https://example.com/roi-2.pdf' });
    const aDup = report({ reportNumber: '', url: 'https://example.com/roi-1.pdf' });
    const merged = mergeReportWalks([{ component: null, reports: [a, b, aDup] }]);
    expect(merged).toHaveLength(2);
  });
});

describe('toContentItem', () => {
  it('converts a DhsOigReport to a ContentItem with component metadata', () => {
    const item = toContentItem(
      report({
        title: 'Test Audit Report',
        url: 'https://www.oig.dhs.gov/sites/default/files/assets/2026-01/OIG-26-01.pdf',
        publishedAt: '2026-01-15T12:00:00.000Z',
        reportNumber: 'OIG-26-01',
        components: ['ICE', 'MGMT'],
      }),
    );

    expect(item.title).toBe('Test Audit Report');
    expect(item.link).toBe(
      'https://www.oig.dhs.gov/sites/default/files/assets/2026-01/OIG-26-01.pdf',
    );
    expect(item.pubDate).toBe('2026-01-15T12:00:00.000Z');
    expect(item.agency).toBe('DHS Office of Inspector General');
    expect(item.content).toBe('Audit/Inspection — OIG-26-01');
    expect(item.type).toBe('ig_report');
    expect(item.sourceOrigin).toBe('oig');
    expect(item.metadata).toEqual({ dhsComponents: ['ICE', 'MGMT'] });
  });
});

describe('isImmigrationContentItem', () => {
  it('reads component tags from item metadata', () => {
    const item = toContentItem(report({ title: 'Generic Facility Report', components: ['ICE'] }));
    expect(isImmigrationContentItem(item)).toBe(true);
  });

  it('falls back to the title rule when metadata has no immigration tag', () => {
    const item = toContentItem(report({ title: 'Border Technology Review', components: ['MGMT'] }));
    expect(isImmigrationContentItem(item)).toBe(true);
  });

  it('rejects items with neither signal', () => {
    const item = toContentItem(report({ title: 'FEMA Grant Audit', components: ['FEMA'] }));
    expect(isImmigrationContentItem(item)).toBe(false);
  });
});
