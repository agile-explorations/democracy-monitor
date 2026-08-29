import { describe, expect, it } from 'vitest';
import { disputeHref, disputeIssueUrl, parseDisputeQuery } from '@/lib/utils/dispute-link';
import type { DisputeContext } from '@/lib/utils/dispute-link';

const ctx: DisputeContext = {
  documentId: 1154756,
  url: 'https://www.federalregister.gov/d/2025-03063',
  title: 'Executive Order 14219—Ensuring Lawful Governance',
  category: 'rulemaking',
  weekOf: '2025-02-17',
  verdict: 'clearly_concerning',
  erosionType: 'formal_override',
  surface: 'week',
};

describe('dispute link (#815)', () => {
  it('round-trips the document and the reading through the feedback query', () => {
    const href = disputeHref(ctx);
    expect(href.startsWith('/feedback?type=dispute')).toBe(true);
    const query = Object.fromEntries(new URLSearchParams(href.split('?')[1]));
    expect(parseDisputeQuery(query)).toEqual(ctx);
  });

  it('is null for ordinary feedback queries and for a dispute missing its reading', () => {
    expect(parseDisputeQuery({ category: 'fiscal' })).toBeNull();
    expect(parseDisputeQuery({ type: 'dispute', title: 'x', category: 'fiscal' })).toBeNull();
  });

  it('tolerates a missing document id and an unknown surface', () => {
    const parsed = parseDisputeQuery({
      type: 'dispute',
      title: 'T',
      category: 'fiscal',
      verdict: 'routine',
      surface: 'elsewhere',
    });
    expect(parsed).toMatchObject({ documentId: null, url: null, surface: 'week' });
  });

  it('prefills a public GitHub issue with the document, the reading, and a prompt for the passage', () => {
    const url = disputeIssueUrl(ctx);
    expect(url).toContain('/issues/new?');
    const params = new URLSearchParams(url.split('?')[1]);
    expect(params.get('title')).toContain('Executive Order 14219');
    expect(params.get('body')).toContain('clearly_concerning');
    expect(params.get('body')).toContain('Why this reading is wrong');
    expect(params.get('labels')).toBe('dispute');
  });
});
