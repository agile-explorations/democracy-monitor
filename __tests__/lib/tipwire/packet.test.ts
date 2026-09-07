import { describe, expect, it } from 'vitest';
import { configureAiCallBudget } from '@/lib/services/ai-call-budget';
import type { DiscoveredArticle } from '@/lib/tipwire/acquire';
import type { JudgeResult } from '@/lib/tipwire/judge';
import {
  TipDecisionsFileSchema,
  buildPacketMarkdown,
  decisionsTemplate,
  etHour,
  renderScore,
  scoreDecisions,
} from '@/lib/tipwire/packet';
import { recentTitlesFor, runPipeline } from '@/lib/tipwire/pipeline';
import type { PipelineItem } from '@/lib/tipwire/pipeline';
import { getReporter } from '@/lib/tipwire/roster';
import type { ReporterEntry } from '@/lib/tipwire/roster';
import type { AIProvider } from '@/lib/types/ai';
import type { ResearchDocument } from '@/lib/types/search';

function art(
  key: string,
  reporterId: string,
  publishedAt: string | null,
  lede: string | null = 'A lede.',
): DiscoveredArticle {
  return {
    reporterId,
    outlet: 'X',
    articleKey: key,
    url: key,
    title: `Title ${key.slice(-1)}`,
    lede,
    ledeSource: lede ? 'og' : 'none',
    publishedAt,
    feedStrategy: 'rss',
    attribution: 'dc:creator',
    coauthorCount: 0,
    rawMeta: {},
  };
}

function judge(verdict: JudgeResult['verdict'], tip = false): JudgeResult {
  return {
    verdict,
    model: 'm',
    promptVersion: 'tip-test',
    tokensIn: 10,
    tokensOut: 5,
    latencyMs: 100,
    calls: 1,
    ...(tip
      ? {
          tip: {
            sentences: ['One.', 'Two.', 'Three.'],
            specificClaim: 'claim',
            whyUnreportedAppears: 'why',
            confidence: 'medium' as const,
            searchKeys: [],
            documentRef: 1,
            documentId: 9,
          },
        }
      : { reasonsNoTip: 'topic only' }),
  };
}

function item(article: DiscoveredArticle, j: JudgeResult, reactive = false): PipelineItem {
  return {
    article,
    reporter: { id: article.reporterId, name: article.reporterId, outlet: 'X' },
    reactive,
    kind: 'forward',
    since: article.publishedAt,
    recentTitles: [],
    match: {
      query: 'q',
      queryMode: 'title+lede',
      kind: 'forward',
      window: { from: '2026-09-01', to: '2026-09-08' },
      docs: [
        {
          ref: 1,
          id: 9,
          title: 'Doc nine',
          category: 'civilService',
          tier: 'action',
          url: 'https://d/9',
          priorBoosted: true,
        },
      ],
      structural: [],
      meta: { retrieved: 1, reranked: 1, boosted: 1, excluded: 0, minedAliases: 0, retrievalMs: 1 },
    },
    judge: j,
    skippedNoDocs: false,
  };
}

const meta = { since: '2026-08-24', generatedAt: '2026-09-07T00:00:00Z', reporters: ['a', 'b'] };

const items: PipelineItem[] = [
  item(art('https://x/a1', 'a', '2026-09-03T12:00:00Z'), judge('tip', true), true),
  item(art('https://x/a2', 'a', '2026-09-02T20:00:00Z'), judge('tip', true)),
  item(art('https://x/a3', 'a', '2026-09-01T13:00:00Z'), judge('no_tip')),
  item(art('https://x/b1', 'b', '2026-09-03T02:00:00Z', null), judge('tip', true)),
  item(art('https://x/b2', 'b', null), judge('parse_failed')),
];

