/**
 * Query-time salience arm selection (#758): mechanical signals NOMINATE a
 * labeled shortlist from the weekly hot-entity index (#757); a shortlist
 * judge (hot-entity-judge.ts) PICKS the arms.
 *
 * Nomination blends three signals at different granularities:
 * 1. DOC JOIN (fine): entities whose mention docs appear in the pool.
 *    Capped — opinion-heavy pools cite dozens of co-indexed captions and
 *    would refill every slot with their own genre (measured, IM3).
 * 2. CATEGORY ENRICHMENT (coarse): entities sharing the categories this
 *    pool is UNUSUALLY about (pool share ÷ global share — raw counts are
 *    non-discriminating because civilLiberties tops every pool), ranked by
 *    breadth-weighted, baseline-collapsed recurrence. A support floor
 *    keeps one stray pool doc from crowning its category (measured, H3:
 *    a single mediaFreedom doc outranked lawEnforcement 10/60 because
 *    mediaFreedom's global share is tiny).
 * 3. GLOBAL BREADTH (era-wide): the era's top entities by breadth score
 *    regardless of category. Both pool channels are circular — they can
 *    only surface what the seed pool already discusses — so an era-defining
 *    entity the seed missed entirely (U.S. v. Comey for H3) needs a
 *    category-agnostic path to the judge, who filters topical fit.
 *    Since R-ALIAS-TAIL (#911) the two question-blind channels nominate
 *    only entities corroborated by the pool or the question, or specific
 *    (era-wide doc frequency under the cap), applied before their slots
 *    are ranked and sliced — see hot-entity-corroboration.ts.
 *
 * Six measured iterations showed mechanical ranking finds the right
 * NEIGHBORHOOD but mis-orders the final twelve; the judge resolves that as
 * a labeled multiple-choice (phrase-embedding similarity was evaluated and
 * rejected: junk statutes outscored J.G.G. v. Trump). Failure-tolerant at
 * every stage — judge failure falls back to the mechanical ranking; any
 * error returns the empty selection. Pure ranking halves exported for tests.
 */

import { isDbAvailable } from '@/lib/db';
import {
  BLIND_CHANNEL_DFT_PCT,
  blindChannelGateEnabled,
  corroboratedPhrases,
  gateChannelRows,
  isBlindChannel,
  NO_DROPS,
  resolveBlindDftCaps,
  uncorroboratedArms,
} from '@/lib/services/hot-entity-corroboration';
import type { EraCaps, BlindDrops } from '@/lib/services/hot-entity-corroboration';
import type { JudgeCandidate } from '@/lib/services/hot-entity-judge';
import { judgeShortlist } from '@/lib/services/hot-entity-judge';
import {
  nominateFromDb,
  queryEraDftPercentile,
  queryGlobalCategoryShares,
  SHORTLIST_GLOBAL,
} from '@/lib/services/hot-entity-nomination-queries';
import type { NominationRows } from '@/lib/services/hot-entity-nomination-queries';
import type {
  EntityEra,
  EntityRow,
  NominationChannel,
  PoolEntityRow,
} from '@/lib/services/hot-entity-ranking';
import { rankCategoryEntities, stratifyByClass } from '@/lib/services/hot-entity-ranking';
import {
  logSalienceGated,
  logSalienceOutcome,
  logSalienceSkipped,
} from '@/lib/services/hot-entity-trace';
import type { ValidatedAlias } from '@/lib/services/query-expansion-service';
import { topUpCorroboratedOnly } from '@/lib/services/salience-knobs';

export type {
  EntityRow,
  NominationChannel,
  PoolEntityRow,
} from '@/lib/services/hot-entity-ranking';
export {
  CATEGORY_CLASS_QUOTA,
  categoryFillScore,
  rankCategoryEntities,
  stratifyByClass,
} from '@/lib/services/hot-entity-ranking';

/** Judged-portion cap (#758): at most this many judge picks — or, on judge
 *  failure, mechanical stand-ins from the shortlist — run as arms. The
 *  judge's own quota is MAX_JUDGE_PICKS (salience-knobs.ts). */
export const MAX_SALIENCE_ARMS = 12;
/** Total arms after the mechanical top-up (#762: safe because every arm's
 *  pool share is bounded by the per-arm slot cap). */
