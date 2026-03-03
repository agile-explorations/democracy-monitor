import { describe, it, expect } from 'vitest';
import { buildWeekMetadata } from '@/lib/services/baseline-distributions';

describe('buildWeekMetadata', () => {
  it('counts rows without caseId by title', () => {
    const rows = [
      {
        sourceType: 'Notice',
        title: 'Rule A',
        action: null,
        agency: 'EPA',
        publishedAt: new Date('2025-06-02'),
      },
      {
        sourceType: 'Notice',
        title: 'Rule B',
        action: null,
        agency: 'EPA',
        publishedAt: new Date('2025-06-03'),
      },
    ];
    const meta = buildWeekMetadata('environment', '2025-06-02', rows);
    expect(meta.documentCount).toBe(2);
  });

  it('deduplicates rows with the same caseId', () => {
    const rows = [
      {
        sourceType: 'court_opinion',
        title: 'Smith v. Jones',
        action: null,
        agency: 'D.C. Circuit',
        publishedAt: new Date('2025-06-02'),
        caseId: 'cl:12345',
      },
      {
        sourceType: 'judicial_opinion',
        title: 'Smith v. Jones',
        action: null,
        agency: 'D.C. Circuit',
        publishedAt: new Date('2025-06-05'),
        caseId: 'cl:12345',
      },
    ];
    const meta = buildWeekMetadata('judicialIndependence', '2025-06-02', rows);
    // Two rows with the same caseId count as one case for volume
    expect(meta.documentCount).toBe(1);
  });

  it('counts different caseIds as separate cases', () => {
    const rows = [
      {
        sourceType: 'court_opinion',
        title: 'Smith v. Jones',
        action: null,
        agency: null,
        publishedAt: new Date('2025-06-02'),
        caseId: 'cl:111',
      },
      {
        sourceType: 'judicial_opinion',
        title: 'Smith v. Jones',
        action: null,
        agency: null,
        publishedAt: new Date('2025-06-03'),
        caseId: 'cl:111',
      },
      {
        sourceType: 'court_opinion',
        title: 'Doe v. Roe',
        action: null,
        agency: null,
        publishedAt: new Date('2025-06-04'),
        caseId: 'cl:222',
      },
    ];
    const meta = buildWeekMetadata('civilLiberties', '2025-06-02', rows);
    expect(meta.documentCount).toBe(2);
  });

  it('mixes CL caseId dedup with non-CL title-based counting', () => {
    const rows = [
      {
        sourceType: 'court_opinion',
        title: 'Smith v. Jones',
        action: null,
        agency: null,
        publishedAt: new Date('2025-06-02'),
        caseId: 'cl:111',
      },
      {
        sourceType: 'judicial_opinion',
        title: 'Smith v. Jones',
        action: null,
        agency: null,
        publishedAt: new Date('2025-06-03'),
        caseId: 'cl:111',
      },
      {
        sourceType: 'Notice',
        title: 'EPA Rule on Emissions',
        action: null,
        agency: 'EPA',
        publishedAt: new Date('2025-06-04'),
        caseId: null,
      },
      {
        sourceType: 'Notice',
        title: 'Another Rule',
        action: null,
        agency: 'EPA',
        publishedAt: new Date('2025-06-05'),
        caseId: null,
      },
    ];
    const meta = buildWeekMetadata('environment', '2025-06-02', rows);
    // cl:111 counts once, two non-CL docs count by title (each unique)
    expect(meta.documentCount).toBe(3);
  });
});
