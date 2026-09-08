import { readFileSync } from 'node:fs';
import path from 'node:path';
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
    publishedAt: '2026-09-05',
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
    kind: 'forward',
    since: '2026-09-03T12:00:00Z',
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
    search_keys: ['Executive Order 14410'],
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

describe('tipwire judge prompt (#856, #863)', () => {
  it('forward system prompt asks what moved on the thread since the piece; carries the rules, rubric, and JSON contract', () => {
    const s = buildTipSystemPrompt('forward');
    expect(s).toContain('published AFTER the article');
    expect(s).toContain('since your piece on X, this appeared');
    for (const p of BANNED_TIP_PHRASES) expect(s).toContain(p);
    expect(s).toContain('exactly ONE document');
    expect(s).toContain('Default to no_tip');
    expect(s).toContain('CANNOT verify');
    expect(s).toContain('among these documents');
    expect(s).toContain('crackdown');
    expect(s).toContain('confidence: high = the specific claim is visible verbatim');
    expect(s).toContain('search_keys');
    expect(s).toContain('"verdict": "tip" | "no_tip"');
    expect(TIP_PROMPT_VERSION).toMatch(/^tip-\d{4}-\d{2}-\d{2}/);
  });

  it('contradiction system prompt asks for contradictions of the article body, not additions', () => {
    const s = buildTipSystemPrompt('contradiction');
    expect(s).toContain('PREDATE it');
    expect(s).toContain('Additions are NOT contradictions');
    expect(s).not.toContain('since your piece on X');
  });

  it('beat prompts have no article anchor: the role asks for a reportable development on the beat, the user prompt shows the beat week and flagged-docs heading, never a lede line', () => {
    const sys = buildTipSystemPrompt('beat');
    expect(sys).toContain('NO article anchor');
    expect(sys).toContain('have you seen this?');
    expect(sys).toContain('Flagged this week does not mean published this week');
    expect(sys).toContain('absence of headlines is NOT evidence the story is unwritten');
    expect(sys).not.toContain('since your piece on X');
    const u = buildTipUserPrompt(ctx({ kind: 'beat', since: '2026-09-07' }));
    expect(u).toContain('BEAT CHECK — no article anchor · week of 2026-09-07');
    expect(u).toContain('DOCUMENTS FLAGGED ON THIS BEAT (2');
    expect(u).not.toContain('Lede:');
    expect(u).not.toContain('ARTICLE');
    expect(u).toContain('- Unions sue over pay freeze');
  });

  it('a category beat check names every reporter, shows headlines per reporter, and marks feedless ones instead of implying silence (#876)', () => {
    const u = buildTipUserPrompt(
      ctx({
        kind: 'beat',
        since: '2026-09-07',
        beat: {
          categories: ['civilService'],
          reporters: [
            {
              name: 'Erich Wagner',
              outlet: 'Government Executive',
              hasFeed: true,
              recentTitles: ['Unions sue over pay freeze'],
            },
            { name: 'Eric Katz', outlet: 'NOTUS', hasFeed: true, recentTitles: [] },
            {
              name: 'Hannah Natanson',
              outlet: 'The Washington Post',
              hasFeed: false,
              recentTitles: [],
            },
          ],
        },
      }),
    );
    expect(u).toContain('REPORTERS ON THIS BEAT (');
    expect(u).toContain('  - Erich Wagner, Government Executive');
    expect(u).toContain(
      '  - Hannah Natanson, The Washington Post (no feed — recent headlines unknown)',
    );
    expect(u).toContain('RECENT HEADLINES BY THESE REPORTERS');
    expect(u).toContain('absence of headlines is NOT evidence the story is unwritten');
    expect(u).toContain('  Erich Wagner (Government Executive):\n    - Unions sue over pay freeze');
    expect(u).toContain('  Eric Katz (NOTUS):\n    (none stored)');
    expect(u).toContain(
      '  Hannah Natanson (The Washington Post):\n    (no feed — recent headlines unknown)',
    );
    expect(u).not.toContain('REPORTER: ');
    expect(u).not.toContain('THIS REPORTER ALSO RECENTLY PUBLISHED');
  });

  it('forward and contradiction prompts are byte-identical to the pre-R-TIPWIRE-4 fixture (no re-gate needed)', () => {
    // The fixture was rendered in UTC; formatDate is zone-sensitive for date-only publishedAt.
    const tz = process.env.TZ;
    process.env.TZ = 'UTC';
    const fixture = readFileSync(
      path.join(process.cwd(), '__tests__/fixtures/tipwire/prompts-forward-contradiction.txt'),
      'utf8',
    );
    const actual = [
      '### SYSTEM forward',
      buildTipSystemPrompt('forward'),
      '### USER forward',
      buildTipUserPrompt(ctx()),
      '### SYSTEM contradiction',
      buildTipSystemPrompt('contradiction'),
      '### USER contradiction',
      buildTipUserPrompt(
        ctx({ kind: 'contradiction', articleBody: 'Full body text here. '.repeat(10) }),
      ),
    ].join('\n');
    process.env.TZ = tz;
    expect(actual).toBe(fixture);
  });

  it('forward user prompt shows the article, recent titles, context, and docs labelled as published since the window start', () => {
    const u = buildTipUserPrompt(ctx());
    expect(u).toContain('REPORTER: Erich Wagner, Government Executive');
    expect(u).toContain('Lede: OPM issued a final rule');
    expect(u).toContain('- Unions sue over pay freeze');
    expect(u).toContain('civilService (week of 2026-08-31): status Elevated');
    expect(u).toContain('DOCUMENTS PUBLISHED SINCE Sep 3, 2026 (2');
    expect(u).toContain('[Doc 1 | ACTION | beat category] Rule 101');
    expect(u).toContain('AI Review Note (annotation — NOT document text): machine note');
    expect(u).not.toContain('Body excerpt');
  });

  it('contradiction user prompt includes the fetched body excerpt and labels docs as predating', () => {
    const u = buildTipUserPrompt(
      ctx({ kind: 'contradiction', articleBody: 'Full body text here. '.repeat(10) }),
    );
    expect(u).toContain('DOCUMENTS PREDATING THE ARTICLE');
    expect(u).toContain('Body excerpt (first 3000 characters): Full body text here.');
    const noBody = buildTipUserPrompt(ctx({ kind: 'contradiction', articleBody: null }));
    expect(noBody).toContain('Body: (not available');
  });

  it('flags a missing lede explicitly and lists no recent titles gracefully', () => {
    const u = buildTipUserPrompt(
      ctx({ article: { ...ctx().article, lede: null }, recentTitles: [] }),
    );
    expect(u).toContain('Lede: (not available');
    expect(u).toContain('(none found)');
  });

  it('truncates document content to the excerpt budget', () => {
    expect(formatDocsForTip([rdoc(1, { content: 'x'.repeat(5000) })]).length).toBeLessThan(2000);
  });

  it('parses fenced JSON with search keys, rejects two-sentence tips, out-of-range refs, and tip verdicts without a tip', () => {
    const ok = parseTipVerdict('```json\n' + TIP_JSON + '\n```', 2);
    expect(ok).toMatchObject({ ok: true });
    if (ok.ok) expect(ok.verdict.tip?.search_keys).toEqual(['Executive Order 14410']);
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

describe('tipwire judge (#856, #863)', () => {
  it('returns a tip mapped to the referenced document id, with search keys, tokens and one recorded call', async () => {
    configureAiCallBudget(null);
    const before = getAiCallCount();
    const r = await judgeArticle(ctx(), { provider: fakeProvider([TIP_JSON]), model: 'm' });
    expect(r.verdict).toBe('tip');
    expect(r.tip).toMatchObject({
      documentRef: 2,
      documentId: 102,
      confidence: 'medium',
      searchKeys: ['Executive Order 14410'],
    });
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