export const MAX_SALIENCE_ARMS_ENUM = 20;
/** Top mechanical nominees ALWAYS run as arms, judge picks or not (#762). */
const MECHANICAL_TOP_UP = 8;
/** Doc-join floor: one passing mention in one pool doc is incidental. */
export const MIN_POOL_MENTIONS = 2;
const TOP_POOL_CATEGORIES = 2; // pool categories considered "dominant"
/** Shortlist slots offered to the judge, per nomination channel. */
const SHORTLIST_POOL = 15;
const SHORTLIST_CATEGORY = 40;
const SHORTLIST_QUESTION = 15; // question-conditioned channel slots (#776)
/** Pool support a category needs before it can rank as dominant: at least
 *  two docs, scaling with pool size (5%). One stray doc is never "what the
 *  pool is about" — measured, H3. */
export function categorySupportFloor(poolTotal: number): number {
  return Math.max(2, Math.ceil(poolTotal * 0.05));
}

const novelty = (r: { docFreqTerm: number; docFreqBaseline: number }) =>
  r.docFreqTerm / (1 + r.docFreqBaseline);

/** Rank pool-discussed entities: pool mentions first, novelty tiebreak,
 *  phrase for determinism. Pure; exported for tests. */
export function rankPoolEntities(
  rows: PoolEntityRow[],
  minMentions: number = MIN_POOL_MENTIONS,
): PoolEntityRow[] {
  return rows
    .filter((r) => r.poolMentions >= minMentions)
    .sort(
      (a, b) =>
        b.poolMentions - a.poolMentions ||
        novelty(b) - novelty(a) ||
        a.phrase.localeCompare(b.phrase),
    );
}

/** The pool's dominant categories by ENRICHMENT — pool share divided by
 *  global share. Raw counts are non-discriminating: civilLiberties is the
 *  corpus's largest category and tops every pool. Pure; exported for tests. */
export function dominantCategories(
  poolCategories: Array<string | null | undefined>,
  globalShares: Map<string, number>,
  top: number = TOP_POOL_CATEGORIES,
): string[] {
  const counts = new Map<string, number>();
  let total = 0;
  for (const c of poolCategories) {
    if (!c) continue;
    counts.set(c, (counts.get(c) ?? 0) + 1);
    total++;
  }
  if (total === 0) return [];
  const floor = categorySupportFloor(total);
  const qualified = [...counts.entries()].filter(([, n]) => n >= floor);
  const pool = qualified.length > 0 ? qualified : [...counts.entries()];
  return pool
    .map(([c, n]) => ({
      c,
      enrichment: n / total / (globalShares.get(c) ?? 1 / (globalShares.size || 1)),
    }))
    .sort((a, b) => b.enrichment - a.enrichment || a.c.localeCompare(b.c))
    .slice(0, top)
    .map((e) => e.c);
}

/** Nominate the labeled shortlist: doc-join hits first, category fill after,
 *  deduped, exclusion applied before any slot is consumed (phrases the seed
 *  already searched must not consume shortlist room — measured, IM3). Pure. */
export function nominateShortlist(
  poolRows: PoolEntityRow[],
  categoryRows: EntityRow[],
  excludePhrases: string[],
  globalRows: EntityRow[] = [],
  questionRows: EntityRow[] = [],
): EntityRow[] {
  const excluded = new Set(excludePhrases.map((ph) => ph.toLowerCase()));
  const shortlist: EntityRow[] = [];
  const seen = new Set<string>();
  // Channel order is also channel precedence (#799): a nominee reached by
  // several channels keeps the most question-conditioned one.
  const push = (channel: NominationChannel) => (r: EntityRow) => {
    const key = r.phrase.toLowerCase();
    if (excluded.has(key) || seen.has(key)) return;
    seen.add(key);
    shortlist.push({ ...r, channel });
  };
  rankPoolEntities(poolRows).slice(0, SHORTLIST_POOL).forEach(push('pool'));
  // #776: question-conditioned nominees precede the question-blind
  // channels — they carry the strongest relevance signal.
  questionRows.slice(0, SHORTLIST_QUESTION).forEach(push('question'));
  rankCategoryEntities(categoryRows).slice(0, SHORTLIST_CATEGORY).forEach(push('category'));
  rankCategoryEntities(globalRows).slice(0, SHORTLIST_GLOBAL).forEach(push('global'));
  return shortlist;
}

/** Judge-pick stability floor (#760): environment-sensitive shortlists made
 *  judge picks flip between local and prod (IM3 lost its caption picks).
 *  The top mechanical nominees from each channel are ALWAYS included —
 *  top-2 pool-discussed + top-2 breadth-ranked captions — so no single
 *  judge call can zero out either channel. Pure; exported for tests. */
export function stabilityFloor(shortlist: EntityRow[], poolCount: number): EntityRow[] {
  const fromPool = shortlist.slice(0, Math.min(2, poolCount));
  const inPool = new Set(fromPool.map((r) => r.phrase.toLowerCase()));
  const captions = shortlist
    .filter((r) => r.entityClass === 'caption' && !inPool.has(r.phrase.toLowerCase()))
    .slice(0, 2);
  return [...fromPool, ...captions];
}

