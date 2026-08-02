import * as cheerio from 'cheerio';
import { describe, expect, it } from 'vitest';
import {
  OVERSIGHT_OIGS,
  buildListingUrl,
  parseDetailPage,
  parseListingRow,
  parseOversightGovParams,
  parseResultCount,
  toContentItem,
} from '@/lib/services/oversight-gov-fetcher';
import type { OversightGovReport } from '@/lib/services/oversight-gov-fetcher';

// Fixtures mirror the live oversight.gov /reports/federal markup (captured
// 2026-08-01): listing-table data row with plain-text title cell and the
// detail link in the trailing action cell; accordion highlight rows interleave.
const SAMPLE_ROW_HTML = `
<table><tbody>
<tr class="listing-table__row table-row">
  <td headers="view-field-report-date-issued-table-column" class="views-field views-field-field-report-date-issued" data-label="Report Date"><time datetime="2026-07-30T12:00:00Z">07/30/2026</time> </td>
  <td headers="view-field-report-agency-reviewed-table-column" class="views-field views-field-field-report-agency-reviewed" data-label="Agency Reviewed / Investigated">Office of Personnel Management </td>
  <td headers="view-title-table-column" class="views-field views-field-title" data-label="Report Title">Investigative Activities Quarterly Case Summary FY 2026 Q3 </td>
  <td headers="view-field-report-type-table-column" class="views-field views-field-field-report-type" data-label="Type">Other </td>
  <td headers="view-field-report-location-table-column" class="views-field views-field-field-report-location" data-label="Location">Agency-Wide </td>
  <td headers="view-url-table-column" class="action-cell" data-label="action-cell-report-link" rowspan="2"><a href="/reports/other/investigative-activities-quarterly-case-summary-fy-2026-q3" hreflang="en">View Report<span class="fa-solid fa-arrow-right"></span></a> </td>
</tr>
<tr class="listing-table__accordion-toggle">
  <td data-label="View Report Highlights" colspan="5"><button class="listing-table__accordion-button">View Report Highlights</button></td>
</tr>
</tbody></table>`;

// Detail-page fixture mirrors the Drupal field blocks (captured 2026-08-01).
const SAMPLE_DETAIL_HTML = `
<div class="field field--name-field-report-file field--type-entity-reference field--label-visually_hidden">
  <div class="field__item"><div>
    <div class="field field--name-field-media-document field--type-file field--label-hidden field__item"><a class="pdf-icon report-download-button usa-button" href="/sites/default/files/documents/reports/2026-06/2025-OEI-001.pdf" target="_blank">View Report</a></div>
  </div></div>
</div>
<div class="field field--name-field-report-date-issued field--type-datetime field--label-above">
  <div class="title">Date Issued</div>
  <div class="field__item"><time datetime="2026-06-23T12:00:00Z">Tuesday, June 23, 2026</time></div>
</div>
<div class="field field--name-field-report-submitting-oig field--type-entity-reference field--label-above">
  <div class="title">Submitting OIG</div>
  <div class="field__item">Office of Personnel Management OIG</div>
</div>
<div class="field field--name-field-report-agency-reviewed field--type-entity-reference field--label-above">
  <div class="title">Agencies Reviewed/Investigated</div>
  <div class="field field--name-field-report-agency-reviewed field--type-entity-reference field--label-above field__items">
    <div class="field__item">Office of Personnel Management</div>
  </div>
</div>
<div class="field field--name-field-report-number field--type-string field--label-above">
  <div class="title">Report Number</div>
  <div class="field__item">2025-OEI-001</div>
</div>
<div class="field field--name-field-report-type field--type-entity-reference field--label-above">
  <div class="title">Report Type</div>
  <div class="field__item">Inspection / Evaluation</div>
</div>
<div class="field field--name-field-report-number-of-recs field--type-integer field--label-above">
  <div class="title">Number of Recommendations</div>
  <div class="field__item">12</div>
</div>`;

// State-OIG-style detail fixture (captured 2026-08-01): no hosted PDF, only an
// "External Link" field to the OIG's own (403-walled) site.
const STATE_DETAIL_HTML = `
<div class="field field--name-field-report-submitting-oig field--type-entity-reference field--label-above">
  <div class="title">Submitting OIG</div>
  <div class="field__item">Department of State OIG</div>
</div>
<div class="field field--name-field-report-number field--type-string field--label-above">
  <div class="title">Report Number</div>
  <div class="field__item">ISP-I-26-12</div>
</div>
<div class="field field--name-field-report-link field--type-link field--label-above">
  <div class="title">External Link</div>
  <div class="field__item"><a href="https://www.stateoig.gov/report/isp-i-26-12">https://www.stateoig.gov/report/isp-i-26-12</a></div>
</div>`;

