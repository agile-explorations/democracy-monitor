/**
 * Two-outside-reader audit (#816) — the pure half of scripts/audit-readers.ts.
 *
 * One person plus a model whose priors are not inspectable is the honest
 * description of the reviewer; nobody was positioned to say "your reading of
 * THIS document is off." Each quarter fifty Pass-2 readings go to two people
 * who are not the owner, with the document, the reviewer's verdict and its
 * stated reasons. This module builds the packet, the decisions template, and
 * the scoring (agreement with the model, agreement between readers, Cohen's
 * kappa on the four-level verdict and on the departure line). The CLI does
 * the I/O.
 */

import { z } from 'zod';
import { ASSESSMENT_LABELS, EROSION_TYPE_LABELS } from '@/lib/data/assessment-labels';
import { isConcerning } from '@/lib/services/verdict-symmetry';
import type { Verdict } from '@/lib/services/verdict-symmetry';

export type Era = 'current' | 'baseline';

export interface PacketItem {
  id: number;
  era: Era;
  category: string;
  weekOf: string;
  title: string;
  url: string | null;
  sourceOrigin: string | null;
  sourceType: string | null;
  publishedAt: string | null;
  excerpt: string;
  verdict: Verdict;
  erosionType: string | null;
  confidence: number | null;
  reasoning: string;
  citedPassages: string[];
  counterArguments: string[];
  comparativeContext: string | null;
  promptVersion: string | null;
}

/** How many current-term vs baseline rows a sample of `sample` holds. */
export function stratifiedSampleSpec(
  sample: number,
  current?: number,
): { current: number; baseline: number } {
  const cur = Math.min(sample, current ?? Math.round(sample * 0.7));
  return { current: cur, baseline: sample - cur };
}

/** "Possible" and "clear" departures are the departure line. */
export const isDeparture = (v: Verdict): boolean => isConcerning(v);

const VERDICT_LABEL = (v: Verdict) => ASSESSMENT_LABELS[v] ?? v;
const MECHANISM_LABEL = (m: string | null) =>
  m ? (EROSION_TYPE_LABELS[m as keyof typeof EROSION_TYPE_LABELS] ?? m) : '—';

const PACKET_INSTRUCTIONS = [
  "For each document below, read the excerpt, then the reviewer's reading. In your",
  'decisions file record whether you agree with the verdict; when you do not, give the',
  'verdict you would have reached (one of: routine, novel_not_concerning,',
  'potentially_concerning, clearly_concerning) and a sentence of reasoning. The four',
  'verdicts mean: routine — normal administrative activity; novel, within baseline —',
  'unusual but consistent with documented practice; possible departure — some departure',
  'indicators, impact uncertain; clear departure — multiple indicators with clear',
  'institutional impact. You are reading the document, not the reviewer.',
];

function packetItemMarkdown(it: PacketItem, index: number): string {
  const lines = [
    `## ${index + 1}. ${it.title}  (id ${it.id})`,
    '',
    `- Source: ${it.sourceOrigin ?? 'unknown'}${it.sourceType ? ` · ${it.sourceType}` : ''}`,
    `- Date: ${it.publishedAt ?? '—'} · Category: ${it.category} · Week: ${it.weekOf} · Era: ${it.era}`,
    it.url ? `- Link: ${it.url}` : '- Link: (none)',
    '',
    '### Excerpt',
    '',
    it.excerpt,
    '',
    "### The reviewer's reading",
    '',
    `- Verdict: **${VERDICT_LABEL(it.verdict)}** (stored as \`${it.verdict}\`)`,
    `- Mechanism: ${MECHANISM_LABEL(it.erosionType)}`,
    `- Confidence: ${it.confidence != null ? it.confidence : '—'}`,
    `- Reviewer instructions version: ${it.promptVersion ?? 'pre-2026-07-19 (unversioned)'}`,
    '',
    `Reasoning: ${it.reasoning}`,
  ];
  if (it.citedPassages.length > 0) {
    lines.push('', 'Cited passages:', ...it.citedPassages.map((p) => `> ${p}`));
  }
  if (it.counterArguments.length > 0) {
    lines.push(
      '',
      'Counter-arguments the reviewer considered:',
      ...it.counterArguments.map((c) => `- ${c}`),
    );
  }
  if (it.comparativeContext) lines.push('', `Comparative context: ${it.comparativeContext}`);
  lines.push('', '---', '');
  return lines.join('\n');
}