/** Does this window carry any question-conditioned evidence — pool docs that
 *  mention tracked entities, or entities whose mention docs match the
 *  question's own words? Without either, the shortlist would be entirely
 *  category/global (question-blind) and the judge still returned 12 picks
 *  (`pool=0 q=0 → 12 picks`, the comparative-question baseline windows in
 *  the 2026-08-29 battery). No evidence → no salience arms (#806). Pure. */
export function hasQuestionEvidence(
  poolRows: PoolEntityRow[],
  questionRows: EntityRow[],
  minMentions: number = MIN_POOL_MENTIONS,
): boolean {
  return questionRows.length > 0 || poolRows.some((r) => r.poolMentions >= minMentions);
}

/** Nominees eligible for the judge-bypassing top-up: question-conditioned
 *  channels only. #799 barred `global` (the 2026-08-29 battery measured its
 *  breadth leaders riding into nearly every question's top-up); #911 bars
 *  `category` the same way — measured on dev 2026-09-17, the breadth-ranked
 *  category top-up handed the same eight entities to every question sharing
 *  dominant categories, which the gate alone could not touch. Question-blind
 *  nominees earn a seat from the judge. Untagged rows (older callers, tests)
 *  stay eligible. `SALIENCE_TOPUP_CORROBORATED=off` restores the #799 rule.
 *  Pure. */
export function topUpEligible(
  shortlist: EntityRow[],
  corroboratedOnly: boolean = topUpCorroboratedOnly(),
): EntityRow[] {
  return corroboratedOnly
    ? shortlist.filter((r) => !isBlindChannel(r.channel))
    : shortlist.filter((r) => r.channel !== 'global');
}

/** Floor ∪ judge picks ∪ top mechanical nominees (#762), deduped and
 *  capped. The judge orders the best twelve; the mechanical top-up ensures
 *  high-ranked nominees run as arms even when the judge passes them over —
 *  safe because every arm's pool share is slot-bounded. Pure; exported for
 *  tests via stabilityFloor. */
export function finalizeArms(
  shortlist: EntityRow[],
  picks: string[] | null,
  poolRows: PoolEntityRow[],
  excludePhrases: string[],
): ValidatedAlias[] {
  const byPhrase = new Map(shortlist.map((r) => [r.phrase.toLowerCase(), r]));
  // Judge failure → the mechanical ranking stands in (#758). Since #911
  // every shortlist row already passed the nomination gate, so this is
  // bounded the same way a judged window is.
  const judged =
    picks !== null
      ? picks.map((ph) => byPhrase.get(ph.toLowerCase())).filter((r): r is EntityRow => !!r)
      : shortlist;
  const excluded = new Set(excludePhrases.map((ph) => ph.toLowerCase()));
  const poolCount = rankPoolEntities(poolRows).filter(
    (r) => !excluded.has(r.phrase.toLowerCase()),
  ).length;
  const floor = stabilityFloor(shortlist, poolCount);
  // #774: the top-up ranks by breadth score across ALL channels, not
  // shortlist position — shortlist-head order re-amplified the pool
  // channel's genre floods (IM3's habeas mill outranked the due-process
  // canon 15 captions deep despite 4x lower breadth).
  // #799: the top-up never draws from the question-blind global channel.
  const topUp = rankCategoryEntities(topUpEligible(shortlist)).slice(0, MECHANICAL_TOP_UP);
  const seen = new Set<string>();
  const chosen: EntityRow[] = [];
  for (const r of [...floor, ...judged.slice(0, MAX_SALIENCE_ARMS), ...topUp]) {
    const k = r.phrase.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    chosen.push(r);
  }
  return chosen
    .slice(0, MAX_SALIENCE_ARMS_ENUM)
    .map((r) => ({ phrase: r.phrase, matches: r.ftsMatches }));
}

export interface SalienceSelection {
  arms: ValidatedAlias[];
  /** Judge picks (relevance order) in arms; composeRoster reserves seats. */
  judgedPhrases: string[];
  /** Arms from a question-blind channel with no corroboration (#913): no
   *  priority seat, smaller slot cap. */
  uncorroboratedPhrases: string[];
}

const NO_SALIENCE: SalienceSelection = { arms: [], judgedPhrases: [], uncorroboratedPhrases: [] };

interface GatedNominations {
  shortlist: EntityRow[];
  corroborated: Set<string>;
  dropped: BlindDrops;
  gated: boolean;
  dftCaps: EraCaps;
}

/** The window's blind-channel caps (#911): each era's percentile of the
 *  index, resolved once per window (memoized per data week underneath). */
