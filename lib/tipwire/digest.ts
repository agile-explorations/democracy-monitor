/**
 * R-TIPWIRE owner digest (#858): the review surface. Pure text builders;
 * the CLI prints them and `poll --email` sends them through sendOpsAlert
 * (one recipient, OPS_ALERT_EMAIL, never throws). Reactive candidates first,
 * title-only matches under a distinct heading, every block with its
 * copy-paste `tips:sent` commands, duplicate documents cross-referenced,
 * and a "sent but unreplied — mark these?" reminder so the cadence guard
 * does not decay into a permanent mute.
 *
 * A beat candidate (R-TIPWIRE-4 #877) lists every reporter on its category;
 * the owner picks recipients and marks each send with `--reporter`, and the
 * coverage line answers "your outlet already ran this" per listed outlet.
 */

import type { TipCoverageCheck, TipPayload } from '@/lib/db/schema';
import { COOLDOWN_WEEKS, REMINDER_AFTER_DAYS } from './cadence';
import { coverageLine } from './coverage-line';
import { categoryLabel } from './roster';
import type { CategoryKey } from './roster';

export interface DigestReporter {
  id: string;
  name: string;
  outlet: string;
  outletDomain: string;
  cadence: string;
  /** This candidate's send to this reporter, when marked. */
  sentAt: Date | null;
}

export interface DigestCandidate {
  id: number;
  /** The first listed reporter (single-reporter rows have exactly one). */
  reporterId: string;
  reporterName: string;
  outlet: string;
  /** Every reporter the candidate lists (beat: all on the category). */
  reporters: DigestReporter[];
  beatCategory: string | null;
  title: string;
  url: string | null;
  publishedAt: Date | null;
  ledeSource: string;
  coauthorCount: number;
  reactive: boolean;
  /** forward: "since your piece on …" · contradiction: predates the piece · beat: no article anchor */
  kind: 'forward' | 'contradiction' | 'beat';
  /** GDELT coverage check (#861); null until checked. */
  coverage: TipCoverageCheck | null;
  tip: TipPayload;
  tipDocumentId: number | null;
  docTitle: string | null;
  docUrl: string | null;
  cadence: string;
  createdAt: Date;
}

export interface ReminderRow {
  candidateId: number;
  reporterId: string;
  reporterName: string;
  title: string;
  sentAt: Date;
}

function day(d: Date | null): string {
  return d ? d.toISOString().slice(0, 10) : 'date unknown';
}

/** Candidates that cite the same corpus document (send one, not both). */
export function groupDuplicateDocs(cands: DigestCandidate[]): Map<number, number[]> {
  const byDoc = new Map<number, number[]>();
  for (const c of cands) {
    if (c.tipDocumentId == null) continue;
    byDoc.set(c.tipDocumentId, [...(byDoc.get(c.tipDocumentId) ?? []), c.id]);
  }
  return new Map([...byDoc].filter(([, ids]) => ids.length > 1));
}

const likelyCovered = (c: DigestCandidate) => Number(c.coverage?.label === 'likely-covered');

/** Reactive first; likely-covered last within each group; then newest first. */
export function orderCandidates(cands: DigestCandidate[]): DigestCandidate[] {
  return [...cands].sort(
    (a, b) =>
      Number(b.reactive) - Number(a.reactive) ||
      likelyCovered(a) - likelyCovered(b) ||
      b.createdAt.getTime() - a.createdAt.getTime(),
  );
}

function kindLabel(c: DigestCandidate): string {
  if (c.kind === 'contradiction') return ' · CONTRADICTION CHECK';
  if (c.kind !== 'beat') return '';
  const label = c.beatCategory ? categoryLabel(c.beatCategory as CategoryKey) : null;
  return ` · BEAT${label ? ` (${label})` : ''}`;
}

/** Open candidates per reporter (a reporter on several beats can be listed on several). */
export function groupByReporter(cands: DigestCandidate[]): Map<string, number[]> {
  const byReporter = new Map<string, number[]>();
  for (const c of cands)
    for (const r of c.reporters) byReporter.set(r.id, [...(byReporter.get(r.id) ?? []), c.id]);
  return byReporter;
}

/** "· also on #12, #15" when the reporter is listed on other open candidates — send one at a time. */
function alsoOn(c: DigestCandidate, reporterId: string, byReporter: Map<string, number[]>): string {
  const others = (byReporter.get(reporterId) ?? []).filter((id) => id !== c.id);
  return others.length ? ` · also on ${others.map((id) => `#${id}`).join(', ')}` : '';
}

function reporterLines(c: DigestCandidate, byReporter: Map<string, number[]>): string[] {
  if (c.reporters.length <= 1)
    return [`Cadence: ${c.cadence}${alsoOn(c, c.reporterId, byReporter)}`];
  return [
    'Reporters on this beat (mark each send with --reporter):',
    ...c.reporters.map(
      (r) =>
        `  - ${r.name} (${r.outlet}) [${r.id}]: ${r.cadence}${r.sentAt ? ` · sent ${day(r.sentAt)}` : ' · unsent'}${alsoOn(c, r.id, byReporter)}`,
    ),
  ];
}

