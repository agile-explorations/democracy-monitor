/**
 * AI-verdict political symmetry — the swap audit (#772), pure half.
 *
 * The Pass-2 "departure" rate differs sharply by era (Trump 2017–18 ≈ 30%,
 * Biden 2021–22 ≈ 6.5%, current term ≈ 47% on 2026-08-28). Whether that is
 * the documentary record or the reviewer is a testable question: take
 * reviewed documents, mechanically exchange the administration-identifying
 * tokens, re-run the verdict, and measure how often it flips — against a
 * same-text re-run control that measures the model's own draw-to-draw
 * noise. This module holds the token map, the swap, the sampling filter and
 * the summary statistics; the CLI (scripts/audit-verdict-symmetry.ts) does
 * the I/O under the AI call budget.
 *
 * Deliberately narrow token map: presidents' names, the vice presidents by
 * title, and the party names only when used as party names. Executive-order
 * numbers, dates, agency heads and cabinet officers are left alone — a
 * document dated 2025 that names "President Biden" is exactly the
 * counterfactual we want the reviewer to judge on its text.
 */

/** Ordered: multi-word forms first so "Donald J. Trump" is not half-swapped. */
export const ADMINISTRATION_TOKEN_MAP: ReadonlyArray<readonly [string, string]> = [
  ['Donald J. Trump', 'Joseph R. Biden, Jr.'],
  ['Joseph R. Biden, Jr.', 'Donald J. Trump'],
  ['Joseph R. Biden', 'Donald J. Trump'],
  ['Donald Trump', 'Joe Biden'],
  ['Joe Biden', 'Donald Trump'],
  ['President Trump', 'President Biden'],
  ['President Biden', 'President Trump'],
  ['Trump administration', 'Biden administration'],
  ['Biden administration', 'Trump administration'],
  ['Trump Administration', 'Biden Administration'],
  ['Biden Administration', 'Trump Administration'],
  ['Vice President Vance', 'Vice President Harris'],
  ['Vice President Harris', 'Vice President Vance'],
  ['Republican Party', 'Democratic Party'],
  ['Democratic Party', 'Republican Party'],
  ['Trump', 'Biden'],
  ['Biden', 'Trump'],
];

/** Collision-proof placeholder (control characters never occur in document text). */
const PLACEHOLDER = (i: number) => `\u0000SWAP${i}\u0000`;

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Exchange every administration-identifying token in both directions at
 * once (two-phase: tokens → placeholders → replacements, so a swapped
 * "Biden" is never swapped back to "Trump"). Word-boundary, case-sensitive.
 */
export function swapAdministrationTokens(text: string): string {
  let out = text;
  // Letter-lookarounds rather than \b: tokens ending in "." ("Jr.") have
  // no word boundary before a following space.
  ADMINISTRATION_TOKEN_MAP.forEach(([from], i) => {
    out = out.replace(
      new RegExp(`(?<![A-Za-z])${escapeRegExp(from)}(?![A-Za-z])`, 'g'),
      PLACEHOLDER(i),
    );
  });
  ADMINISTRATION_TOKEN_MAP.forEach(([, to], i) => {
    out = out.split(PLACEHOLDER(i)).join(to);
  });
  return out;
}

/** A document is swappable when the swap would change it. */
export function hasSwappableToken(text: string): boolean {
  return swapAdministrationTokens(text) !== text;
}

export type Verdict =
  | 'routine'
  | 'novel_not_concerning'
  | 'potentially_concerning'
  | 'clearly_concerning';

const SEVERITY: Record<Verdict, number> = {
  routine: 0,
  novel_not_concerning: 1,
  potentially_concerning: 2,
  clearly_concerning: 3,
};

export const isConcerning = (v: Verdict): boolean => SEVERITY[v] >= 2;

export interface SymmetryRecord {
  rowId: number;
  category: string;
  original: Verdict;
  control: Verdict | null;
  swapped: Verdict | null;
  /** Second unchanged draw (same prompt as `control`): the clean measure of
   *  draw-to-draw noise. The control-vs-stored comparison is confounded by
   *  prompt format (stored verdicts used the contextual prompt). */
  control2?: Verdict | null;
}

export interface SymmetrySummary {
  docs: number;
  /** Pairs where both re-runs parsed. */
  paired: number;
  /** Control re-run disagreed with the stored verdict (model noise, exact label). */
  controlLabelDisagreement: number;
  /** Control re-run crossed the concerning/not-concerning line vs the stored verdict. */
  controlConcernDisagreement: number;
  /** Swapped re-run disagreed with the control re-run (exact label). */
  swapLabelFlips: number;
  /** Swapped re-run crossed the concerning line vs the control. */
  swapConcernFlips: number;
  towardMoreConcerning: number;
  towardLessConcerning: number;
  /** Pairs with a second control draw. */
  doubleControl: number;
  /** Second control draw crossed the concerning line vs the first (pure draw noise). */
  drawNoiseConcernFlips: number;
  drawNoiseConcernRate: number | null;
  /** Net rate: swap concern-flip rate minus draw noise (when measured), else
   *  minus the control-vs-stored rate (an upper bound on noise). */
  netConcernFlipRate: number;
  netBasis: 'draw-noise' | 'control-vs-stored';
  swapConcernFlipRate: number;
  controlConcernRate: number;
  /** Wilson 95% interval for the swap concern-flip rate. */
  wilson95: [number, number];
  byCategory: Record<string, { paired: number; swapConcernFlips: number }>;
}