function loadRow(html: string) {
  const $ = cheerio.load(html);
  return $('tr.listing-table__row').first();
}

function report(overrides: Partial<OversightGovReport>): OversightGovReport {
  return {
    title: 'T',
    url: 'https://www.oversight.gov/reports/audit/example',
    publishedAt: '2026-06-23T12:00:00.000Z',
    reportType: 'Audit',
    agencyReviewed: 'Office of Personnel Management',
    ...overrides,
  };
}

describe('OVERSIGHT_OIGS', () => {
  it('contains exactly the seven approved facet term IDs', () => {
    expect(
      Object.keys(OVERSIGHT_OIGS)
        .map(Number)
        .sort((a, b) => a - b),
    ).toEqual([223, 225, 229, 236, 283, 284, 313]);
  });

  it('never contains an OIG that has a direct fetcher (DOJ/HHS/SSA/DHS)', () => {
    const names = Object.values(OVERSIGHT_OIGS)
      .map((o) => o.name.toLowerCase())
      .join(' ');
    for (const direct of ['justice', 'health and human', 'social security', 'homeland']) {
      expect(names).not.toContain(direct);
    }
  });
});

describe('parseOversightGovParams', () => {
  it('parses a single OIG id', () => {
    expect(parseOversightGovParams('oig://oversight?oigs=283')).toEqual({ oigs: [283] });
  });

  it('parses a CSV OIG list', () => {
    expect(parseOversightGovParams('oig://oversight?oigs=225,313')).toEqual({ oigs: [225, 313] });
  });

  it('throws on an unknown OIG id', () => {
    expect(() => parseOversightGovParams('oig://oversight?oigs=999')).toThrow(/Unknown/);
  });

  it('throws when the oigs param is missing', () => {
    expect(() => parseOversightGovParams('oig://oversight')).toThrow(/Missing oigs/);
  });
});

describe('buildListingUrl', () => {
  it('sets date-range params and repeats the facet param per OIG', () => {
    const url = buildListingUrl({
      oigs: [225, 313],
      dateFrom: '2025-01-20',
      dateTo: '2026-08-01',
    });
    expect(url).toContain('field_report_date_issued%5Bmin%5D=2025-01-20');
    expect(url).toContain('field_report_date_issued%5Bmax%5D=2026-08-01');
    expect(url).toContain('field_report_submitting_oig%5B%5D=225');
    expect(url).toContain('field_report_submitting_oig%5B%5D=313');
    expect(url).not.toContain('page=');
  });

  it('adds the page param only beyond page 0', () => {
    const opts = { oigs: [283], dateFrom: '2025-01-20', dateTo: '2026-08-01' };
    expect(buildListingUrl({ ...opts, page: 0 })).not.toContain('page=');
    expect(buildListingUrl({ ...opts, page: 3 })).toContain('page=3');
  });
});

describe('parseResultCount', () => {
  it('extracts the total from the view footer', () => {
    expect(parseResultCount('<div class="view-footer"> Displaying 1 - 10 of 38 </div>')).toBe(38);
  });

  it('handles thousands separators', () => {
    expect(parseResultCount('Displaying 1 - 10 of 1,262')).toBe(1262);
  });

  it('returns null when the footer is absent', () => {
    expect(parseResultCount('<div>no results footer</div>')).toBeNull();
  });
});

describe('parseListingRow', () => {
  it('extracts all fields from a listing data row', () => {
    const parsed = parseListingRow(loadRow(SAMPLE_ROW_HTML));

    expect(parsed).not.toBeNull();
    expect(parsed!.title).toBe('Investigative Activities Quarterly Case Summary FY 2026 Q3');
    expect(parsed!.url).toBe(
      'https://www.oversight.gov/reports/other/investigative-activities-quarterly-case-summary-fy-2026-q3',
    );
    expect(parsed!.publishedAt).toBe('2026-07-30T12:00:00.000Z');
    expect(parsed!.reportType).toBe('Other');
    expect(parsed!.agencyReviewed).toBe('Office of Personnel Management');
  });

  it('returns null when the datetime attribute is missing', () => {
    const html = `<table><tbody><tr class="listing-table__row">
      <td class="views-field views-field-field-report-date-issued"><time>07/30/2026</time></td>
      <td class="views-field views-field-title">Report</td>
      <td class="action-cell"><a href="/reports/audit/x">View Report</a></td>
    </tr></tbody></table>`;
    expect(parseListingRow(loadRow(html))).toBeNull();
  });

  it('returns null when the action-cell link is missing', () => {
    const html = `<table><tbody><tr class="listing-table__row">
      <td class="views-field views-field-field-report-date-issued"><time datetime="2026-07-30T12:00:00Z">07/30/2026</time></td>
      <td class="views-field views-field-title">Report</td>
    </tr></tbody></table>`;
    expect(parseListingRow(loadRow(html))).toBeNull();
  });

  it('passes through absolute detail URLs', () => {
    const html = SAMPLE_ROW_HTML.replace(
      'href="/reports/other/investigative-activities-quarterly-case-summary-fy-2026-q3"',
      'href="https://www.oversight.gov/reports/other/absolute"',
    );
    expect(parseListingRow(loadRow(html))!.url).toBe(
      'https://www.oversight.gov/reports/other/absolute',
    );
  });
});

