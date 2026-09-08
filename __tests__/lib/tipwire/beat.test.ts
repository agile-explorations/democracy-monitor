import { describe, expect, it } from 'vitest';
import {
  BEAT_LOOKBACK_DAYS,
  BEAT_MAX_DOCS,
  beatAnchor,
  listBeatQueue,
  listBeatWeeks,
} from '@/lib/tipwire/beat-docs';
import type { BeatLoaders } from '@/lib/tipwire/beat-docs';
import { rankBeatDocs, retrieveBeatDocs } from '@/lib/tipwire/match-beat';
import { getReporter } from '@/lib/tipwire/roster';
import type { ReporterEntry } from '@/lib/tipwire/roster';
import type { ResearchDocument } from '@/lib/types/search';

const must = (id: string): ReporterEntry => {
  const r = getReporter(id);
  if (!r) throw new Error(id);
  return r;
};

function doc(id: number, category: string): ResearchDocument {
  return {
    id,
    title: `Doc ${id}`,
    content: 'x',
    url: null,
    publishedAt: '2026-08-30',
    sourceType: 'Rule',
    tier: 'action',
    sourceOrigin: 'federal_register',
    caseId: null,
    category,
    cosineSimilarity: 0,
    finalScore: null,
    documentClass: null,
    p2Assessment: 'clearly_concerning',
    p2ErosionType: null,
    p2Confidence: 0.9,
    p2Summary: 'note',
  };
}

const NOW = new Date('2026-09-09T12:00:00Z'); // a Wednesday; Monday = 2026-09-07

function loaders(over: Partial<BeatLoaders> = {}) {
  const calls: string[] = [];
  const l: BeatLoaders = {
    lastBeatWeek: async () => null,
    citedDocIds: async () => [],
    flaggedDocs: async (cats, from, to, exclude, limit) => {
      calls.push(`${cats.join('+')} ${from}..${to ?? '∞'} -${exclude.join(',')} lim${limit}`);
      return [];
    },
    ...over,
  };
  return { l, calls };
}

describe('beat anchor + queue (#869)', () => {
  it('builds a stable in-memory anchor that is never an article', () => {
    const a = beatAnchor(must('wagner'), '2026-09-07');
    expect(a).toMatchObject({
      reporterId: 'wagner',
      articleKey: 'beat:wagner:2026-09-07',
      url: null,
      lede: null,
      ledeSource: 'none',
      publishedAt: '2026-09-07T00:00:00.000Z',
      attribution: 'beat',
    });
    expect(a.title).toContain('week of 2026-09-07');
  });

  it('poll queue: starts from the last beat week + 1 day (or the lookback), excludes cited docs, caps at BEAT_MAX_DOCS, skips empty reporters, and attributes the newest week', async () => {
    const { l, calls } = loaders({
      lastBeatWeek: async (id) => (id === 'wagner' ? '2026-08-31' : null),
      citedDocIds: async (id) => (id === 'wagner' ? [7, 8] : []),
      flaggedDocs: async (cats, from, to, exclude, limit) => {
        calls.push(`${cats.join('+')} ${from}..${to ?? '∞'} -${exclude.join(',')} lim${limit}`);
        return cats.includes('civilService')
          ? [
              { id: 1, weekOf: '2026-09-07' },
              { id: 2, weekOf: '2026-08-31' },
            ]
          : [];
      },
    });
    const q = await listBeatQueue([must('wagner'), must('rosenberg')], NOW, l);
    expect(q).toHaveLength(1);
    expect(q[0]).toMatchObject({ weekOf: '2026-09-07', docIds: [1, 2] });
    expect(q[0].reporter.id).toBe('wagner');
    expect(calls[0]).toBe(`civilService 2026-09-01..∞ -7,8 lim${BEAT_MAX_DOCS}`);
    const lookback = new Date(NOW.getTime() - BEAT_LOOKBACK_DAYS * 24 * 3600 * 1000)
      .toISOString()
      .slice(0, 10);
    expect(calls[1]).toBe(`immigrationEnforcement ${lookback}..∞ - lim${BEAT_MAX_DOCS}`);
  });

  it('dry-run queue: one item per reporter × Monday over the last N weeks, bounded windows, empty weeks skipped', async () => {
    const calls: string[] = [];
    const { l } = loaders({
      flaggedDocs: async (cats, from, to, exclude, limit) => {
        calls.push(`${cats.join('+')} ${from}..${to ?? '∞'} -${exclude.join(',')} lim${limit}`);
        return from === '2026-08-31' ? [] : [{ id: 9, weekOf: from }];
      },
    });
    const q = await listBeatWeeks([must('katz')], 3, NOW, l);
    expect(q.map((x) => x.weekOf)).toEqual(['2026-09-07', '2026-08-24']);
    expect(calls).toEqual([
      'civilService+fiscal 2026-09-07..2026-09-14 - lim10',
      'civilService+fiscal 2026-08-31..2026-09-07 - lim10',
      'civilService+fiscal 2026-08-24..2026-08-31 - lim10',
    ]);
  });
});

describe('beat retrieval (#869)', () => {
  it('keeps queue order, marks beat categories, drops unknown ids, and anchors structural context on the beat week — no query, embed, or rerank', async () => {
    const ranked = rankBeatDocs(
      [doc(2, 'fiscal'), doc(1, 'civilService'), doc(3, 'elections')],
      [1, 2, 99, 3],
      ['civilService'],
    );
    expect(ranked.map((d) => [d.id, d.priorBoosted])).toEqual([
      [1, true],
      [2, false],
      [3, false],
    ]);
    expect(ranked[0].matchScore).toBeGreaterThan(ranked[2].matchScore);

    const weeks: string[] = [];
    const r = await retrieveBeatDocs(
      must('wagner'),
      { kind: 'beat', docIds: [1, 2], weekOf: '2026-09-07' },
      {
        now: NOW,
        byIds: async (ids) => ids.map((id) => doc(id, id === 1 ? 'civilService' : 'fiscal')),
        structural: async (cats, weekOf) => {
          weeks.push(weekOf);
          return cats.map((category) => ({
            category,
            weekOf,
            status: 'Elevated',
            documentCount: 3,
            actionConfirmed: 1,
            discussionConfirmed: 0,
            silenceElevated: false,
          }));
        },
      },
    );
    expect(r.kind).toBe('beat');
    expect(r.window).toEqual({ from: '2026-09-07', to: '2026-09-14' });
    expect(r.docs.map((d) => d.id)).toEqual([1, 2]);
    expect(r.meta).toMatchObject({ retrieved: 2, reranked: 0, boosted: 1, excluded: 0 });
    expect(weeks).toEqual(['2026-09-07']);
    expect(r.queryMode).toBe('title+categories');

    const empty = await retrieveBeatDocs(
      must('wagner'),
      { kind: 'beat' },
      {
        now: NOW,
        byIds: async () => {
          throw new Error('should not load with no ids');
        },
        structural: async () => [],
      },
    );
    expect(empty.docs).toEqual([]);
  });
});
