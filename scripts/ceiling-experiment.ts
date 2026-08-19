/**
 * Ceiling experiment (#750 follow-up, 2026-08-19): what CORE pass rate is
 * achievable with CURRENT pre-rerank retrieval if nothing is cut at 60→30
 * and the answer is allowed to enumerate?
 *
 * Per question: depth-60 pre-rerank pool via searchResearchWithMeta (prod
 * DB, read-only), prod single-pass prompt over ALL 60 docs + an
 * enumeration addendum, Claude Sonnet 4.6 with maxTokens 8192. Answers and
 * docs land in .eval-completeness/ceiling-20260819/ in the eval capture
 * schema, scored by eval-completeness --skip-capture --skip-corpus.
 *
 * Spend precheck: exactly 14 synthesis calls (hard-bounded by the question
 * list), ~65k in / ~6k out each ≈ $4-5 total.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'fs';
import path from 'path';
import { getProvider } from '@/lib/ai/provider';
import { buildSinglePassPrompt } from '@/lib/services/research-prompts';
import { searchResearchWithMeta } from '@/lib/services/search-service';
import type { ResearchTierFilter } from '@/lib/services/search-service';

const CEILING_DOCS = 60;
const MAX_TOKENS = 8192;
const MODEL = 'claude-sonnet-4-6';

const ENUMERATION_ADDENDUM = [
  '',
  'ADDITIONAL INSTRUCTION FOR THIS ANSWER: This question calls for a',
  'comprehensive enumeration. In the EXPERT answer, name every distinct',
  'responsive government action found in the documents — court cases by',
  'caption, executive orders and proclamations by number and title,',
  'memoranda and rules by their formal names, bills by number. Group them',
  'by kind, use compact list form where that helps, and do not omit a',
  'responsive document merely to keep the answer short.',
].join('\n');

interface EvalQuestion {
  id: string;
  q: string;
  params: Record<string, string>;
}

async function run() {
  const checklist = JSON.parse(
    readFileSync(path.join(process.cwd(), 'scripts/completeness-checklists.json'), 'utf8'),
  ) as { questions: EvalQuestion[] };
  const outDir = path.join(process.cwd(), '.eval-completeness/ceiling-20260819');
  mkdirSync(outDir, { recursive: true });
  const claude = getProvider('anthropic');
  if (!claude.isAvailable()) throw new Error('ANTHROPIC_API_KEY not configured');

  let totalIn = 0;
  let totalOut = 0;
  for (const q of checklist.questions) {
    const t0 = Date.now();
    const tier = (q.params.tier as ResearchTierFilter | undefined) ?? 'all';
    const { documents } = await searchResearchWithMeta(
      q.q,
      CEILING_DOCS,
      undefined,
      q.params.dateFrom,
      q.params.dateTo,
      tier,
    );
    const searchMs = Date.now() - t0;
    const prompt = buildSinglePassPrompt(q.q, documents) + ENUMERATION_ADDENDUM;
    const result = await claude.complete(prompt, {
      model: MODEL,
      maxTokens: MAX_TOKENS,
      systemPrompt:
        'You are a research analyst answering questions about U.S. government actions. ' +
        'Your answers are grounded exclusively in the provided government documents. ' +
        'Apply the self-verification checklist before finalizing your answer.',
    });
    totalIn += result.tokensUsed.input;
    totalOut += result.tokensUsed.output;
    writeFileSync(path.join(outDir, `${q.id}.docs.json`), JSON.stringify({ documents }, null, 1));
    writeFileSync(path.join(outDir, `${q.id}.answer.md`), result.content);
    console.log(
      `${q.id}: docs=${documents.length} searchMs=${searchMs} ` +
        `in=${result.tokensUsed.input} out=${result.tokensUsed.output} answer=${result.content.length}ch`,
    );
  }
  console.log(`TOTAL tokens in=${totalIn} out=${totalOut}`);
  process.exit(0);
}

run().catch((err) => {
  console.error('[ceiling-experiment] failed:', err);
  process.exit(1);
});