describe('tipwire packet (#857, #864)', () => {
  it('renders proposed tips first with reactive on top and the forward scope, title-only matches under their own heading, then the rest', () => {
    const md = buildPacketMarkdown(items, meta);
    const iTips = md.indexOf('# PROPOSED TIPS (2)');
    const iTitleOnly = md.indexOf('# ⚠ TITLE-ONLY MATCHES (1)');
    const iRest = md.indexOf('# NO TIP / FAILED (2)');
    expect(iTips).toBeGreaterThan(0);
    expect(iTitleOnly).toBeGreaterThan(iTips);
    expect(iRest).toBeGreaterThan(iTitleOnly);
    expect(md.indexOf('REACTIVE')).toBeLessThan(md.indexOf('Title 2'));
    expect(md).toContain('## PROPOSED TIP (since 2026-09-03)');
    expect(md).toContain('Cited document: [Doc 1] Doc nine — https://d/9 (id 9)');
    expect(md).toContain('would_send');
    expect(md).toContain('Lede: (none — title-only match)');
  });

  it('decisions template has one null-verdict row per article and round-trips the schema', () => {
    const t = decisionsTemplate(items, meta);
    expect(t.items).toHaveLength(5);
    expect(t.items.every((d) => d.verdict === null && d.note === '')).toBe(true);
    expect(TipDecisionsFileSchema.safeParse(t).success).toBe(true);
    expect(
      TipDecisionsFileSchema.safeParse({ ...t, items: [{ ...t.items[0], verdict: 'maybe' }] })
        .success,
    ).toBe(false);
  });

  it('scores precision over decided proposed tips, counts wrong_fact, and flags an unmeasurable gate', () => {
    const t = decisionsTemplate(items, meta);
    t.items[0].verdict = 'would_send';
    t.items[1].verdict = 'would_not';
    const two = scoreDecisions(t, items);
    expect(two).toMatchObject({
      proposed: 3,
      decidedProposed: 2,
      wouldSend: 1,
      precision: 0.5,
      measurable: false,
      pass: false,
    });
    t.items[3].verdict = 'would_send';
    const three = scoreDecisions(t, items);
    expect(three).toMatchObject({ decidedProposed: 3, wouldSend: 2, measurable: true, pass: true });
    expect(three.precision).toBeCloseTo(2 / 3);
    t.items[3].verdict = 'wrong_fact';
    const bad = scoreDecisions(t, items);
    expect(bad).toMatchObject({ wrongFact: 1, pass: false });
    expect(bad.noTipRate).toBeCloseTo(1 / 4);
    expect(bad.byReporter.find((r) => r.reporter === 'b')).toMatchObject({
      articles: 2,
      proposed: 1,
      wrongFact: 1,
    });
    t.items[2].note = 'the OPM rule was a tip';
    expect(scoreDecisions(t, items).missedTipNotes).toEqual([
      { articleKey: 'https://x/a3', note: 'the OPM rule was a tip' },
    ]);
  });

  it('measures the share of articles published before 10:00 ET for the cron-slot decision', () => {
    expect(etHour('2026-09-03T12:00:00Z')).toBe(8);
    expect(etHour('2026-09-03T20:00:00Z')).toBe(16);
    const s = scoreDecisions(decisionsTemplate(items, meta), items);
    expect(s.publishedBefore10EtShare).toBeCloseTo(0.5);
    expect(s.recommendMorningSlot).toBe(true);
    expect(renderScore(s).join('\n')).toContain('ADD the 13:30 UTC morning cron slot');
    expect(renderScore(s).join('\n')).toContain('GATE UNMEASURABLE');
  });
});

