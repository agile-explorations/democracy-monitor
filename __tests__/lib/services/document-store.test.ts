import { describe, it, expect, vi } from 'vitest';
import { buildMetadata, inferSourceOrigin } from '@/lib/services/document-store';

describe('buildMetadata', () => {
  it('returns null when no metadata fields are present', () => {
    expect(buildMetadata({ title: 'Test' })).toBeNull();
  });

  it('includes agency when present', () => {
    const meta = buildMetadata({ agency: 'EPA' });
    expect(meta).toEqual({ agency: 'EPA' });
  });

  it('includes action when present', () => {
    const meta = buildMetadata({ action: 'Final rule.' });
    expect(meta).toEqual({ action: 'Final rule.' });
  });

  it('includes subtype when present', () => {
    const meta = buildMetadata({ subtype: 'Executive Order' });
    expect(meta).toEqual({ subtype: 'Executive Order' });
  });

  it('includes all three fields when all present', () => {
    const meta = buildMetadata({
      agency: 'OPM',
      action: 'Notice.',
      subtype: 'Proclamation',
    });
    expect(meta).toEqual({
      agency: 'OPM',
      action: 'Notice.',
      subtype: 'Proclamation',
    });
  });

  it('omits undefined fields without including them', () => {
    const meta = buildMetadata({ agency: 'EPA', action: undefined });
    expect(meta).toEqual({ agency: 'EPA' });
    expect(meta).not.toHaveProperty('action');
  });
});

describe('inferSourceOrigin', () => {
  it('returns federal_register for Notice type', () => {
    expect(inferSourceOrigin({ type: 'Notice' })).toBe('federal_register');
  });

  it('returns federal_register for Rule type', () => {
    expect(inferSourceOrigin({ type: 'Rule' })).toBe('federal_register');
  });

  it('returns federal_register for executive_order type', () => {
    expect(inferSourceOrigin({ type: 'executive_order' })).toBe('federal_register');
  });

  it('returns doj for press_release type', () => {
    expect(inferSourceOrigin({ type: 'press_release' })).toBe('doj');
  });

  it('returns courtlistener for court_opinion type', () => {
    expect(inferSourceOrigin({ type: 'court_opinion' })).toBe('courtlistener');
  });

  it('returns courtlistener for docket_entry type', () => {
    expect(inferSourceOrigin({ type: 'docket_entry' })).toBe('courtlistener');
  });

  it('returns null for rhetoric type (ambiguous)', () => {
    expect(inferSourceOrigin({ type: 'rhetoric' })).toBeNull();
  });

  it('returns null for unknown types', () => {
    expect(inferSourceOrigin({ type: 'something_else' })).toBeNull();
  });

  it('returns null for empty item', () => {
    expect(inferSourceOrigin({})).toBeNull();
  });
});

describe('storeDocuments docket routing (#695 stub retirement)', () => {
  it('routes court_opinion items to tracked_cases and persists only the rest', async () => {
    vi.resetModules();
    const upsertTrackedCasesFromItems = vi.fn().mockResolvedValue(1);
    vi.doMock('@/lib/services/tracked-case-store', () => ({ upsertTrackedCasesFromItems }));
    const values = vi.fn(() => ({ onConflictDoUpdate: vi.fn().mockResolvedValue(undefined) }));
    const insert = vi.fn(() => ({ values }));
    vi.doMock('@/lib/db', () => ({
      isDbAvailable: () => true,
      getDb: () => ({ insert }),
    }));

    const { storeDocuments } = await import('@/lib/services/document-store');
    const docket = {
      title: 'Doe v. Agency',
      link: 'https://www.courtlistener.com/docket/12345/',
      pubDate: '2026-08-01T00:00:00Z',
      type: 'court_opinion',
      metadata: { caseId: 'cl:12345' },
    };
    const opinion = {
      title: 'Opinion in Doe v. Agency',
      link: 'https://www.courtlistener.com/opinion/99/',
      pubDate: '2026-08-01T00:00:00Z',
      type: 'judicial_opinion',
      content: 'x'.repeat(200),
    };

    const stored = await storeDocuments([docket, opinion] as never[], 'civilLiberties');

    expect(upsertTrackedCasesFromItems).toHaveBeenCalledTimes(1);
    expect(stored).toBe(1); // only the opinion persisted as a document
    expect(insert).toHaveBeenCalledTimes(1);

    vi.doUnmock('@/lib/services/tracked-case-store');
    vi.doUnmock('@/lib/db');
    vi.resetModules();
  });
});