describe('parseDetailPage', () => {
  it('extracts all metadata fields and the PDF URL', () => {
    const detail = parseDetailPage(SAMPLE_DETAIL_HTML);

    expect(detail.reportNumber).toBe('2025-OEI-001');
    expect(detail.reportType).toBe('Inspection / Evaluation');
    expect(detail.submittingOig).toBe('Office of Personnel Management OIG');
    expect(detail.agencyReviewed).toBe('Office of Personnel Management');
    expect(detail.dateIssued).toBe('2026-06-23T12:00:00.000Z');
    expect(detail.numRecs).toBe(12);
    expect(detail.pdfUrl).toBe(
      'https://www.oversight.gov/sites/default/files/documents/reports/2026-06/2025-OEI-001.pdf',
    );
  });

  it('returns null pdfUrl when no download link exists', () => {
    const html = SAMPLE_DETAIL_HTML.replace(/<a class="pdf-icon[^>]*>View Report<\/a>/, '');
    expect(parseDetailPage(html).pdfUrl).toBeNull();
  });

  it('extracts the External Link and null pdfUrl from a State-style page', () => {
    const detail = parseDetailPage(STATE_DETAIL_HTML);
    expect(detail.pdfUrl).toBeNull();
    expect(detail.externalUrl).toBe('https://www.stateoig.gov/report/isp-i-26-12');
    expect(detail.submittingOig).toBe('Department of State OIG');
    expect(detail.reportNumber).toBe('ISP-I-26-12');
  });

  it('returns empty strings and nulls for absent fields', () => {
    const detail = parseDetailPage('<div>bare page</div>');
    expect(detail.reportNumber).toBe('');
    expect(detail.submittingOig).toBe('');
    expect(detail.numRecs).toBeNull();
    expect(detail.dateIssued).toBeNull();
    expect(detail.pdfUrl).toBeNull();
    expect(detail.externalUrl).toBeNull();
  });
});

describe('toContentItem', () => {
  it('maps an enriched report to a ContentItem with full metadata', () => {
    const item = toContentItem(
      report({
        submittingOig: 'Office of Personnel Management OIG',
        reportNumber: '2025-OEI-001',
        numRecs: 12,
        pdfUrl: 'https://www.oversight.gov/sites/default/files/documents/reports/x.pdf',
      }),
    );

    expect(item.type).toBe('ig_report');
    expect(item.sourceOrigin).toBe('oig');
    expect(item.agency).toBe('Office of Personnel Management OIG (via Oversight.gov)');
    expect(item.link).toBe('https://www.oversight.gov/reports/audit/example');
    expect(item.content).toBe('Audit — 2025-OEI-001');
    expect(item.contentType).toBeUndefined();
    expect(item.metadata).toEqual({
      submittingOig: 'Office of Personnel Management OIG',
      reportNumber: '2025-OEI-001',
      reportType: 'Audit',
      agencyReviewed: 'Office of Personnel Management',
      numRecs: 12,
      pdfUrl: 'https://www.oversight.gov/sites/default/files/documents/reports/x.pdf',
      externalUrl: null,
    });
  });

  it('falls back to a generic agency and title-seeded content pre-enrichment', () => {
    const item = toContentItem(report({ title: 'Some Audit Title' }));
    expect(item.agency).toBe('Federal Inspector General (via Oversight.gov)');
    expect(item.content).toBe('Audit — Some Audit Title');
    expect(item.metadata?.reportNumber).toBeNull();
    // pdfUrl undefined = detail not scraped yet — must NOT be marked metadata_only.
    expect(item.contentType).toBeUndefined();
  });

  it('marks a report metadata_only when the scrape confirmed no hosted PDF', () => {
    const item = toContentItem(
      report({
        submittingOig: 'Department of State OIG',
        pdfUrl: null,
        externalUrl: 'https://www.stateoig.gov/report/isp-i-26-12',
      }),
    );
    expect(item.contentType).toBe('metadata_only');
    expect(item.metadata?.pdfUrl).toBeNull();
    expect(item.metadata?.externalUrl).toBe('https://www.stateoig.gov/report/isp-i-26-12');
  });
});
