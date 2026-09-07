import { describe, expect, it } from 'vitest';
import { configureAiCallBudget, getAiCallCount } from '@/lib/services/ai-call-budget';
import { judgeArticle } from '@/lib/tipwire/judge';
import type { RankedDoc, StructuralLine } from '@/lib/tipwire/match';
import {
  BANNED_TIP_PHRASES,
  TIP_PROMPT_VERSION,
  buildTipSystemPrompt,
  buildTipUserPrompt,
  formatDocsForTip,
  parseTipVerdict,
} from '@/lib/tipwire/prompt';
import type { TipJudgeContext } from '@/lib/tipwire/prompt';
import { getReporter } from '@/lib/tipwire/roster';
import type { AIProvider } from '@/lib/types/ai';

function rdoc(id: number, extra: Partial<RankedDoc> = {}): RankedDoc {
  return {
    id,
    title: `Rule ${id}`,
    content: 'The Office of Personnel Management issues a final rule effective October 1, 2026.',
    url: `https://example.gov/${id}`,
    publishedAt: '2026-08-20',
    sourceType: 'Rule',
    tier: 'action',
    sourceOrigin: 'federal_register',
    caseId: null,
    category: 'civilService',
    cosineSimilarity: 0.4,
    finalScore: null,
    documentClass: null,
    p2Assessment: null,
    p2ErosionType: null,
    p2Confidence: null,
    p2Summary: null,
    priorBoosted: true,
    matchScore: 1,
    ...extra,
  };
}

const structural: StructuralLine[] = [
  {
    category: 'civilService',
    weekOf: '2026-08-31',
    status: 'Elevated',
    documentCount: 14,
    actionConfirmed: 1,
    discussionConfirmed: 1,
    silenceElevated: false,
  },
];

function ctx(overrides: Partial<TipJudgeContext> = {}): TipJudgeContext {
  const reporter = getReporter('wagner');
  if (!reporter) throw new Error('wagner');
  return {
    reporter,
    article: {
      title: 'OPM finalizes probationary rule',
      lede: 'OPM issued a final rule on probationary periods.',
      publishedAt: '2026-09-03T12:00:00Z',
      url: 'https://www.govexec.com/x',
      coauthorCount: 0,
    },
    recentTitles: ['Unions sue over pay freeze'],
    structural,
    docs: [rdoc(101), rdoc(102, { p2Assessment: 'clearly_concerning', p2Summary: 'machine note' })],
    ...overrides,
  };
}

const TIP_JSON = JSON.stringify({
  verdict: 'tip',
  tip: {
    sentences: ['One.', 'Two.', 'Three.'],
    document_ref: 2,
    specific_claim: 'effective October 1, 2026',
    why_unreported_appears: 'The lede does not mention the effective date; verify before sending.',
    confidence: 'medium',
  },
});

function fakeProvider(responses: string[]): AIProvider {
  let i = 0;
  return {
    name: 'fake',
    isAvailable: () => true,
    complete: async () => ({
      content: responses[Math.min(i++, responses.length - 1)],
      model: 'fake-model',
      tokensUsed: { input: 100, output: 20 },
      latencyMs: 5,
    }),
  };
}

