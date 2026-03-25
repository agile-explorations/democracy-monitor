import { describe, expect, it } from 'vitest';
import {
  aoToContentItem,
  murToContentItem,
  parseFecParams,
  parseFecDocUrl,
} from '@/lib/services/fec-fetcher';

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
    expect(item.content).toContain('AI-generated content');
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
    expect(item.content!.length).toBeLessThanOrEqual(801);
  });

  it('includes statutory citations in summary', () => {
    const item = aoToContentItem({
      ao_no: '2024-07',
      summary: 'Joint fundraising activities',
      statutory_citations: [
        { section: '30116', title: 52 },
        { section: '30121', title: 52 },
      ],
    });
    expect(item.content).toContain('Joint fundraising activities');
    expect(item.content).toContain('52 USC §30116');
    expect(item.content).toContain('52 USC §30121');
  });

  it('includes regulatory citations in summary', () => {
    const item = aoToContentItem({
      summary: 'Test opinion',
      regulatory_citations: [{ part: 110, section: 1, title: 11 }],
    });
    expect(item.content).toContain('11 CFR §110.1');
  });
});

describe('murToContentItem', () => {
  it('maps MUR fields correctly with subjects and participants', () => {
    const item = murToContentItem({
      case_no: '8000',
      name: 'Citizens for Transparency',
      subjects: [{ subject: 'Excessive Contributions' }, { subject: 'Reporting' }],
      open_date: '2025-03-01',
      participants: [
        { name: 'Smith PAC', role: 'Primary Respondent' },
        { name: 'Jones Committee', role: 'Primary Respondent' },
        { name: 'Watchdog Org', role: 'Complainant' },
      ],
    });

    expect(item.title).toBe('Citizens for Transparency');
    expect(item.link).toBe('https://www.fec.gov/data/legal/matter-under-review/8000/');
    expect(item.pubDate).toBe('2025-03-01');
    expect(item.agency).toBe('Federal Election Commission');
    expect(item.content).toContain('Excessive Contributions');
    expect(item.content).toContain('Smith PAC');
    expect(item.content).toContain('Complainant');
    expect(item.type).toBe('enforcement_action');
    expect(item.sourceOrigin).toBe('fec');
  });

  it('falls back to old subject.primary when subjects array is absent', () => {
    const item = murToContentItem({
      subject: { primary: ['Soft Money'], secondary: [] },
      respondents: ['Test PAC'],
    });
    expect(item.content).toContain('Soft Money');
    expect(item.content).toContain('Test PAC');
  });

  it('includes dispositions with statutes and penalties', () => {
    const item = murToContentItem({
      case_no: '8353',
      dispositions: [
        {
          disposition: 'Conciliation: Pre Probable Cause',
          penalty: 16000,
          respondent: 'Franklin, Kamau',
          citations: [{ text: '30104(g)(1)', title: '52', type: 'statute' }],
        },
      ],
    });

    expect(item.content).toContain('Conciliation: Pre Probable Cause');
    expect(item.content).toContain('Franklin, Kamau');
    expect(item.content).toContain('$16,000');
    expect(item.content).toContain('52 USC §30104(g)(1)');
  });

  it('includes commission vote summary', () => {
    const item = murToContentItem({
      commission_votes: [
        {
          action: 'The Commission decided by a vote of 5-1 to close the file.',
          vote_date: '2022-01-11',
        },
      ],
    });
    expect(item.content).toContain('Commission action');
    expect(item.content).toContain('5-1');
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

  it('falls back to respondents when no participants', () => {
    const item = murToContentItem({
      respondents: ['A', 'B', 'C', 'D', 'E'],
    });
    expect(item.content).toContain('Respondents: A; B; C; D; E');
  });

  it('handles empty subjects and respondents', () => {
    const item = murToContentItem({ case_no: '100' });
    expect(item.content).toBeUndefined();
  });
});

describe('parseFecDocUrl', () => {
  it('parses MUR URLs', () => {
    const result = parseFecDocUrl('https://www.fec.gov/data/legal/matter-under-review/8353/');
    expect(result).toEqual({ type: 'mur', id: '8353' });
  });

  it('parses AO URLs', () => {
    const result = parseFecDocUrl('https://www.fec.gov/data/legal/advisory-opinions/2024-07/');
    expect(result).toEqual({ type: 'ao', id: '2024-07' });
  });

  it('returns null for non-FEC URLs', () => {
    expect(parseFecDocUrl('https://example.com/other')).toBeNull();
  });
});
