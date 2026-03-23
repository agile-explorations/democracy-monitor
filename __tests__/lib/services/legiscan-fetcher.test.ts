import { describe, expect, it } from 'vitest';
import {
  buildBillMetadata,
  classifyBill,
  isBillInDateRange,
  parseBillToContentItem,
} from '@/lib/services/legiscan-fetcher';
import type { LegiScanBill } from '@/lib/services/legiscan-fetcher';

function makeBill(overrides: Partial<LegiScanBill> = {}): LegiScanBill {
  return {
    bill_id: 1234,
    bill_number: 'HR1234',
    bill_type: 'B',
    title: 'A bill to do something',
    description: 'An act relating to general matters',
    status: 2,
    status_date: '2025-03-15',
    url: 'https://legiscan.com/US/bill/HR1234/2025',
    state: 'US',
    state_link: 'https://congress.gov/bill/hr1234',
    session_id: 2000,
    session: { session_id: 2000, year_start: 2025, year_end: 2026 },
    body: 'House',
    current_body: 'House',
    subjects: [],
    sponsors: [],
    ...overrides,
  };
}

describe('parseBillToContentItem', () => {
  it('maps bill fields to ContentItem', () => {
    const bill = makeBill({
      title: 'Executive Order Accountability Act',
      description: 'To require transparency in executive orders',
      url: 'https://legiscan.com/US/bill/HR100/2025',
      status_date: '2025-02-01',
      body: 'House',
    });

    const item = parseBillToContentItem(bill);

    expect(item.title).toBe('Executive Order Accountability Act');
    expect(item.summary).toBe('To require transparency in executive orders');
    expect(item.link).toBe('https://legiscan.com/US/bill/HR100/2025');
    expect(item.pubDate).toBe('2025-02-01');
    expect(item.type).toBe('bill');
    expect(item.sourceOrigin).toBe('legiscan');
  });

  it('falls back to state_link when url is empty', () => {
    const bill = makeBill({
      url: '',
      state_link: 'https://congress.gov/bill/hr999',
    });

    const item = parseBillToContentItem(bill);
    expect(item.link).toBe('https://congress.gov/bill/hr999');
  });

  it('infers Senate chamber from body', () => {
    const bill = makeBill({ body: 'Senate' });
    const item = parseBillToContentItem(bill);
    expect(item.agency).toBe('US Senate');
  });

  it('infers House chamber from body', () => {
    const bill = makeBill({ body: 'House' });
    const item = parseBillToContentItem(bill);
    expect(item.agency).toBe('US House');
  });

  it('defaults to US Congress for unknown body', () => {
    const bill = makeBill({ body: '', current_body: '' });
    const item = parseBillToContentItem(bill);
    expect(item.agency).toBe('US Congress');
  });
});

describe('buildBillMetadata', () => {
  it('includes core fields', () => {
    const bill = makeBill({
      bill_id: 5678,
      bill_number: 'S42',
      status: 4,
      state: 'US',
      session_id: 2000,
    });

    const meta = buildBillMetadata(bill);

    expect(meta.bill_id).toBe(5678);
    expect(meta.bill_number).toBe('S42');
    expect(meta.status).toBe(4);
    expect(meta.state).toBe('US');
    expect(meta.session_id).toBe(2000);
  });

  it('extracts subject names', () => {
    const bill = makeBill({
      subjects: [
        { subject_id: 1, subject_name: 'Government Operations' },
        { subject_id: 2, subject_name: 'National Security' },
      ],
    });

    const meta = buildBillMetadata(bill);
    expect(meta.subjects).toEqual(['Government Operations', 'National Security']);
  });

  it('omits subjects when empty', () => {
    const bill = makeBill({ subjects: [] });
    const meta = buildBillMetadata(bill);
    expect(meta.subjects).toBeUndefined();
  });

  it('builds sponsor party breakdown', () => {
    const bill = makeBill({
      sponsors: [
        { people_id: 1, party: 'R', name: 'Smith', sponsor_type_id: 1 },
        { people_id: 2, party: 'D', name: 'Jones', sponsor_type_id: 2 },
        { people_id: 3, party: 'R', name: 'Brown', sponsor_type_id: 2 },
      ],
    });

    const meta = buildBillMetadata(bill);
    expect(meta.sponsor_party_breakdown).toBe('R:2,D:1');
  });

  it('omits party breakdown when no sponsors', () => {
    const bill = makeBill({ sponsors: [] });
    const meta = buildBillMetadata(bill);
    expect(meta.sponsor_party_breakdown).toBeUndefined();
  });
});

