import { describe, it, expect, vi } from 'vitest';
import {
  buildMetadata,
  inferSourceOrigin,
  storableDocumentItems,
} from '@/lib/services/document-store';

describe('storableDocumentItems', () => {
  it('excludes CL docket items — they route to tracked_cases, not documents', () => {
    // Mirrors the 2026-08-17 phantom alarm: 980 dockets + 68 storable docs
    // must yield expected=68, not 1048.
    const docket = { link: 'https://cl/docket/1', type: 'court_opinion' };
    const opinion = { link: 'https://cl/opinion/1', type: 'judicial_opinion' };
    const press = { link: 'https://doj/press/1', type: 'press_release' };
    const errored = { link: 'https://x/e', isError: true };
    const warned = { link: 'https://x/w', isWarning: true };
    const linkless = { type: 'press_release' };
    const items = [docket, opinion, press, errored, warned, linkless] as never[];
    expect(storableDocumentItems(items)).toEqual([opinion, press]);
  });
});

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

describe('storeExcludedDocuments (#891/#892 search-only rows)', () => {
  /** Insert mock that records each row and honours a "row already exists"
   *  set the way ON CONFLICT DO NOTHING does (returns no rows). */
  function mockInsertingDb(existingUrls: Set<string> = new Set(), anywhereUrls = existingUrls) {
    const rows: Array<Record<string, unknown>> = [];
    const conflictTargets: unknown[] = [];
    // The corpus path pre-checks URLs across every category (selectDistinct …
    // where inArray); answer with the URLs the test declares as stored anywhere.
    const selectDistinct = vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(async () => [...anywhereUrls].map((url) => ({ url }))),
      })),
    }));
    const values = vi.fn((row: Record<string, unknown>) => ({
      onConflictDoNothing: vi.fn((opts: { target: unknown }) => {
        conflictTargets.push(opts.target);
        return {
          returning: vi.fn(async () => {
            rows.push(row);
            return existingUrls.has(row.url as string) ? [] : [{ id: rows.length }];
          }),
        };
      }),
    }));
    const insert = vi.fn(() => ({ values }));
    vi.doMock('@/lib/db', () => ({
      isDbAvailable: () => true,
      getDb: () => ({ insert, selectDistinct }),
    }));
    return { rows, insert, conflictTargets, selectDistinct };
  }

  async function loadStore() {
    vi.resetModules();
    const mod = await import('@/lib/services/document-store');
    return mod.storeExcludedDocuments;
  }

  const frDrop = {
    title: 'Routine notice',
    link: 'https://fr.gov/routine',
    pubDate: '2026-09-01T00:00:00Z',
    type: 'Notice',
    content: 'x'.repeat(300),
  };

  it('stores an FR drop under its signal category with retrieval_relevant=false and counting scope intact', async () => {
    const db = mockInsertingDb();
    const storeExcludedDocuments = await loadStore();

    const stored = await storeExcludedDocuments([frDrop] as never[], 'mediaFreedom');

    expect(stored).toBe(1);
    expect(db.rows).toHaveLength(1);
    expect(db.rows[0]).toMatchObject({
      category: 'mediaFreedom',
      url: 'https://fr.gov/routine',
      retrievalRelevant: false,
      sourceOrigin: 'federal_register',
    });
    expect(db.rows[0].countingScope).not.toBe(false);
    vi.doUnmock('@/lib/db');
  });

  it('stores an unrouted document under corpus with BOTH analysis flags false', async () => {
    const db = mockInsertingDb();
    const storeExcludedDocuments = await loadStore();

    await storeExcludedDocuments([frDrop] as never[], 'corpus');

    expect(db.rows[0]).toMatchObject({
      category: 'corpus',
      retrievalRelevant: false,
      countingScope: false,
    });
    vi.doUnmock('@/lib/db');
  });

  it('never shadows a document that is evidence in another category with a corpus row', async () => {
    const db = mockInsertingDb(new Set(), new Set(['https://fr.gov/routine']));
    const storeExcludedDocuments = await loadStore();

    const stored = await storeExcludedDocuments([frDrop] as never[], 'corpus');

    expect(stored).toBe(0);
    expect(db.rows).toEqual([]);
    expect(db.selectDistinct).toHaveBeenCalledTimes(1);
    vi.doUnmock('@/lib/db');
  });

  it('never demotes an existing (url, category) row — insert-only, DO NOTHING on conflict', async () => {
    const db = mockInsertingDb(new Set(['https://fr.gov/routine']));
    const storeExcludedDocuments = await loadStore();

    const stored = await storeExcludedDocuments([frDrop] as never[], 'mediaFreedom');

    expect(stored).toBe(0);
    expect(db.insert).toHaveBeenCalledTimes(1);
    // Conflict target is the (url, category) key, not url alone.
    expect(db.conflictTargets[0]).toHaveLength(2);
    vi.doUnmock('@/lib/db');
  });

  it('skips unstorable items (errors, no link, docket entries) like storeDocuments does', async () => {
    const db = mockInsertingDb();
    const storeExcludedDocuments = await loadStore();

    const stored = await storeExcludedDocuments(
      [
        { ...frDrop, isError: true },
        { ...frDrop, link: undefined },
        { ...frDrop, type: 'court_opinion' },
      ] as never[],
      'mediaFreedom',
    );

    expect(stored).toBe(0);
    expect(db.rows).toEqual([]);
    vi.doUnmock('@/lib/db');
  });

  it('returns 0 without touching the database when it is unavailable', async () => {
    vi.doMock('@/lib/db', () => ({
      isDbAvailable: () => false,
      getDb: () => {
        throw new Error('should not be called');
      },
    }));
    const storeExcludedDocuments = await loadStore();

    expect(await storeExcludedDocuments([frDrop] as never[], 'corpus')).toBe(0);
    vi.doUnmock('@/lib/db');
    vi.resetModules();
  });
});
