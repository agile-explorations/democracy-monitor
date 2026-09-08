import { describe, expect, it } from 'vitest';
import type { DiscoveredArticle } from '@/lib/tipwire/acquire';
import {
  PROMPT_DOCS,
  WATCH_DAYS,
  applyCategoryPrior,
  buildQuery,
  retrievalWindow,
  retrieveForArticle,
  watchUntil,
} from '@/lib/tipwire/match';
import { getReporter } from '@/lib/tipwire/roster';
import type { ReporterEntry } from '@/lib/tipwire/roster';
import type { ResearchDocument } from '@/lib/types/search';

const must = (id: string): ReporterEntry => {
  const r = getReporter(id);
  if (!r) throw new Error(id);
  return r;
};

function doc(id: number, category: string, finalScore: number): ResearchDocument {
  return {
    id,
    title: `Doc ${id}`,
    content: 'x',
    url: null,
    publishedAt: '2026-09-01',
    sourceType: 'Rule',
    tier: 'action',
    sourceOrigin: 'federal_register',
    caseId: null,
    category,
    cosineSimilarity: finalScore / 10,
    finalScore,
    documentClass: null,
    p2Assessment: null,
    p2ErosionType: null,
    p2Confidence: null,
    p2Summary: null,
  };
}

const article: DiscoveredArticle = {
  reporterId: 'katz',
  outlet: 'NOTUS',
  articleKey: 'https://www.notus.org/agencies/x',
  url: 'https://www.notus.org/agencies/x',
  title: 'OPM orders agencies to cut probationary staff',
  lede: 'A memo tells agencies to identify probationary employees for removal.',
  ledeSource: 'jsonld',
  publishedAt: '2026-09-03T15:00:00Z',
  feedStrategy: 'author-page',
  attribution: 'article:author',
  coauthorCount: 0,
  rawMeta: {},
};

const NOW = new Date('2026-09-07T00:00:00Z');

describe('tipwire matching — pure (#855, #862)', () => {
  it('builds title+lede queries, and title+category-names when the lede is missing', () => {
    expect(buildQuery(article, must('katz'))).toEqual({
      query: `${article.title} — ${article.lede}`,
      mode: 'title+lede',
    });
    const noLede = buildQuery({ ...article, lede: null }, must('katz'));
    expect(noLede.mode).toBe('title+categories');
    expect(noLede.query.startsWith(article.title + ' (')).toBe(true);
    expect(noLede.query).toMatch(/\)$/);
  });

  it('forward window runs from the article (or the later last check) to tomorrow', () => {
    expect(retrievalWindow('2026-09-03T15:00:00Z', NOW)).toEqual({
      from: '2026-09-03',
      to: '2026-09-08',
    });
    expect(
      retrievalWindow('2026-09-03T15:00:00Z', NOW, {
        kind: 'forward',
        since: '2026-09-05T21:30:00Z',
      }),
    ).toEqual({ from: '2026-09-05', to: '2026-09-08' });
    // a "since" earlier than the article never widens the window backwards
    expect(
      retrievalWindow('2026-09-03T15:00:00Z', NOW, {
        kind: 'forward',
        since: '2026-08-01T00:00:00Z',
      }).from,
    ).toBe('2026-09-03');
    expect(retrievalWindow(null, NOW)).toEqual({ from: '2026-09-07', to: '2026-09-08' });
  });

  it('contradiction window is 84 days before the article up to the article date', () => {
    expect(retrievalWindow('2026-09-03T15:00:00Z', NOW, { kind: 'contradiction' })).toEqual({
      from: '2026-06-11',
      to: '2026-09-03',
    });
  });

  it('beat window is the beat week (Monday to next Monday), defaulting to the current week', () => {
    expect(retrievalWindow(null, NOW, { kind: 'beat', weekOf: '2026-08-31' })).toEqual({
      from: '2026-08-31',
      to: '2026-09-07',
    });
    expect(retrievalWindow(null, NOW, { kind: 'beat' })).toEqual({
      from: '2026-09-07',
      to: '2026-09-14',
    });
  });

  it('watches expire WATCH_DAYS after publication; undated articles are not watched', () => {
    expect(WATCH_DAYS).toBe(21);
    expect(watchUntil('2026-09-03T15:00:00Z')?.toISOString()).toBe('2026-09-24T15:00:00.000Z');
    expect(watchUntil(null)).toBeNull();
  });

  it('category prior is rank-based: boosts a bounded number of places, never drops, keeps non-prior order, identity at weight 0', () => {
    const docs = [
      doc(1, 'fiscal', 0),
      doc(2, 'elections', 0),
      doc(3, 'civilService', 0),
      doc(4, 'military', 0),
    ];
    const strong = applyCategoryPrior(docs, ['civilService'], 0.6);
    expect(strong.map((d) => d.id)).toEqual([3, 1, 2, 4]);
    expect(strong.filter((d) => d.priorBoosted).map((d) => d.id)).toEqual([3]);
    expect(strong.filter((d) => !d.priorBoosted).map((d) => d.id)).toEqual([1, 2, 4]);
    expect(applyCategoryPrior(docs, ['civilService'], 0.3).map((d) => d.id)).toEqual([1, 3, 2, 4]);
    expect(applyCategoryPrior(docs, ['civilService']).map((d) => d.id)).toEqual([1, 2, 3, 4]);
    expect(applyCategoryPrior(docs, ['nothing'], 0.9)).toHaveLength(4);
    expect(applyCategoryPrior([], ['fiscal'])).toEqual([]);
  });
});