/** The reader's packet: every sampled document with the reviewer's reading. */
export function buildPacketMarkdown(items: PacketItem[], seed: string): string {
  const head = [
    `# Reader packet — ${items.length} readings (seed ${seed})`,
    '',
    ...PACKET_INSTRUCTIONS,
    '',
  ];
  return [...head, ...items.map(packetItemMarkdown)].join('\n');
}

export const ReaderDecisionSchema = z.object({
  id: z.number().int(),
  /** null in the template; a boolean once the reader has decided. */
  agree: z.boolean().nullable(),
  verdict: z
    .enum(['routine', 'novel_not_concerning', 'potentially_concerning', 'clearly_concerning'])
    .nullable(),
  reasoning: z.string(),
});
export type ReaderDecision = z.infer<typeof ReaderDecisionSchema>;

export const ReaderDecisionsFileSchema = z.object({
  reader: z.string(),
  seed: z.string(),
  items: z.array(ReaderDecisionSchema),
});
export type ReaderDecisionsFile = z.infer<typeof ReaderDecisionsFileSchema>;

/** The file each reader fills in: one entry per packet item. */
export function decisionsTemplate(items: PacketItem[], seed: string): ReaderDecisionsFile {
  return {
    reader: '',
    seed,
    items: items.map((it) => ({ id: it.id, agree: null, verdict: null, reasoning: '' })),
  };
}

/** Cohen's kappa between two label sequences of equal length. 1 = perfect
 *  agreement, 0 = what chance would give, negative = worse than chance. */
export function cohenKappa(a: string[], b: string[]): number {
  if (a.length !== b.length) throw new Error('cohenKappa: sequences differ in length');
  const n = a.length;
  if (n === 0) return 0;
  const labels = new Set([...a, ...b]);
  const observed = a.filter((x, i) => x === b[i]).length / n;
  let expected = 0;
  for (const l of labels) {
    const pa = a.filter((x) => x === l).length / n;
    const pb = b.filter((x) => x === l).length / n;
    expected += pa * pb;
  }
  if (expected === 1) return 1;
  return (observed - expected) / (1 - expected);
}

export interface ModelVerdict {
  id: number;
  era: Era;
  verdict: Verdict;
}

export interface ReaderScore {
  reader: string;
  decided: number;
  agreeVerdict: number;
  agreeDeparture: number;
  kappaVerdict: number;
  kappaDeparture: number;
}

export interface ReaderAuditResult {
  seed: string;
  scoredAt: string;
  sample: number;
  readers: ReaderScore[];
  interReader: {
    agreeVerdict: number;
    agreeDeparture: number;
    kappaVerdict: number;
    kappaDeparture: number;
  };
  byEra: Record<
    Era,
    { items: number; readerAgreeVerdict: number[]; readerAgreeDeparture: number[] }
  >;
  /** Items where BOTH readers reached a verdict other than the model's. */
  bothDisagree: Array<{
    id: number;
    model: Verdict;
    readers: Array<{ reader: string; verdict: Verdict; reasoning: string }>;
  }>;
}

/** A reader's effective verdict: the model's when they agree, theirs when not. */
function effectiveVerdict(model: Verdict, d: ReaderDecision | undefined): Verdict | null {
  if (!d || d.agree == null) return null;
  if (d.agree) return model;
  return d.verdict;
}

const share = (hits: number, n: number) => (n > 0 ? hits / n : 0);
const departureLine = (v: Verdict) => (isDeparture(v) ? 'departure' : 'not');

interface PairedRow {
  m: ModelVerdict;
  va: Verdict;
  vb: Verdict;
}

/** Items both readers decided, with each reader's effective verdict. */
function pairRows(
  model: ModelVerdict[],
  byA: Map<number, ReaderDecision>,
  byB: Map<number, ReaderDecision>,
): PairedRow[] {
  return model
    .map((m) => ({
      m,
      va: effectiveVerdict(m.verdict, byA.get(m.id)),
      vb: effectiveVerdict(m.verdict, byB.get(m.id)),
    }))
    .filter((r): r is PairedRow => r.va != null && r.vb != null);
}

/** One reader against the reviewer: exact verdict and departure line, with κ. */
function readerScore(
  name: string,
  rows: PairedRow[],
  pick: (r: PairedRow) => Verdict,
): ReaderScore {
  const modelVerdicts = rows.map((r) => r.m.verdict);
  const mine = rows.map(pick);
  return {
    reader: name,
    decided: rows.length,
    agreeVerdict: share(rows.filter((r) => pick(r) === r.m.verdict).length, rows.length),
    agreeDeparture: share(
      rows.filter((r) => departureLine(pick(r)) === departureLine(r.m.verdict)).length,
      rows.length,
    ),
    kappaVerdict: cohenKappa(modelVerdicts, mine),
    kappaDeparture: cohenKappa(modelVerdicts.map(departureLine), mine.map(departureLine)),
  };
}

