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
    matches: [],
    suppressed: [],
    ...overrides,
  };
}

const docs = [
  makeDoc({
    url: 'https://example.com/1',
    title: 'Alpha Doc',
    ai: {
      flagged: true,
      assessment: 'clearly_concerning',
      erosionType: 'formal_override',
      reasoning: 'Alpha reasoning',
    },
  }),
  makeDoc({
    url: 'https://example.com/2',
    title: 'Beta Doc',
    ai: { flagged: false, assessment: null, erosionType: null, reasoning: null },
  }),
  makeDoc({
    url: 'https://example.com/3',
    title: 'Gamma Doc',
    ai: {
      flagged: true,
      assessment: 'not_concerning',
      erosionType: null,
      reasoning: 'Gamma reasoning',
    },
  }),
];

describe('DocumentTable', () => {
  it('renders all documents', () => {
    const { getByText } = render(
      <DocumentTable documents={docs} category="judicialIndependence" weekOf="2025-02-03" />,
    );
    expect(getByText('Alpha Doc')).toBeTruthy();
    expect(getByText('Beta Doc')).toBeTruthy();
    expect(getByText('Gamma Doc')).toBeTruthy();
  });

  it('shows AI assessment columns', () => {
    const { getByText } = render(
      <DocumentTable documents={docs} category="judicialIndependence" weekOf="2025-02-03" />,
    );
    // AI Flag is the default sort field so it includes the arrow
    expect(getByText(/AI Flag/)).toBeTruthy();
    expect(getByText('Assessment')).toBeTruthy();
    expect(getByText('Erosion Type')).toBeTruthy();
  });

  it('displays AI flag status correctly', () => {
    const { container } = render(
      <DocumentTable
        documents={[docs[0], docs[1]]}
        category="judicialIndependence"
        weekOf="2025-02-03"
      />,
    );
    const rows = container.querySelectorAll('tbody tr');
    expect(rows[0].textContent).toContain('Yes');
    expect(rows[1].textContent).toContain('No');
  });

  it('displays assessment and erosion type with tooltips', () => {
    const { getByText } = render(
      <DocumentTable documents={[docs[0]]} category="judicialIndependence" weekOf="2025-02-03" />,
    );
    const assessmentEl = getByText('clearly concerning');
    expect(assessmentEl.title).toContain('Multiple indicators');
    const erosionEl = getByText('formal override');
    expect(erosionEl.title).toContain('Explicit legal');
  });

  it('shows dash for documents without AI data', () => {
    const docNoAI = makeDoc({ url: 'https://example.com/no-ai', title: 'No AI Doc' });
    const { container } = render(
      <DocumentTable documents={[docNoAI]} category="judicialIndependence" weekOf="2025-02-03" />,
    );
    const cells = container.querySelectorAll('tbody td');
    // AI Flag, Assessment, Erosion Type, Reasoning should show dashes
    expect(cells[2].textContent).toBe('—');
    expect(cells[3].textContent).toBe('—');
    expect(cells[5].textContent).toBe('—');
  });

  it('shows truncated reasoning that expands on click', () => {
    const { container, getByText } = render(
      <DocumentTable documents={[docs[0]]} category="judicialIndependence" weekOf="2025-02-03" />,
    );
    // Reasoning is visible but truncated (line-clamp-1)
    const reasoningBtn = getByText('Alpha reasoning');
    expect(reasoningBtn.className).toContain('line-clamp-1');
    // Click to expand
    fireEvent.click(reasoningBtn);
    const expanded = getByText('Alpha reasoning');
    expect(expanded.className).toContain('whitespace-normal');
    expect(expanded.className).not.toContain('line-clamp-1');
  });

  it('toggles sort direction on column click', () => {
    const { container, getByText } = render(
      <DocumentTable documents={docs} category="judicialIndependence" weekOf="2025-02-03" />,
    );
    fireEvent.click(getByText('Title'));
    const rows = container.querySelectorAll('tbody tr');
    // Title sort defaults to desc
    expect(rows[0].textContent).toContain('Gamma Doc');
    expect(rows[2].textContent).toContain('Alpha Doc');
  });

  it('shows empty state when no documents', () => {
    const { getByText } = render(
      <DocumentTable documents={[]} category="judicialIndependence" weekOf="2025-02-03" />,
    );
    expect(getByText('No scored documents this week.')).toBeTruthy();
  });

  it('renders export CSV button', () => {
    const { getByText } = render(
      <DocumentTable documents={docs} category="judicialIndependence" weekOf="2025-02-03" />,
    );
    expect(getByText(/Export CSV/)).toBeTruthy();
  });

  it('creates blob download on export click', () => {
    const createObjectURL = vi.fn(() => 'blob:test');
    const revokeObjectURL = vi.fn();
    Object.assign(URL, { createObjectURL, revokeObjectURL });

    const { getByText } = render(
      <DocumentTable documents={docs} category="judicialIndependence" weekOf="2025-02-03" />,
    );
    fireEvent.click(getByText(/Export CSV/));
    expect(createObjectURL).toHaveBeenCalled();
    expect(revokeObjectURL).toHaveBeenCalled();
  });

  it('renders document links with correct href', () => {
    const { container } = render(
      <DocumentTable documents={[docs[0]]} category="judicialIndependence" weekOf="2025-02-03" />,
    );
    const link = container.querySelector('a[href="https://example.com/1"]');
    expect(link).toBeTruthy();
    expect(link?.textContent).toBe('Alpha Doc');
  });
});
