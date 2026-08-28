import { describe, expect, it } from 'vitest';
import { allowedNumbersFrom } from '@/lib/services/narrative-number-check';
import {
  buildVerifyReport,
  renderVerifyReport,
  verifyStoredSummary,
} from '@/lib/services/narrative-verify-report';

const allowed = allowedNumbersFrom('Total documents this week: 509\n— at ConfirmedConcern: 6', 14);

describe('verifyStoredSummary (#700)', () => {
  it('classifies enumeration, category-count and document-total findings separately', () => {
    const f = verifyStoredSummary(
      {
        weekOf: '2026-07-27',
        version: 'expert',
        content:
          'Four categories—Free and Fair Elections, Executive Actions, Civil Rights & Liberties, Federal Law Enforcement, Immigration Enforcement, and Independent Agency Rules—are at ConfirmedConcern. Nine categories were elevated. Volume was 498 documents.',
      },
      allowed,
    );
    expect(f.enumeration).toHaveLength(1);
    expect(f.categories).toHaveLength(1);
    expect(f.categories[0]).toContain('Nine');
    expect(f.documents).toHaveLength(1);
    expect(f.documents[0]).toContain('498');
  });

  it('is clean for a summary whose figures match', () => {
    const f = verifyStoredSummary(
      {
        weekOf: '2026-07-27',
        version: 'public',
        content: 'Six categories are elevated; 509 documents.',
      },
      allowed,
    );
    expect(f.enumeration.concat(f.categories, f.documents)).toEqual([]);
  });
});

describe('buildVerifyReport / renderVerifyReport', () => {
  it('totals findings and only lists rows with findings, definitive first', () => {
    const report = buildVerifyReport(
      [
        { weekOf: '2026-07-27', version: 'expert', content: 'Seven categories are elevated.' },
        { weekOf: '2026-07-27', version: 'public', content: 'Six categories are elevated.' },
      ],
      new Map([['2026-07-27', allowed]]),
    );
    expect(report.rows).toBe(2);
    expect(report.weeks).toBe(1);
    expect(report.findings).toHaveLength(1);
    expect(report.totals).toEqual({ enumeration: 0, categories: 1, documents: 0 });
    const lines = renderVerifyReport(report);
    expect(lines[0]).toContain('category counts: 1');
    expect(lines[1]).toContain('CATEGORIES');
  });
});