describe('tipwire pipeline (#857, #862)', () => {
  const must = (id: string): ReporterEntry => {
    const r = getReporter(id);
    if (!r) throw new Error(id);
    return r;
  };
  const provider: AIProvider = {
    name: 'fake',
    isAvailable: () => true,
    complete: async () => ({
      content: '{"verdict":"no_tip","reasons_no_tip":"topic"}',
      model: 'fake',
      tokensUsed: { input: 1, output: 1 },
      latencyMs: 1,
    }),
  };
  const someDoc: ResearchDocument = {
    id: 7,
    title: 'Doc',
    content: 'x',
    url: null,
    publishedAt: '2026-09-05',
    sourceType: 'Rule',
    tier: 'action',
    sourceOrigin: 'federal_register',
    caseId: null,
    category: 'civilService',
    cosineSimilarity: 0.5,
    finalScore: null,
    documentClass: null,
    p2Assessment: null,
    p2ErosionType: null,
    p2Confidence: null,
    p2Summary: null,
  };
  const withDocs = {
    embed: async () => null,
    search: async () => ({ documents: [someDoc], minedAliases: [] }),
    rerank: async (_q: string, d: ResearchDocument[]) => d,
    enrich: async () => undefined,
    structural: async () => [],
  };
  const empty = { ...withDocs, search: async () => ({ documents: [], minedAliases: [] }) };

  it('builds same-story titles from the reporter’s other articles within 14 days', () => {
    const all = [
      art('https://x/1', 'wagner', '2026-09-03T00:00:00Z'),
      art('https://x/2', 'wagner', '2026-08-25T00:00:00Z'),
      art('https://x/3', 'wagner', '2026-07-01T00:00:00Z'),
      art('https://x/4', 'katz', '2026-09-02T00:00:00Z'),
    ];
    expect(recentTitlesFor(all[0], all)).toEqual(['Title 2']);
  });

  it('judges with the scope the caller provides; a window with no documents costs no judge call', async () => {
    const reporters = new Map([['wagner', must('wagner')]]);
    configureAiCallBudget(null);
    const seen: string[] = [];
    const out = await runPipeline(
      [
        art('https://x/1', 'wagner', '2026-09-03T00:00:00Z'),
        art('https://x/2', 'wagner', '2026-09-02T00:00:00Z'),
      ],
      reporters,
      {
        match: withDocs,
        judge: { provider },
        now: new Date('2026-09-03T06:00:00Z'),
        scopeFor: (a) => ({ kind: 'forward', since: a.publishedAt }),
        onItem: (it) => seen.push(`${it.kind}:${it.judge.verdict}`),
      },
    );
    expect(seen).toEqual(['forward:no_tip', 'forward:no_tip']);
    expect(out.items[0]).toMatchObject({
      reactive: true,
      since: '2026-09-03T00:00:00Z',
      skippedNoDocs: false,
      recentTitles: ['Title 2'],
    });

    const quiet = await runPipeline([art('https://x/1', 'wagner', null)], reporters, {
      match: empty,
      judge: { provider },
    });
    expect(quiet.items[0]).toMatchObject({
      skippedNoDocs: true,
      judge: { verdict: 'no_tip', calls: 0 },
    });
  });

  it('passes the fetched article body only in contradiction mode', async () => {
    const reporters = new Map([['wagner', must('wagner')]]);
    const bodies: string[] = [];
    await runPipeline([art('https://x/1', 'wagner', '2026-09-03T00:00:00Z')], reporters, {
      match: withDocs,
      judge: { provider },
      scopeFor: () => ({ kind: 'contradiction' }),
      articleBody: async (a) => {
        bodies.push(a.articleKey);
        return 'body';
      },
    });
    await runPipeline([art('https://x/2', 'wagner', '2026-09-03T00:00:00Z')], reporters, {
      match: withDocs,
      judge: { provider },
      articleBody: async (a) => {
        bodies.push(a.articleKey);
        return 'body';
      },
    });
    expect(bodies).toEqual(['https://x/1']);
  });

  it('records errors per article and returns partial results on a cap trip instead of throwing', async () => {
    const reporters = new Map([['wagner', must('wagner')]]);
    const failing = {
      ...withDocs,
      search: async () => {
        throw new Error('db down');
      },
    };
    const errs = await runPipeline([art('https://x/1', 'wagner', null)], reporters, {
      match: failing,
      judge: { provider },
    });
    expect(errs.items[0].judge).toMatchObject({ verdict: 'error', error: 'db down' });

    configureAiCallBudget(1);
    const partial = await runPipeline(
      [
        art('https://x/1', 'wagner', null),
        art('https://x/2', 'wagner', null),
        art('https://x/3', 'wagner', null),
      ],
      reporters,
      { match: withDocs, judge: { provider } },
    );
    expect(partial.capTripped).toBe(true);
    expect(partial.items).toHaveLength(1);
    expect(partial.unjudged.map((a) => a.articleKey)).toEqual(['https://x/2', 'https://x/3']);
    configureAiCallBudget(null);
  });
});