/** Wilson score interval for a binomial proportion, 95%. */
export function wilson95(k: number, n: number): [number, number] {
  if (n === 0) return [0, 0];
  const z = 1.96;
  const p = k / n;
  const denom = 1 + (z * z) / n;
  const center = (p + (z * z) / (2 * n)) / denom;
  const half = (z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))) / denom;
  return [Math.max(0, center - half), Math.min(1, center + half)];
}

/** Fold one paired record into the running summary. */
function tallyPair(s: SymmetrySummary, r: SymmetryRecord): void {
  const control = r.control as Verdict;
  const swapped = r.swapped as Verdict;
  if (control !== r.original) s.controlLabelDisagreement++;
  if (isConcerning(control) !== isConcerning(r.original)) s.controlConcernDisagreement++;
  if (swapped !== control) s.swapLabelFlips++;
  if (r.control2) {
    s.doubleControl++;
    if (isConcerning(r.control2) !== isConcerning(control)) s.drawNoiseConcernFlips++;
  }
  const cat = (s.byCategory[r.category] ??= { paired: 0, swapConcernFlips: 0 });
  cat.paired++;
  if (isConcerning(swapped) !== isConcerning(control)) {
    s.swapConcernFlips++;
    cat.swapConcernFlips++;
    if (SEVERITY[swapped] > SEVERITY[control]) s.towardMoreConcerning++;
    else s.towardLessConcerning++;
  }
}

export function summarizeSymmetry(records: SymmetryRecord[]): SymmetrySummary {
  const paired = records.filter((r) => r.control && r.swapped);
  const s: SymmetrySummary = {
    docs: records.length,
    paired: paired.length,
    controlLabelDisagreement: 0,
    controlConcernDisagreement: 0,
    swapLabelFlips: 0,
    swapConcernFlips: 0,
    towardMoreConcerning: 0,
    towardLessConcerning: 0,
    doubleControl: 0,
    drawNoiseConcernFlips: 0,
    drawNoiseConcernRate: null,
    netConcernFlipRate: 0,
    netBasis: 'control-vs-stored',
    swapConcernFlipRate: 0,
    controlConcernRate: 0,
    wilson95: [0, 0],
    byCategory: {},
  };
  for (const r of paired) tallyPair(s, r);
  if (s.paired > 0) {
    s.swapConcernFlipRate = s.swapConcernFlips / s.paired;
    s.controlConcernRate = s.controlConcernDisagreement / s.paired;
    if (s.doubleControl > 0) {
      s.drawNoiseConcernRate = s.drawNoiseConcernFlips / s.doubleControl;
      s.netBasis = 'draw-noise';
    }
    const noise = s.drawNoiseConcernRate ?? s.controlConcernRate;
    s.netConcernFlipRate = Math.max(0, s.swapConcernFlipRate - noise);
    s.wilson95 = wilson95(s.swapConcernFlips, s.paired);
  }
  return s;
}

const pct = (x: number) => `${(x * 100).toFixed(1)}%`;

/** Console rendering of a summary. */
export function renderSymmetrySummary(s: SymmetrySummary): string[] {
  const lines = [
    `Swap audit: ${s.docs} docs, ${s.paired} paired re-runs`,
    `  control re-run vs stored verdict: label disagreement ${pct(s.paired ? s.controlLabelDisagreement / s.paired : 0)}, concern-line disagreement ${pct(s.controlConcernRate)} (model noise)`,
    `  swapped vs control: label flips ${pct(s.paired ? s.swapLabelFlips / s.paired : 0)}, concern-line flips ${pct(s.swapConcernFlipRate)} [Wilson 95% ${pct(s.wilson95[0])}–${pct(s.wilson95[1])}]`,
    `  direction of concern-line flips: ${s.towardMoreConcerning} toward more concerning, ${s.towardLessConcerning} toward less`,
    s.drawNoiseConcernRate != null
      ? `  draw noise (second unchanged draw vs first): concern-line disagreement ${pct(s.drawNoiseConcernRate)} on ${s.doubleControl} pairs`
      : '  draw noise: not measured (run --second-control)',
    `  NET concern-flip rate (swap − ${s.netBasis}): ${pct(s.netConcernFlipRate)}`,
  ];
  for (const [cat, c] of Object.entries(s.byCategory).sort()) {
    lines.push(`    ${cat}: ${c.swapConcernFlips}/${c.paired}`);
  }
  return lines;
}
