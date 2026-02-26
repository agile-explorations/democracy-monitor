import { describe, expect, it } from 'vitest';
import { aoToContentItem, murToContentItem, parseFecParams } from '@/lib/services/fec-fetcher';

describe('parseFecParams', () => {
  it('extracts advisory_opinions type from pseudo-URL', () => {
    const result = parseFecParams('fec://advisory-opinions?type=advisory_opinions');
    expect(result.endpointType).toBe('advisory_opinions');
  });

  it('extracts murs type from pseudo-URL', () => {
    const result = parseFecParams('fec://enforcement?type=murs');
    expect(result.endpointType).toBe('murs');
  });

  it('extracts admin_fines type from pseudo-URL', () => {
    const result = parseFecParams('fec://fines?type=admin_fines');
    expect(result.endpointType).toBe('admin_fines');
  });

  it('defaults to advisory_opinions when type not specified', () => {
    const result = parseFecParams('fec://default');
    expect(result.endpointType).toBe('advisory_opinions');
  });
});

describe('aoToContentItem', () => {
  it('maps advisory opinion fields correctly', () => {
    const item = aoToContentItem({
      ao_no: '2025-01',
      name: 'Campaign Committee Use of AI',
      summary: 'The Commission concludes that AI-generated content may be used in...',
      issue_date: '2025-06-15',
      status: 'Final',
    });

    expect(item.title).toBe('Campaign Committee Use of AI');
    expect(item.link).toBe('https://www.fec.gov/data/legal/advisory-opinions/2025-01/');
    expect(item.pubDate).toBe('2025-06-15');
    expect(item.agency).toBe('Federal Election Commission');
    expect(item.summary).toContain('AI-generated content');
    expect(item.type).toBe('advisory_opinion');
    expect(item.sourceOrigin).toBe('fec');
  });

  it('handles missing optional fields', () => {
    const item = aoToContentItem({});
    expect(item.title).toBe('Advisory Opinion (unknown)');
    expect(item.link).toBeUndefined();
    expect(item.agency).toBe('Federal Election Commission');
    expect(item.type).toBe('advisory_opinion');
    expect(item.sourceOrigin).toBe('fec');
  });

  it('uses ao_no in title when name is missing', () => {
    const item = aoToContentItem({ ao_no: '2025-03' });
    expect(item.title).toBe('Advisory Opinion 2025-03');
  });

  it('constructs link from ao_no', () => {
    const item = aoToContentItem({ ao_no: '2024-12' });
    expect(item.link).toBe('https://www.fec.gov/data/legal/advisory-opinions/2024-12/');
  });

  it('truncates long summaries', () => {
    const longSummary = 'B'.repeat(1000);
    const item = aoToContentItem({ summary: longSummary });
    expect(item.summary!.length).toBeLessThanOrEqual(801);
  });
});

describe('murToContentItem', () => {
  it('maps MUR fields correctly', () => {
    const item = murToContentItem({
      case_no: '8000',
      name: 'Citizens for Transparency',
      subject: { primary: ['Excessive Contributions', 'Reporting'], secondary: [] },
      open_date: '2025-03-01',
      respondents: ['Smith PAC', 'Jones Committee'],
    });

    expect(item.title).toBe('Citizens for Transparency');
    expect(item.link).toBe('https://www.fec.gov/data/legal/matter-under-review/8000/');
    expect(item.pubDate).toBe('2025-03-01');
    expect(item.agency).toBe('Federal Election Commission');
    expect(item.summary).toContain('Excessive Contributions');
    expect(item.summary).toContain('Smith PAC');
    expect(item.type).toBe('enforcement_action');
    expect(item.sourceOrigin).toBe('fec');
  });

  it('handles missing optional fields', () => {
    const item = murToContentItem({});
    expect(item.title).toBe('MUR (unknown)');
    expect(item.link).toBeUndefined();
    expect(item.agency).toBe('Federal Election Commission');
    expect(item.type).toBe('enforcement_action');
    expect(item.sourceOrigin).toBe('fec');
  });

  it('uses case_no in title when name is missing', () => {
    const item = murToContentItem({ case_no: '7500' });
    expect(item.title).toBe('MUR 7500');
  });

  it('uses provided url over constructed url', () => {
    const item = murToContentItem({
      case_no: '7500',
      url: 'https://www.fec.gov/custom/url',
    });
    expect(item.link).toBe('https://www.fec.gov/custom/url');
  });

  it('limits respondents to 3 in summary', () => {
    const item = murToContentItem({
      respondents: ['A', 'B', 'C', 'D', 'E'],
    });
    expect(item.summary).toContain('A');
    expect(item.summary).toContain('C');
    expect(item.summary).not.toContain('D');
  });

  it('handles empty subjects and respondents', () => {
    const item = murToContentItem({ case_no: '100' });
    expect(item.summary).toBeUndefined();
  });
});
