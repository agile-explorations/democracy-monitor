/**
 * Pool-hygiene metrics (#803) — the pure half of scripts/retrieval-hygiene.ts.
 *
 * Every quality instrument before this one (eval checklists, prewarm, the
 * golden guard) ran on the same fourteen questions and scored whether
 * checklist items were present ANYWHERE in the pool. None looked at what a
 * reader sees first, and none used a question nobody had tuned on. The
 * 2026-08-29 battery (12 novel + 19 outreach questions) found the served
 * top-10 was 30–40% alias-only documents and that 67 aliases rode ≥4
 * unrelated questions each. These metrics are truth-free — no matchers to
 * write, nothing to over-fit — which is what makes them cheap to run on a
 * rotating, never-tuned-on bank.
 */

export interface HygieneDoc {
  id: number;
  cosineSimilarity: number;
  matchedAlias?: string | null;
  provenance?: 'seed' | 'arm' | null;
  title?: string;
}

export interface HygieneCapture {
  id: string;
  q: string;
  /** Wall-clock of the docsOnly request that returned documents (ms). */
  ms: number | null;
  docs: HygieneDoc[];
  alsoSearched: string[];
  strata: string[] | null;
  error?: string;
}

export interface QuestionMetrics {
  id: string;
  docs: number;
  /** Share of the first ten citations that entered through an arm slot
   *  (provenance 'arm', or — for captures predating provenance — cosine 0). */
  top10ArmShare: number;
  /** Mean cosine of the first ten citations (0-cosine docs count as 0). */
  top10MeanCosine: number;
  aliases: number;
  strata: string[] | null;
  ms: number | null;
}

export interface RunMetrics {
  questions: QuestionMetrics[];
  /** Documents that appear in ≥ `docRecurrenceMin` different pools. */
  recurringDocs: Array<{ id: number; title: string; questions: string[] }>;
  /** Aliases searched on ≥ `aliasShareMin` different questions. */
  sharedAliases: Array<{ alias: string; questions: string[] }>;
  /** Captures with zero documents or an error. */
  emptyPools: string[];
  meanTop10ArmShare: number;
  meanTop10Cosine: number;
}

export interface HygieneThresholds {
  /** Gate: mean top-10 cosine across the run — the headline (owner, 2026-08-29):
   *  arm share penalizes relevant arm docs (IM1's 287(g) hits), cosine does not. */
  minTop10Cosine: number;
  /** Advisory-level gate: mean top-10 arm share across the run (0–1). */
  maxTop10ArmShare: number;
  /** Gate: aliases shared by ≥ aliasShareMin questions. */
  maxSharedAliases: number;
  /** Gate: documents recurring in ≥ docRecurrenceMin pools. */
  maxRecurringDocs: number;
  docRecurrenceMin: number;
  aliasShareMin: number;
}

/** Thresholds (#803, re-based #806): the 2026-08-29 baseline measured
 *  cosine 0.30 / arm share 36% / 67 shared aliases / 84 recurring docs on 31
 *  questions; v1.18.1 reached 0.49 / 19% with the tail unchanged. */
export const DEFAULT_THRESHOLDS: HygieneThresholds = {
  minTop10Cosine: 0.45,
  maxTop10ArmShare: 0.3,
  maxSharedAliases: 10,
  maxRecurringDocs: 25,
  docRecurrenceMin: 3,
  aliasShareMin: 4,
};

const TOP_N = 10;

export function isArmDoc(d: HygieneDoc): boolean {
  return d.provenance ? d.provenance === 'arm' : d.cosineSimilarity === 0;
}

export function questionMetrics(c: HygieneCapture): QuestionMetrics {
  const top = c.docs.slice(0, TOP_N);
  const n = Math.max(1, top.length);
  return {
    id: c.id,
    docs: c.docs.length,
    top10ArmShare: top.filter(isArmDoc).length / n,
    top10MeanCosine: top.reduce((s, d) => s + (d.cosineSimilarity || 0), 0) / n,
    aliases: c.alsoSearched.length,
    strata: c.strata,
    ms: c.ms,
  };
}

