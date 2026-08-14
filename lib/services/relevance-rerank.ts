/**
 * Relevance re-rank for research retrieval (#594).
 *
 * Vector similarity confuses topical adjacency with bearing on the question:
 * "inspector general firings" filled half the context slots with misconduct
 * reports written BY inspectors general. One cheap model pass scores each
 * candidate's bearing on the question; the caller overfetches (2×) and keeps
 * the top slice.
 *
 * Failure policy: any error, timeout, or unparseable response falls back to
 * the original vector order — re-ranking can only ever improve on the
 * baseline, never break retrieval (#593 lesson). Owner-approved standing
 * cost ≈ $0.001–0.002/query (gpt-4o-mini); tokens are logged per query.
 */

import { getProvider } from '@/lib/ai/provider';
import { composeTieredResults } from '@/lib/data/document-tiers';
import type { ResearchDocument } from '@/lib/services/search-service';

const RERANK_MODEL = 'gpt-4o-mini';
const RERANK_TIMEOUT_MS = 8_000;
const MAX_CANDIDATES = 60;
const EXCERPT_CHARS = 160;

const SYSTEM_PROMPT =
  'You rank government documents by how directly they bear on a research question. ' +
  'A document bears on the question when its content would be cited in an answer — ' +
  'topical adjacency (same agency, same vocabulary, different subject) does not count. ' +
  'Respond with ONLY a JSON array of the document numbers in descending order of ' +
  'relevance, e.g. [3,1,7]. Include every number exactly once.';

function buildPrompt(question: string, docs: ResearchDocument[]): string {
  const lines = docs.map((d, i) => {
    const date = (d.publishedAt ?? 'undated').slice(0, 10);
    const excerpt = (d.content ?? '').slice(0, EXCERPT_CHARS).replace(/\s+/g, ' ');
    return `${i + 1}. [${date} · ${d.sourceType}] ${d.title}\n   ${excerpt}`;
  });
  return `QUESTION: ${question}\n\nDOCUMENTS:\n${lines.join('\n')}`;
}

/** Parse "[3,1,7]" (possibly wrapped in prose/fences) into a valid permutation, else null. */
export function parseRanking(text: string, count: number): number[] | null {
  // Primary shape: a bracketed array anywhere in the reply. Fallback shape
  // (~25% of live calls degraded to vector order before this, 2026-08-14):
  // a bare digits-and-commas line ("3, 1, 7") with the brackets omitted or
  // truncated. Prose with embedded numbers stays rejected — a bare line
  // must contain ONLY numbers and separators to qualify.
  const match = text.match(/\[[\d,\s]+\]/) ?? text.match(/^\s*\d+(?:\s*,\s*\d+)+\s*,?\s*$/m);
  if (!match) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(`[${match[0].replace(/[[\]]/g, '').replace(/,\s*$/, '')}]`);
    // nosemgrep: opengrep.no-silent-catch — parse probe; the caller logs the fallback with the raw text's disposition
  } catch {
    return null;
  }
  if (!Array.isArray(parsed)) return null;
  const nums = parsed.filter((n): n is number => Number.isInteger(n) && n >= 1 && n <= count);
  const unique = [...new Set(nums)];
  // Tolerate omissions (append missing in original order) but not garbage.
  if (unique.length < Math.ceil(count / 2)) return null;
  for (let i = 1; i <= count; i++) if (!unique.includes(i)) unique.push(i);
  return unique;
}

/** Rank all candidates by bearing-on-question; original order on any failure. */
async function rankAll(question: string, docs: ResearchDocument[]): Promise<ResearchDocument[]> {
  const provider = getProvider('openai');
  if (!provider.isAvailable()) return docs;

  const candidates = docs.slice(0, MAX_CANDIDATES);
  try {
    const result = await Promise.race([
      provider.complete(buildPrompt(question, candidates), {
        systemPrompt: SYSTEM_PROMPT,
        temperature: 0,
        maxTokens: 400,
        model: RERANK_MODEL,
      }),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('rerank timeout')), RERANK_TIMEOUT_MS),
      ),
    ]);
    const ranking = parseRanking(result.content, candidates.length);
    if (!ranking) {
      console.warn(
        '[rerank] unparseable ranking — falling back to vector order. Raw head:',
        JSON.stringify(result.content.slice(0, 200)),
      );
      return docs;
    }
    console.log(
      `[rerank] ranked ${candidates.length} docs · tokens in/out: ${result.tokensUsed?.input ?? '?'}/${result.tokensUsed?.output ?? '?'}`,
    );
    return [...ranking.map((n) => candidates[n - 1]), ...docs.slice(MAX_CANDIDATES)];
  } catch (err) {
    console.warn('[rerank] failed — falling back to vector order:', (err as Error).message);
    return docs;
  }
}

/**
 * Re-rank candidates by bearing-on-question and keep the top `keep`.
 * Falls back to the first `keep` of the original order on any failure.
 */
export async function rerankByRelevance(
  question: string,
  docs: ResearchDocument[],
  keep: number,
): Promise<ResearchDocument[]> {
  if (docs.length <= keep) return docs;
  return (await rankAll(question, docs)).slice(0, keep);
}

/**
 * Tier-balanced re-rank (#707): rank everything, then compose the kept set
 * with the standard action/discussion share so the re-rank cannot wipe a
 * tier out of an era's slots. The FW4 incident: per-era retrieval composed
 * balanced pools, but the tier-blind re-rank returned the 2025 era's 15
 * slots as all-action — the synthesis then reported congressional responses
 * missing that exist in the corpus. Within each tier, re-rank order rules.
 */
export async function rerankTierBalanced(
  question: string,
  docs: ResearchDocument[],
  keep: number,
): Promise<ResearchDocument[]> {
  const ranked = docs.length <= keep ? docs : await rankAll(question, docs);
  return composeTieredResults(
    ranked.filter((d) => d.tier === 'action'),
    ranked.filter((d) => d.tier === 'discussion'),
    keep,
  );
}
