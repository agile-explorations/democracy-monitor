import * as cheerio from 'cheerio';
import { describe, expect, it } from 'vitest';
import { parseHhsOigParams, parseReportCard, toContentItem } from '@/lib/services/hhs-oig-fetcher';
import type { HhsOigReport } from '@/lib/services/hhs-oig-fetcher';

const SAMPLE_CARD_HTML = `
<li class="usa-card pep-recommendations-card mobile:grid-col-12">
  <div class="usa-card__container">
    <header class="usa-card__header">
      <h2 class="usa-card__heading font-family-ui" id="">
        <a class="text-no-underline hover:text-underline"
           href=/reports/all/2026/sarasota-memorial-hospital-received-at-least-121-million-in-medicare-overpayments/>
          Sarasota Memorial Hospital Received At Least $12.1 Million in Medicare Overpayments
        </a>
      </h2>
    </header>
    <div class="usa-card__body padding-top-0">
      <dl class="pep-metadata pep-metadata--inline">
        <div class="grid-row">
          <div class="grid-col display-flex flex-column">
            <dt class="pep-metadata__term">Audit</dt>
            <dd class="pep-metadata__def text-bold">A-04-23-08098</dd>
          </div>
          <div class="grid-col display-flex flex-column">
            <dt class="pep-metadata__term">HHS Agency</dt>
            <dd class="pep-metadata__def text-bold">CMS</dd>
          </div>
          <div class="grid-col display-flex flex-column">
            <dt class="pep-metadata__term">Issued</dt>
            <dd class="pep-metadata__def text-bold">02/25/2026</dd>
          </div>
        </div>
      </dl>
    </div>
  </div>
</li>`;

const EVALUATION_CARD_HTML = `
<li class="usa-card pep-recommendations-card mobile:grid-col-12">
  <div class="usa-card__container">
    <header class="usa-card__header">
      <h2 class="usa-card__heading font-family-ui" id="">
        <a class="text-no-underline hover:text-underline"
           href=https://oig.hhs.gov/reports/all/2025/evaluation-of-cms-oversight/>
          Evaluation of CMS Oversight of Medicare Advantage
        </a>
      </h2>
    </header>
    <div class="usa-card__body padding-top-0">
      <dl class="pep-metadata pep-metadata--inline">
        <div class="grid-row">
          <div class="grid-col display-flex flex-column">
            <dt class="pep-metadata__term">Evaluation</dt>
            <dd class="pep-metadata__def text-bold">OEI-03-22-00120</dd>
          </div>
          <div class="grid-col display-flex flex-column">
            <dt class="pep-metadata__term">HHS Agency</dt>
            <dd class="pep-metadata__def text-bold">CMS</dd>
          </div>
          <div class="grid-col display-flex flex-column">
            <dt class="pep-metadata__term">Issued</dt>
            <dd class="pep-metadata__def text-bold">06/15/2025</dd>
          </div>
        </div>
      </dl>
    </div>
  </div>
</li>`;

describe('parseHhsOigParams', () => {
  it('returns empty object for any signal URL', () => {
    expect(parseHhsOigParams('oig://hhs')).toEqual({});
  });
});

describe('parseReportCard', () => {
  it('extracts all fields from an audit card', () => {
    const $ = cheerio.load(SAMPLE_CARD_HTML);
    const report = parseReportCard($('li.usa-card').first());

    expect(report).not.toBeNull();
    expect(report!.title).toBe(
      'Sarasota Memorial Hospital Received At Least $12.1 Million in Medicare Overpayments',
    );
    expect(report!.url).toBe(
      'https://oig.hhs.gov/reports/all/2026/sarasota-memorial-hospital-received-at-least-121-million-in-medicare-overpayments/',
    );
    expect(report!.publishedAt).toBe('2026-02-25T12:00:00.000Z');
    expect(report!.reportType).toBe('Audit');
    expect(report!.reportNumber).toBe('A-04-23-08098');
    expect(report!.hhsAgency).toBe('CMS');
  });

  it('extracts evaluation reports', () => {
    const $ = cheerio.load(EVALUATION_CARD_HTML);
    const report = parseReportCard($('li.usa-card').first());

    expect(report).not.toBeNull();
    expect(report!.reportType).toBe('Evaluation');
    expect(report!.reportNumber).toBe('OEI-03-22-00120');
    expect(report!.publishedAt).toBe('2025-06-15T12:00:00.000Z');
  });

  it('handles absolute URLs in href', () => {
    const $ = cheerio.load(EVALUATION_CARD_HTML);
    const report = parseReportCard($('li.usa-card').first());
    expect(report!.url).toBe('https://oig.hhs.gov/reports/all/2025/evaluation-of-cms-oversight/');
  });

  it('returns null when title link is missing', () => {
    const html = `<li class="usa-card"><div class="usa-card__container">
      <header class="usa-card__header"><h2 class="usa-card__heading">No link</h2></header>
      <div class="usa-card__body padding-top-0"></div>
    </div></li>`;
    const $ = cheerio.load(html);
    expect(parseReportCard($('li.usa-card').first())).toBeNull();
  });

  it('returns null when Issued date is missing', () => {
    const html = `<li class="usa-card"><div class="usa-card__container">
      <header class="usa-card__header">
        <h2 class="usa-card__heading"><a href="/reports/test">Test</a></h2>
      </header>
      <div class="usa-card__body padding-top-0">
        <dl class="pep-metadata"><div class="grid-row">
          <div class="grid-col"><dt class="pep-metadata__term">Audit</dt><dd class="pep-metadata__def">A-01</dd></div>
        </div></dl>
      </div>
    </div></li>`;
    const $ = cheerio.load(html);
    expect(parseReportCard($('li.usa-card').first())).toBeNull();
  });
});

describe('toContentItem', () => {
  it('converts an HhsOigReport to a ContentItem', () => {
    const report: HhsOigReport = {
      title: 'Test Audit',
      url: 'https://oig.hhs.gov/reports/all/2026/test/',
      publishedAt: '2026-02-25T12:00:00.000Z',
      reportType: 'Audit',
      reportNumber: 'A-04-23-08098',
      hhsAgency: 'CMS',
    };

    const item = toContentItem(report);

    expect(item.title).toBe('Test Audit');
    expect(item.link).toBe('https://oig.hhs.gov/reports/all/2026/test/');
    expect(item.pubDate).toBe('2026-02-25T12:00:00.000Z');
    expect(item.agency).toBe('HHS OIG — CMS');
    expect(item.summary).toBe('Audit A-04-23-08098');
    expect(item.type).toBe('ig_report');
    expect(item.sourceOrigin).toBe('oig');
  });
});
