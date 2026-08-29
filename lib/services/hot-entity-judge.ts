/**
 * Shortlist judge (#758): pick which of the mechanically-nominated hot
 * entities actually bear on a question.
 *
 * The mechanical signals (doc-join, category enrichment, breadth-weighted
 * recurrence) reliably rank the right NEIGHBORHOOD of ~50 candidates but
 * mis-order the final twelve — six measured iterations of similarity- and
 * frequency-based ranking all placed the marquee entities around positions
 * 15-25. Choosing 12 from 50 LABELED candidates is a plain relevance
 * judgment the model makes from the strings alone ("J.G.G. v. Trump —
 * court case — immigration" vs a fiscal statute, for a due-process
 * question); no world knowledge is required, so the knowledge cutoff that
 * broke LLM expansion is irrelevant here.
 *
 * Hallucination-guarded (picks must come from the shortlist), cached per
 * (question, data week), failure-tolerant (null → caller uses the
 * mechanical ranking).
 */

import { createHash } from 'crypto';
import { getProvider } from '@/lib/ai/provider';
import { cacheGet, cacheSet } from '@/lib/cache';
import { CacheKeys } from '@/lib/cache/keys';
import { MODEL_ROSTER } from '@/lib/data/model-roster';
import { dataWeekStamp } from '@/lib/services/arm-cache';

const JUDGE_MODEL = MODEL_ROSTER.retrievalHelpers.id;
const JUDGE_CACHE_TTL = 7 * 86400;
export const MAX_JUDGE_PICKS = 12;

export interface JudgeCandidate {
  phrase: string;
  entityClass: string;
  categories: string[];
  docFreqTerm: number;
}

/** Numbered, labeled shortlist for the judge. Pure; exported for tests. */
export function buildJudgePrompt(question: string, candidates: JudgeCandidate[]): string {
  const list = candidates
    .map(
      (c, i) =>
        `${i + 1}. "${c.phrase}" — ${c.entityClass} — categories: ${c.categories.join(', ')} — ${c.docFreqTerm} mentions this term`,
    )
    .join('\n');
  return (
    `A research system answers questions from U.S. government documents. For the ` +
    `question below, choose which of these tracked entities a researcher would run ` +
    `as targeted follow-up searches — entities whose own documents likely answer ` +
    `part of the question. Many entities postdate your knowledge — an unfamiliar ` +
    `case caption or program name is EXPECTED, not suspect: judge by entity class ` +
    `and category fit, never by name recognition. Court cases matter for questions ` +
    `about litigation, rights, and process even when you cannot recall the case. ` +
    `Choose ONLY from the list, copy phrases EXACTLY, most ` +
    `relevant first, at most ${MAX_JUDGE_PICKS}. Skip entities that are merely from ` +
    `the same broad policy area. An entity that would fit most questions about this ` +
    `era — an omnibus law, a marquee executive order, a task force — does not fit ` +
    `this one unless the question is about it. Return ONLY a JSON array of phrase strings.\n\n` +
    `Question: "${question}"\n\nEntities:\n${list}`
  );
}

/** Parse + hallucination-guard: picks must be shortlist members. Pure. */
export function parseJudgeResponse(content: string, candidatePhrases: string[]): string[] | null {
  try {
    const raw = content.replace(/```json|```/g, '').trim();
    const arr = JSON.parse(raw) as unknown;
    if (!Array.isArray(arr)) return null;
    const allowed = new Map(candidatePhrases.map((p) => [p.toLowerCase(), p]));
    const picks: string[] = [];
    const seen = new Set<string>();
    for (const item of arr) {
      if (typeof item !== 'string') continue;
      const canonical = allowed.get(item.trim().toLowerCase());
      if (!canonical || seen.has(canonical)) continue;
      seen.add(canonical);
      picks.push(canonical);
      if (picks.length >= MAX_JUDGE_PICKS) break;
    }
    return picks;
  } catch {
    console.warn('[hot-entity-judge] unparseable model response (mechanical fallback)');
    return null;
  }
}

function hashJudgeKey(question: string, candidatePhrases: string[]): string {
  // The shortlist is part of the key (v3); v4 = the #806 prompt. Picks cached against one
  // shortlist replayed against a different one during the 2026-08-24 gate
  // runs — the question channel's nominees changed but the stale picks won.
  const shortlistHash = createHash('sha256')
    .update([...candidatePhrases].sort().join('|').toLowerCase())
    .digest('hex')
    .slice(0, 12);
  return createHash('sha256')
    .update(['v4', dataWeekStamp(), question.toLowerCase().trim(), shortlistHash].join('|'))
    .digest('hex')
    .slice(0, 16);
}

/**
 * Judge the shortlist. Returns the picked phrases (possibly empty — a
 * legitimate "none of these fit"), or null on any failure so the caller
 * falls back to the mechanical ranking.
 */
export async function judgeShortlist(
  question: string,
  candidates: JudgeCandidate[],
): Promise<string[] | null> {
  const provider = getProvider('openai');
  if (!provider.isAvailable() || candidates.length === 0) return null;
  const key = CacheKeys.searchEntityJudge(
    hashJudgeKey(
      question,
      candidates.map((c) => c.phrase),
    ),
  );
  const cached = await cacheGet<string[]>(key);
  if (cached) return cached;
  try {
    const result = await provider.complete(buildJudgePrompt(question, candidates), {
      temperature: 0,
      model: JUDGE_MODEL,
    });
    const picks = parseJudgeResponse(
      result.content,
      candidates.map((c) => c.phrase),
    );
    if (picks) await cacheSet(key, picks, JUDGE_CACHE_TTL);
    return picks;
  } catch (err) {
    console.warn('[hot-entity-judge] failed (falling back to mechanical ranking):', err);
    return null;
  }
}