describe('tipwire matching — retrieval flow with injected deps (#855, #862)', () => {
  const pool = () =>
    Array.from({ length: 30 }, (_, i) =>
      doc(i + 1, i % 3 === 0 ? 'civilService' : 'fiscal', 30 - i),
    );

  it('forward: searches from the article forward, drops already-cited docs, reranks, boosts, trims, enriches, and anchors context on now', async () => {
    const seen: string[] = [];
    const r = await retrieveForArticle(
      article,
      must('katz'),
      {
        now: NOW,
        embed: async () => [0.1, 0.2],
        search: async (q, topK, emb, from, to) => {
          seen.push(`search:${topK}:${emb?.length}:${from}:${to}`);
          return { documents: pool(), minedAliases: [{ phrase: 'OPM', matches: 5 }] };
        },
        rerank: async (_q, docs, keep) => docs.slice(0, keep),
        enrich: async (docs) => {
          for (const d of docs) d.queryExcerpt = `passage for ${d.id}`;
        },
        structural: async (cats, weekOf) => [
          {
            category: cats[0],
            weekOf,
            status: 'Elevated',
            documentCount: 14,
            actionConfirmed: 1,
            discussionConfirmed: 1,
            silenceElevated: false,
          },
        ],
      },
      { kind: 'forward', since: '2026-09-05T21:30:00Z', excludeDocIds: [1, 2] },
    );
    expect(seen).toEqual(['search:60:2:2026-09-05:2026-09-08']);
    expect(r.kind).toBe('forward');
    expect(r.docs).toHaveLength(PROMPT_DOCS);
    expect(r.docs.some((d) => d.id === 1 || d.id === 2)).toBe(false);
    expect(r.docs.every((d) => d.queryExcerpt?.startsWith('passage'))).toBe(true);
    expect(r.meta).toMatchObject({ reranked: 20, minedAliases: 1, excluded: 2 });
    expect(r.structural[0]).toMatchObject({ weekOf: '2026-09-07', status: 'Elevated' });
  });

  it('contradiction: searches before the article and anchors context on the article week', async () => {
    const seen: string[] = [];
    const r = await retrieveForArticle(
      article,
      must('katz'),
      {
        now: NOW,
        embed: async () => null,
        search: async (_q, _k, _e, from, to) => {
          seen.push(`${from}..${to}`);
          return { documents: pool().slice(0, 3), minedAliases: [] };
        },
        rerank: async (_q, docs) => docs,
        enrich: async () => undefined,
        structural: async (cats, weekOf) => [
          {
            category: cats[0],
            weekOf,
            status: null,
            documentCount: null,
            actionConfirmed: null,
            discussionConfirmed: null,
            silenceElevated: null,
          },
        ],
      },
      { kind: 'contradiction' },
    );
    expect(seen).toEqual(['2026-06-11..2026-09-03']);
    expect(r.kind).toBe('contradiction');
    expect(r.structural[0].weekOf).toBe('2026-08-31');
  });

  it('returns an empty match when nothing is retrieved (no rerank call needed)', async () => {
    const r = await retrieveForArticle(article, must('katz'), {
      embed: async () => null,
      search: async () => ({ documents: [], minedAliases: [] }),
      rerank: async () => {
        throw new Error('should not rerank an empty pool');
      },
      enrich: async () => undefined,
      structural: async () => [],
    });
    expect(r.docs).toEqual([]);
    expect(r.meta).toMatchObject({ retrieved: 0, reranked: 0, boosted: 0, excluded: 0 });
  });
});
