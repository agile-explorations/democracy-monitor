import { render, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { DocumentTable } from '@/components/week/DocumentTable';
import type { DocumentExplanation } from '@/lib/types/explanation';

function makeDoc(overrides: Partial<DocumentExplanation> = {}): DocumentExplanation {
  return {
    url: 'https://example.com/doc1',
    title: 'Test Document Alpha',
    documentClass: 'Rule',
    classMultiplier: 1.5,
    severityScore: 2.0,
    finalScore: 3.0,
    formula: 'test',
    tierBreakdown: [
      { tier: 'capture', count: 1, weight: 5, contribution: 5 },
      { tier: 'drift', count: 2, weight: 2, contribution: 4 },
      { tier: 'warning', count: 0, weight: 1, contribution: 0 },
    ],
    matches: [
      { keyword: 'test', tier: 'capture', context: '', position: 0 },
      { keyword: 'other', tier: 'drift', context: '', position: 0 },
    ],
    suppressed: [],
    ...overrides,
  };
}

const docs = [
  makeDoc({ url: 'https://example.com/1', title: 'Alpha Doc', finalScore: 5.0 }),
  makeDoc({ url: 'https://example.com/2', title: 'Beta Doc', finalScore: 2.0 }),
  makeDoc({ url: 'https://example.com/3', title: 'Gamma Doc', finalScore: 8.0 }),
];

describe('DocumentTable', () => {
  it('renders all documents', () => {
    const { getByText } = render(
      <DocumentTable documents={docs} category="courts" weekOf="2025-02-03" />,
    );
    expect(getByText('Alpha Doc')).toBeTruthy();
    expect(getByText('Beta Doc')).toBeTruthy();
    expect(getByText('Gamma Doc')).toBeTruthy();
  });

  it('sorts by score descending by default', () => {
    const { container } = render(
      <DocumentTable documents={docs} category="courts" weekOf="2025-02-03" />,
    );
    const rows = container.querySelectorAll('tbody tr');
    expect(rows[0].textContent).toContain('Gamma Doc');
    expect(rows[1].textContent).toContain('Alpha Doc');
    expect(rows[2].textContent).toContain('Beta Doc');
  });

  it('toggles sort direction on column click', () => {
    const { container, getByText } = render(
      <DocumentTable documents={docs} category="courts" weekOf="2025-02-03" />,
    );
    // Click Score header to toggle to ascending
    fireEvent.click(getByText(/Score/));
    const rows = container.querySelectorAll('tbody tr');
    expect(rows[0].textContent).toContain('Beta Doc');
    expect(rows[2].textContent).toContain('Gamma Doc');
  });

  it('sorts by title when clicking Title header', () => {
    const { container, getByText } = render(
      <DocumentTable documents={docs} category="courts" weekOf="2025-02-03" />,
    );
    fireEvent.click(getByText('Title'));
    const rows = container.querySelectorAll('tbody tr');
    // Title sort defaults to desc
    expect(rows[0].textContent).toContain('Gamma Doc');
    expect(rows[2].textContent).toContain('Alpha Doc');
  });

  it('shows empty state when no documents', () => {
    const { getByText } = render(
      <DocumentTable documents={[]} category="courts" weekOf="2025-02-03" />,
    );
    expect(getByText('No scored documents this week.')).toBeTruthy();
  });

  it('renders export CSV button', () => {
    const { getByText } = render(
      <DocumentTable documents={docs} category="courts" weekOf="2025-02-03" />,
    );
    expect(getByText(/Export CSV/)).toBeTruthy();
  });

  it('creates blob download on export click', () => {
    const createObjectURL = vi.fn(() => 'blob:test');
    const revokeObjectURL = vi.fn();
    Object.assign(URL, { createObjectURL, revokeObjectURL });

    const { getByText } = render(
      <DocumentTable documents={docs} category="courts" weekOf="2025-02-03" />,
    );
    fireEvent.click(getByText(/Export CSV/));
    expect(createObjectURL).toHaveBeenCalled();
    expect(revokeObjectURL).toHaveBeenCalled();
  });

  it('renders document links with correct href', () => {
    const { container } = render(
      <DocumentTable documents={[docs[0]]} category="courts" weekOf="2025-02-03" />,
    );
    const link = container.querySelector('a[href="https://example.com/1"]');
    expect(link).toBeTruthy();
    expect(link?.textContent).toBe('Alpha Doc');
  });

  it('shows match and suppressed counts', () => {
    const doc = makeDoc({
      matches: [
        { keyword: 'a', tier: 'capture', context: '', position: 0 },
        { keyword: 'b', tier: 'drift', context: '', position: 0 },
        { keyword: 'c', tier: 'warning', context: '', position: 0 },
      ],
      suppressed: [{ keyword: 'd', tier: 'warning', rule: 'test', reason: 'test' }],
    });
    const { container } = render(
      <DocumentTable documents={[doc]} category="courts" weekOf="2025-02-03" />,
    );
    const cells = container.querySelectorAll('tbody td');
    // Matches count = 3, Suppressed count = 1
    expect(cells[3].textContent).toBe('3');
    expect(cells[4].textContent).toBe('1');
  });
});
