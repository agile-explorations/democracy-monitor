import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LitigationPanel } from '@/components/category/LitigationPanel';
import { CATEGORIES } from '@/lib/data/categories';

vi.mock('@/components/shared/CaseContext', () => ({
  CaseContext: () => null,
}));

function casePayload(overrides: Record<string, unknown> = {}) {
  return {
    cases: [
      {
        caseId: 'cl:1',
        categories: ['civilLiberties', 'lawEnforcement'],
        caseName: 'Doe v. Agency',
        courtName: 'D.D.C.',
        docketNumber: '1:26-cv-1',
        natureOfSuit: '440 Civil Rights: Other',
        dateFiled: '2026-01-05',
        dateTerminated: null,
        dateLastFiling: '2026-06-30',
        status: 'open',
        posture: { line: 'PI granted 2026-03-01', asOf: '2026-08-10T00:00:00Z' },
        caseSummary: 'Challenge to warrantless surveillance program under the Fourth Amendment',
      },
    ],
    openCount: 42,
    totalCount: 100,
    page: 1,
    hasMore: false,
    ...overrides,
  };
}

// Key-dependent counts: the rendered count proves which key was fetched.
const COUNT_BY_KEY: Record<string, number> = { _all: 42, military: 7, civilLiberties: 13 };

describe('LitigationPanel (combined mode)', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(async (url: string) => {
        const key = new URL(String(url), 'http://x').searchParams.get('key') ?? '_all';
        return { ok: true, json: async () => casePayload({ openCount: COUNT_BY_KEY[key] ?? 0 }) };
      }),
    );
  });

  it('fetches _all, shows the count, and renders category chips on expand', async () => {
    render(<LitigationPanel />);
    // 42 is the _all count — its presence proves the combined key was fetched
    await waitFor(() => expect(screen.getByText(/42 open cases/)).toBeTruthy());

    fireEvent.click(screen.getByText(/Litigation — 42 open cases/));
    await waitFor(() => expect(screen.getByText('Doe v. Agency')).toBeTruthy());
    // Chips (span) and dropdown options both carry titles — assert the chip spans exist
    expect(
      screen.getAllByText('Civil Rights & Liberties').some((el) => el.tagName === 'SPAN'),
    ).toBe(true);
    expect(screen.getAllByText('Federal Law Enforcement').some((el) => el.tagName === 'SPAN')).toBe(
      true,
    );
    expect(screen.getByText(/PI granted 2026-03-01/)).toBeTruthy();
    expect(screen.getByText(/warrantless surveillance program/)).toBeTruthy();
  });

  it('offers all categories in the filter and refetches with the chosen key', async () => {
    render(<LitigationPanel />);
    await waitFor(() => expect(screen.getByText(/42 open cases/)).toBeTruthy());
    fireEvent.click(screen.getByText(/Litigation — 42 open cases/));

    const select = await screen.findByLabelText('Filter litigation by category');
    expect((select as HTMLSelectElement).options.length).toBe(CATEGORIES.length + 1);

    fireEvent.change(select, { target: { value: 'military' } });
    // 7 is the military count — the header updating proves the refetch used the chosen key
    await waitFor(() => expect(screen.getByText(/7 open cases/)).toBeTruthy());
  });

  it('per-category mode fetches that category and shows no filter dropdown', async () => {
    render(<LitigationPanel categoryKey="civilLiberties" />);
    // 13 is the civilLiberties count — proves the category key was fetched
    await waitFor(() => expect(screen.getByText(/13 open cases/)).toBeTruthy());
    fireEvent.click(screen.getByText(/Litigation — 13 open cases/));
    await waitFor(() => expect(screen.getByText('Doe v. Agency')).toBeTruthy());
    expect(screen.queryByLabelText('Filter litigation by category')).toBeNull();
  });
});