async function blindDftCapsFor(eras: EntityEra[]): Promise<EraCaps> {
  const percentiles = await Promise.all(
    eras.map(
      async (era) => [era, await queryEraDftPercentile(era, BLIND_CHANNEL_DFT_PCT)] as const,
    ),
  );
  return resolveBlindDftCaps(Object.fromEntries(percentiles));
}

/** Nominate the shortlist with the blind-channel gate applied to the
 *  category and global rows BEFORE they are ranked and sliced (#911). */
function nominateGated(
  rows: NominationRows,
  excludePhrases: string[],
  dftCaps: EraCaps,
): GatedNominations {
  const gated = blindChannelGateEnabled();
  const corroborated = corroboratedPhrases(
    rows.poolRows,
    rows.questionRows.slice(0, SHORTLIST_QUESTION),
    MIN_POOL_MENTIONS,
  );
  const category = gated
    ? gateChannelRows(rows.categoryRows, corroborated, dftCaps)
    : { kept: rows.categoryRows, dropped: 0 };
  const global = gated
    ? gateChannelRows(rows.globalRows, corroborated, dftCaps)
    : { kept: rows.globalRows, dropped: 0 };
  const shortlist = nominateShortlist(
    rows.poolRows,
    stratifyByClass(category.kept),
    excludePhrases,
    global.kept,
    rows.questionRows,
  );
  const dropped = gated ? { category: category.dropped, global: global.dropped } : NO_DROPS;
  return { shortlist, corroborated, dropped, gated, dftCaps };
}

/** Nominate → gate → judge → finalize, for one question and era window. */
async function selectFromNominations(
  question: string,
  seedDocs: Array<{ id: number; category: string | null }>,
  excludePhrases: string[],
  eras: EntityEra[],
): Promise<SalienceSelection> {
  const dominant = dominantCategories(
    seedDocs.map((d) => d.category),
    await queryGlobalCategoryShares(),
  );
  const rows = await nominateFromDb(
    question,
    seedDocs.map((d) => d.id),
    dominant,
    eras,
  );
  if (!hasQuestionEvidence(rows.poolRows, rows.questionRows)) {
    logSalienceSkipped(eras, rows.poolRows.length);
    return NO_SALIENCE;
  }
  const dftCaps = blindChannelGateEnabled() ? await blindDftCapsFor(eras) : {};
  const nominations = nominateGated(rows, excludePhrases, dftCaps);
  if (nominations.shortlist.length === 0) {
    logSalienceGated(eras, nominations.dropped, dftCaps);
    return NO_SALIENCE;
  }
  return judgeAndFinalize(question, excludePhrases, { ...rows, eras, ...nominations });
}

/** Judge the gated shortlist, finalize the arms, log the outcome. */
async function judgeAndFinalize(
  question: string,
  excludePhrases: string[],
  ctx: NominationRows & GatedNominations & { eras: EntityEra[] },
): Promise<SalienceSelection> {
  const { shortlist } = ctx;
  const candidates: JudgeCandidate[] = shortlist.map((r) => ({
    phrase: r.phrase,
    entityClass: r.entityClass,
    categories: r.categories,
    docFreqTerm: r.docFreqTerm,
  }));
  const picks = await judgeShortlist(question, candidates);
  const arms = finalizeArms(shortlist, picks, ctx.poolRows, excludePhrases);
  logSalienceOutcome({
    eras: ctx.eras,
    poolRows: ctx.poolRows,
    questionRows: ctx.questionRows,
    shortlist,
    picks,
    arms,
    dropped: ctx.dropped,
    dftCaps: ctx.dftCaps,
  });
  const inArms = new Set(arms.map((a) => a.phrase.toLowerCase()));
  return {
    arms,
    judgedPhrases: (picks ?? []).filter((ph) => inArms.has(ph.toLowerCase())),
    // Tightening (#913) is defined only for gated nominees; with the gate
    // off the roster behaves exactly as before the sprint.
    uncorroboratedPhrases: ctx.gated ? uncorroboratedArms(arms, shortlist, ctx.corroborated) : [],
  };
}

export async function selectSalienceArms(
  question: string,
  seedDocs: Array<{ id: number; category: string | null }>,
  excludePhrases: string[],
  eras: EntityEra[],
): Promise<SalienceSelection> {
  if (!isDbAvailable() || seedDocs.length === 0 || eras.length === 0) return NO_SALIENCE;
  try {
    return await selectFromNominations(question, seedDocs, excludePhrases, eras);
  } catch (err) {
    console.warn('[hot-entity-selection] failed (continuing seed-only):', err);
    return NO_SALIENCE;
  }
}