function commandLines(c: DigestCandidate): string[] {
  if (c.reporters.length <= 1) {
    return [
      `pnpm tips:sent --candidate ${c.id}            # mark sent`,
      `pnpm tips:sent --candidate ${c.id} --replied  # reporter replied (lifts cooldown)`,
      `pnpm tips:sent --candidate ${c.id} --dismiss  # not sending`,
    ];
  }
  const ids = c.reporters.map((r) => r.id).join(', ');
  return [
    `pnpm tips:sent --candidate ${c.id} --reporter <id>            # mark sent (ids: ${ids})`,
    `pnpm tips:sent --candidate ${c.id} --reporter <id> --replied  # that reporter replied (lifts cooldown)`,
    `pnpm tips:sent --candidate ${c.id} --dismiss                  # not sending to the rest`,
  ];
}

function candidateBlock(
  c: DigestCandidate,
  dupes: Map<number, number[]>,
  byReporter: Map<string, number[]>,
): string {
  const others =
    c.tipDocumentId != null ? (dupes.get(c.tipDocumentId) ?? []).filter((id) => id !== c.id) : [];
  const who = c.reporters.map((r) => `${r.name} (${r.outlet})`).join(', ');
  const lines = [
    `${c.reactive ? '⚡ REACTIVE (send today) — ' : ''}#${c.id} · ${who}${c.coauthorCount ? ` · co-authored ×${c.coauthorCount}` : ''}${kindLabel(c)}`,
    c.kind === 'beat'
      ? `${c.title} · no article anchor — a "have you seen this?", not a follow-up`
      : `${c.kind === 'contradiction' ? 'Article' : 'Since their piece'}: ${c.title}`,
    `Published: ${day(c.publishedAt)}${c.url ? ` · ${c.url}` : ''}`,
    c.ledeSource === 'none' ? 'TITLE-ONLY MATCH — read the piece before sending' : '',
    '',
    ...c.tip.sentences.map((s, i) => `${i + 1}. ${s}`),
    '',
    `Claim: ${c.tip.specificClaim}`,
    `Appears unreported because: ${c.tip.whyUnreportedAppears}`,
    `Confidence: ${c.tip.confidence}`,
    `Document: ${c.docTitle ?? `id ${c.tipDocumentId ?? '?'}`}${c.docUrl ? ` — ${c.docUrl}` : ''}`,
    ...coverageLine(
      c.coverage,
      c.reporters.map((r) => ({ name: r.outlet, domain: r.outletDomain })),
      c.id,
    ),
    ...reporterLines(c, byReporter),
    others.length
      ? `Also proposed for candidate(s) ${others.map((id) => `#${id}`).join(', ')} — same document; send one.`
      : '',
    '',
    ...commandLines(c),
  ];
  return lines.filter((l) => l !== '').join('\n');
}

/** One string per candidate block (sendOpsAlert renders each as a <pre>). */
export function buildDigestLines(
  cands: DigestCandidate[],
  reminders: ReminderRow[],
  skippedForCadence: string[],
): string[] {
  const ordered = orderCandidates(cands);
  const dupes = groupDuplicateDocs(ordered);
  const byReporter = groupByReporter(ordered);
  const withLede = ordered.filter((c) => c.ledeSource !== 'none');
  const titleOnly = ordered.filter((c) => c.ledeSource === 'none');
  const out: string[] = [];
  if (ordered.length === 0) out.push('No open tip candidates.');
  for (const c of withLede) out.push(candidateBlock(c, dupes, byReporter));
  if (titleOnly.length > 0) {
    out.push(
      `⚠ TITLE-ONLY MATCHES (${titleOnly.length}) — no lede was available; read the piece before sending`,
    );
    for (const c of titleOnly) out.push(candidateBlock(c, dupes, byReporter));
  }
  if (reminders.length > 0) {
    out.push(
      [
        `SENT BUT UNREPLIED FOR ≥ ${REMINDER_AFTER_DAYS} DAYS — mark these? (an unreplied send keeps the reporter in cooldown)`,
        ...reminders.map(
          (r) =>
            `#${r.candidateId} · ${r.reporterName} · ${r.title} · sent ${day(r.sentAt)}\n  pnpm tips:sent --candidate ${r.candidateId} --reporter ${r.reporterId} --replied   (no reply: the cooldown lifts by itself after ${COOLDOWN_WEEKS} weeks)`,
        ),
      ].join('\n'),
    );
  }
  if (skippedForCadence.length > 0) {
    out.push(
      `Skipped this run (cadence cooldown, no AI spend): ${skippedForCadence.join(', ')}. Override with: pnpm tips:poll --ignore-cadence`,
    );
  }
  return out;
}

export function digestSubject(cands: DigestCandidate[]): string {
  const reactive = cands.filter((c) => c.reactive).length;
  return `[tipwire] ${cands.length} tip candidate${cands.length === 1 ? '' : 's'}${reactive ? ` (${reactive} reactive)` : ''}`;
}