/** Whole-run metrics over a set of captures. Pure. */
export function runMetrics(
  captures: HygieneCapture[],
  t: HygieneThresholds = DEFAULT_THRESHOLDS,
): RunMetrics {
  const ok = captures.filter((c) => !c.error && c.docs.length > 0);
  const questions = ok.map(questionMetrics);
  const byDoc = new Map<number, { title: string; questions: Set<string> }>();
  const byAlias = new Map<string, Set<string>>();
  for (const c of ok) {
    for (const d of c.docs) {
      const e = byDoc.get(d.id) ?? { title: d.title ?? '', questions: new Set<string>() };
      e.questions.add(c.id);
      byDoc.set(d.id, e);
    }
    for (const a of c.alsoSearched) {
      const s = byAlias.get(a) ?? new Set<string>();
      s.add(c.id);
      byAlias.set(a, s);
    }
  }
  const recurringDocs = [...byDoc.entries()]
    .filter(([, e]) => e.questions.size >= t.docRecurrenceMin)
    .map(([id, e]) => ({ id, title: e.title, questions: [...e.questions].sort() }))
    .sort((a, b) => b.questions.length - a.questions.length || a.id - b.id);
  const sharedAliases = [...byAlias.entries()]
    .filter(([, s]) => s.size >= t.aliasShareMin)
    .map(([alias, s]) => ({ alias, questions: [...s].sort() }))
    .sort((a, b) => b.questions.length - a.questions.length || a.alias.localeCompare(b.alias));
  const mean = (xs: number[]) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : 0);
  return {
    questions,
    recurringDocs,
    sharedAliases,
    emptyPools: captures.filter((c) => c.error || c.docs.length === 0).map((c) => c.id),
    meanTop10ArmShare: mean(questions.map((q) => q.top10ArmShare)),
    meanTop10Cosine: mean(questions.map((q) => q.top10MeanCosine)),
  };
}

/** Gate verdict: every failing threshold, named. Empty = pass. */
export function gateFailures(m: RunMetrics, t: HygieneThresholds = DEFAULT_THRESHOLDS): string[] {
  const out: string[] = [];
  if (m.meanTop10Cosine < t.minTop10Cosine)
    out.push(`top-10 mean cosine ${m.meanTop10Cosine.toFixed(2)} < ${t.minTop10Cosine.toFixed(2)}`);
  if (m.meanTop10ArmShare > t.maxTop10ArmShare)
    out.push(`top-10 arm share ${pct(m.meanTop10ArmShare)} > ${pct(t.maxTop10ArmShare)}`);
  if (m.sharedAliases.length > t.maxSharedAliases)
    out.push(
      `${m.sharedAliases.length} aliases shared by ≥${t.aliasShareMin} questions > ${t.maxSharedAliases}`,
    );
  if (m.recurringDocs.length > t.maxRecurringDocs)
    out.push(
      `${m.recurringDocs.length} documents in ≥${t.docRecurrenceMin} pools > ${t.maxRecurringDocs}`,
    );
  if (m.emptyPools.length > 0) out.push(`empty pools: ${m.emptyPools.join(', ')}`);
  return out;
}

const pct = (x: number) => `${(x * 100).toFixed(0)}%`;

/** Console rendering. */
export function renderRun(m: RunMetrics, label = 'hygiene'): string[] {
  const lines = [
    `[${label}] ${m.questions.length} questions — top-10 arm share ${pct(m.meanTop10ArmShare)}, ` +
      `top-10 mean cosine ${m.meanTop10Cosine.toFixed(2)}, shared aliases ${m.sharedAliases.length}, ` +
      `recurring docs ${m.recurringDocs.length}, empty pools ${m.emptyPools.length}`,
  ];
  for (const q of m.questions) {
    lines.push(
      `  ${q.id.padEnd(16)} n=${String(q.docs).padStart(2)} top10arm=${pct(q.top10ArmShare).padStart(4)} ` +
        `cos=${q.top10MeanCosine.toFixed(2)} aliases=${String(q.aliases).padStart(2)} ` +
        `strata=${q.strata ? q.strata.join('/') : '-'} ${q.ms != null ? `${(q.ms / 1000).toFixed(0)}s` : ''}`,
    );
  }
  for (const a of m.sharedAliases.slice(0, 15))
    lines.push(`  alias x${a.questions.length}: ${a.alias}`);
  for (const d of m.recurringDocs.slice(0, 15))
    lines.push(`  doc x${d.questions.length}: #${d.id} ${d.title.slice(0, 70)}`);
  return lines;
}

/** Per-question deltas between two runs (B − A). */
export function diffRuns(a: RunMetrics, b: RunMetrics): string[] {
  const byId = new Map(a.questions.map((q) => [q.id, q]));
  const lines = [
    `top-10 arm share ${pct(a.meanTop10ArmShare)} → ${pct(b.meanTop10ArmShare)}; ` +
      `shared aliases ${a.sharedAliases.length} → ${b.sharedAliases.length}; ` +
      `recurring docs ${a.recurringDocs.length} → ${b.recurringDocs.length}`,
  ];
  for (const q of b.questions) {
    const prev = byId.get(q.id);
    if (!prev) {
      lines.push(`  ${q.id}: new`);
      continue;
    }
    lines.push(
      `  ${q.id.padEnd(16)} top10arm ${pct(prev.top10ArmShare)} → ${pct(q.top10ArmShare)}  ` +
        `cos ${prev.top10MeanCosine.toFixed(2)} → ${q.top10MeanCosine.toFixed(2)}  ` +
        `aliases ${prev.aliases} → ${q.aliases}`,
    );
  }
  return lines;
}