function interReaderScore(rows: PairedRow[]): ReaderAuditResult['interReader'] {
  const a = rows.map((r) => r.va);
  const b = rows.map((r) => r.vb);
  return {
    agreeVerdict: share(rows.filter((r) => r.va === r.vb).length, rows.length),
    agreeDeparture: share(
      rows.filter((r) => departureLine(r.va) === departureLine(r.vb)).length,
      rows.length,
    ),
    kappaVerdict: cohenKappa(a, b),
    kappaDeparture: cohenKappa(a.map(departureLine), b.map(departureLine)),
  };
}

export function scoreReaders(
  model: ModelVerdict[],
  a: ReaderDecisionsFile,
  b: ReaderDecisionsFile,
  now: Date = new Date(),
): ReaderAuditResult {
  const byA = new Map(a.items.map((d) => [d.id, d]));
  const byB = new Map(b.items.map((d) => [d.id, d]));
  const rows = pairRows(model, byA, byB);
  const readers = [
    readerScore(a.reader || 'A', rows, (r) => r.va),
    readerScore(b.reader || 'B', rows, (r) => r.vb),
  ];
  return {
    seed: a.seed,
    scoredAt: now.toISOString(),
    sample: model.length,
    readers,
    interReader: interReaderScore(rows),
    byEra: { current: eraSlice(rows, 'current'), baseline: eraSlice(rows, 'baseline') },
    bothDisagree: rows
      .filter((r) => r.va !== r.m.verdict && r.vb !== r.m.verdict)
      .map((r) => ({
        id: r.m.id,
        model: r.m.verdict,
        readers: [
          { reader: readers[0].reader, verdict: r.va, reasoning: byA.get(r.m.id)?.reasoning ?? '' },
          { reader: readers[1].reader, verdict: r.vb, reasoning: byB.get(r.m.id)?.reasoning ?? '' },
        ],
      })),
  };
}

function eraSlice(
  rows: PairedRow[],
  era: Era,
): { items: number; readerAgreeVerdict: number[]; readerAgreeDeparture: number[] } {
  const s = rows.filter((r) => r.m.era === era);
  const dep = (v: Verdict) => isDeparture(v);
  return {
    items: s.length,
    readerAgreeVerdict: [
      share(s.filter((r) => r.va === r.m.verdict).length, s.length),
      share(s.filter((r) => r.vb === r.m.verdict).length, s.length),
    ],
    readerAgreeDeparture: [
      share(s.filter((r) => dep(r.va) === dep(r.m.verdict)).length, s.length),
      share(s.filter((r) => dep(r.vb) === dep(r.m.verdict)).length, s.length),
    ],
  };
}

const pct = (x: number) => `${(x * 100).toFixed(0)}%`;

/** Console rendering of a result. */
export function renderReaderAudit(r: ReaderAuditResult): string[] {
  const lines = [
    `Reader audit ${r.seed}: ${r.sample} readings, ${r.readers[0].decided} decided by both readers`,
  ];
  for (const s of r.readers) {
    lines.push(
      `  ${s.reader}: agrees with the reviewer on ${pct(s.agreeVerdict)} of verdicts (κ ${s.kappaVerdict.toFixed(2)}), ` +
        `${pct(s.agreeDeparture)} on the departure line (κ ${s.kappaDeparture.toFixed(2)})`,
    );
  }
  lines.push(
    `  readers agree with each other on ${pct(r.interReader.agreeVerdict)} of verdicts (κ ${r.interReader.kappaVerdict.toFixed(2)}), ` +
      `${pct(r.interReader.agreeDeparture)} on the departure line (κ ${r.interReader.kappaDeparture.toFixed(2)})`,
  );
  for (const era of ['current', 'baseline'] as const) {
    const e = r.byEra[era];
    lines.push(
      `  ${era}: ${e.items} items — verdict agreement ${e.readerAgreeVerdict.map(pct).join(' / ')}, departure line ${e.readerAgreeDeparture.map(pct).join(' / ')}`,
    );
  }
  lines.push(`  both readers disagree with the reviewer on ${r.bothDisagree.length} item(s)`);
  return lines;
}