describe('classifyBill', () => {
  it('matches executive oversight keywords', () => {
    const bill = makeBill({
      title: 'IG Independence Restoration Act',
      description: 'To prevent inspector general removed without cause',
    });

    const categories = classifyBill(bill);
    expect(categories).toContain('executiveOversight');
  });

  it('matches judicial independence keywords', () => {
    const bill = makeBill({
      title: 'Judicial Independence Act',
      description: 'Protecting courts from executive contempt of court orders',
    });

    const categories = classifyBill(bill);
    expect(categories).toContain('judicialIndependence');
  });

  it('matches civil service via topic routing terms', () => {
    const bill = makeBill({
      title: 'Preventing Schedule F Act',
      description: 'To protect the merit system for civil servants',
    });

    const categories = classifyBill(bill);
    expect(categories).toContain('civilService');
  });

  it('returns empty for unrelated bills', () => {
    const bill = makeBill({
      title: 'National Puppy Day Resolution',
      description: 'Designating March 23 as National Puppy Day',
    });

    const categories = classifyBill(bill);
    expect(categories).toEqual([]);
  });

  it('matches multiple categories', () => {
    const bill = makeBill({
      title: 'Executive Accountability Act',
      description:
        'Addressing inspector general removed from office and contempt of court by executive branch',
    });

    const categories = classifyBill(bill);
    expect(categories.length).toBeGreaterThanOrEqual(2);
  });

  it('does not match generic health education bill', () => {
    const bill = makeBill({
      title: 'AN ACT relating to health education',
      description: 'Providing for health education in public schools',
    });

    const categories = classifyBill(bill);
    expect(categories).toEqual([]);
  });
});

describe('classifyBill subject filtering', () => {
  it('matches bill with broad term + relevant subject', () => {
    const bill = makeBill({
      title: 'Regulation Reform Act',
      description: 'A bill to reform regulation of federal agencies',
      subjects: [{ subject_id: 1, subject_name: 'Administrative law and regulatory procedures' }],
    });
    const categories = classifyBill(bill);
    expect(categories).toContain('rulemaking');
  });

  it('drops bill with broad term + irrelevant subject', () => {
    const bill = makeBill({
      title: 'SHOWER Act',
      description: 'A bill about energy regulation standards',
      subjects: [{ subject_id: 1, subject_name: 'Energy' }],
    });
    const categories = classifyBill(bill);
    expect(categories).not.toContain('rulemaking');
  });

  it('keeps bill with broad term + no subjects (fallback)', () => {
    const bill = makeBill({
      title: 'Oversight Enhancement Act',
      description: 'A bill to strengthen oversight of federal programs',
      subjects: [],
    });
    const categories = classifyBill(bill);
    expect(categories).toContain('executiveOversight');
  });

  it('keeps bill with non-broad term regardless of subjects', () => {
    const bill = makeBill({
      title: 'Inspector General Protection Act',
      description: 'Preventing removal of inspectors general without cause',
      subjects: [{ subject_id: 1, subject_name: 'Energy' }],
    });
    const categories = classifyBill(bill);
    expect(categories).toContain('executiveOversight');
  });

  it('keeps both categories when one broad + one specific', () => {
    const bill = makeBill({
      title: 'Inspector General and Regulation Reform Act',
      description: 'A bill about inspector general and regulation reform',
      subjects: [{ subject_id: 1, subject_name: 'Energy' }],
    });
    const categories = classifyBill(bill);
    // 'executiveOversight' kept via specific term 'inspector general'
    expect(categories).toContain('executiveOversight');
    // 'rulemaking' dropped — only broad term 'regulation' matched, subject is 'Energy'
    expect(categories).not.toContain('rulemaking');
  });

  it('keeps bill with broad term + empty subjects array (fallback)', () => {
    const bill = makeBill({
      title: 'Federal Deficit Reduction Act',
      description: 'A bill to reduce the deficit',
      subjects: [],
    });
    const categories = classifyBill(bill);
    expect(categories).toContain('fiscal');
  });
});

describe('isBillInDateRange', () => {
  it('returns true when status_date is within range', () => {
    const bill = makeBill({ status_date: '2025-06-15' });
    expect(isBillInDateRange(bill, '2025-01-20', '2026-01-19')).toBe(true);
  });

  it('returns true on range boundaries', () => {
    const bill = makeBill({ status_date: '2025-01-20' });
    expect(isBillInDateRange(bill, '2025-01-20', '2026-01-19')).toBe(true);

    const bill2 = makeBill({ status_date: '2026-01-19' });
    expect(isBillInDateRange(bill2, '2025-01-20', '2026-01-19')).toBe(true);
  });

  it('returns false when status_date is before range', () => {
    const bill = makeBill({ status_date: '2024-12-31' });
    expect(isBillInDateRange(bill, '2025-01-20', '2026-01-19')).toBe(false);
  });

  it('returns false when status_date is after range', () => {
    const bill = makeBill({ status_date: '2026-02-01' });
    expect(isBillInDateRange(bill, '2025-01-20', '2026-01-19')).toBe(false);
  });

  it('returns false when status_date is empty', () => {
    const bill = makeBill({ status_date: '' });
    expect(isBillInDateRange(bill, '2025-01-20', '2026-01-19')).toBe(false);
  });
});