describe('tipwire judge prompt (#856)', () => {
  it('system prompt carries the concreteness rule, the banned outputs, honesty and tone clauses, and the JSON contract', () => {
    const s = buildTipSystemPrompt();
    for (const p of BANNED_TIP_PHRASES) expect(s).toContain(p);
    expect(s).toContain('exactly ONE document');
    expect(s).toContain('Default to no_tip');
    expect(s).toContain('CANNOT verify');
    expect(s).toContain('among these documents');
    expect(s).toContain('crackdown');
    expect(s).toContain('"verdict": "tip" | "no_tip"');
    expect(TIP_PROMPT_VERSION).toMatch(/^tip-\d{4}-\d{2}-\d{2}/);
  });

  it('user prompt shows the article, same-story titles, structural lines, and numbered docs with annotations marked', () => {
    const u = buildTipUserPrompt(ctx());
    expect(u).toContain('REPORTER: Erich Wagner, Government Executive');
    expect(u).toContain('Lede: OPM issued a final rule');
    expect(u).toContain('- Unions sue over pay freeze');
    expect(u).toContain('civilService (week of 2026-08-31): status Elevated');
    expect(u).toContain('[Doc 1 | ACTION | beat category] Rule 101');
    expect(u).toContain('[Doc 2 | ACTION | beat category] Rule 102');
    expect(u).toContain('AI Review Note (annotation — NOT document text): machine note');
  });

  it('flags a missing lede explicitly and lists no recent titles gracefully', () => {
    const u = buildTipUserPrompt(
      ctx({ article: { ...ctx().article, lede: null }, recentTitles: [] }),
    );
    expect(u).toContain('Lede: (not available');
    expect(u).toContain('(none found)');
  });

  it('truncates document content to the excerpt budget', () => {
    const long = rdoc(1, { content: 'x'.repeat(5000) });
    expect(formatDocsForTip([long]).length).toBeLessThan(2000);
  });

  it('parses fenced JSON, rejects two-sentence tips, out-of-range refs, and tip verdicts without a tip', () => {
    expect(parseTipVerdict('```json\n' + TIP_JSON + '\n```', 2)).toMatchObject({ ok: true });
    expect(parseTipVerdict(TIP_JSON, 1)).toEqual({ ok: false, reason: 'ref_out_of_range' });
    const two = JSON.parse(TIP_JSON);
    two.tip.sentences = ['One.', 'Two.'];
    expect(parseTipVerdict(JSON.stringify(two), 2)).toEqual({ ok: false, reason: 'invalid_shape' });
    expect(parseTipVerdict('{"verdict":"tip"}', 2)).toEqual({ ok: false, reason: 'missing_tip' });
    expect(parseTipVerdict('{"verdict":"no_tip","reasons_no_tip":"topic only"}', 2)).toMatchObject({
      ok: true,
      verdict: { verdict: 'no_tip' },
    });
    expect(parseTipVerdict('nonsense', 2)).toEqual({ ok: false, reason: 'unparseable' });
  });
});

describe('tipwire judge (#856)', () => {
  it('returns a tip mapped to the referenced document id, with tokens and one recorded call', async () => {
    configureAiCallBudget(null);
    const before = getAiCallCount();
    const r = await judgeArticle(ctx(), { provider: fakeProvider([TIP_JSON]), model: 'm' });
    expect(r.verdict).toBe('tip');
    expect(r.tip).toMatchObject({ documentRef: 2, documentId: 102, confidence: 'medium' });
    expect(r.tip?.sentences).toHaveLength(3);
    expect(r).toMatchObject({
      model: 'm',
      promptVersion: TIP_PROMPT_VERSION,
      calls: 1,
      tokensIn: 100,
    });
    expect(getAiCallCount() - before).toBe(1);
  });

  it('retries once at a warmer temperature when the first response is unparseable', async () => {
    configureAiCallBudget(null);
    const before = getAiCallCount();
    const r = await judgeArticle(ctx(), {
      provider: fakeProvider([
        'not json',
        '{"verdict":"no_tip","reasons_no_tip":"topic overlap only"}',
      ]),
    });
    expect(r.verdict).toBe('no_tip');
    expect(r.reasonsNoTip).toBe('topic overlap only');
    expect(r.calls).toBe(2);
    expect(getAiCallCount() - before).toBe(2);
  });

  it('gives up as parse_failed after the retry, keeping a bounded head of the raw text', async () => {
    const r = await judgeArticle(ctx(), {
      provider: fakeProvider(['still not json ' + 'y'.repeat(500)]),
    });
    expect(r.verdict).toBe('parse_failed');
    expect(r.calls).toBe(2);
    expect(r.rawHead?.length).toBeLessThanOrEqual(200);
  });

  it('reports a provider failure as an error verdict rather than throwing', async () => {
    const broken: AIProvider = {
      name: 'broken',
      isAvailable: () => true,
      complete: async () => {
        throw new Error('overloaded');
      },
    };
    const r = await judgeArticle(ctx(), { provider: broken });
    expect(r).toMatchObject({ verdict: 'error', error: 'overloaded', calls: 1 });
    const off: AIProvider = {
      name: 'off',
      isAvailable: () => false,
      complete: async () => {
        throw new Error('x');
      },
    };
    expect((await judgeArticle(ctx(), { provider: off })).verdict).toBe('error');
  });
});
