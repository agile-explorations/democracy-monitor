/**
 * R-TIPWIRE dry-run packet + owner scoring (#857) — the ship gate. Pure:
 * the CLI does the I/O. Mirrors lib/services/reader-audit.ts: a Markdown
 * packet for a human, a JSON template the owner fills in, a zod-validated
 * scorer. No AI calls here.
 *
 * Gate (owner-approved 2026-09-07): ship only if would-send precision ≥ 0.5
 * on ≥ 3 proposed tips with zero wrong_fact. Fewer than 3 proposed tips is
 * UNMEASURABLE, not failed — extend the window. The kill criterion is bad
 * tips, never few tips.
 */

import { z } from 'zod';
import type { PipelineItem } from './pipeline';
import { TIP_PROMPT_VERSION } from './prompt';

export const GATE_MIN_PROPOSED = 3;
export const GATE_MIN_PRECISION = 0.5;
/** Share of articles published before this ET hour that triggers the morning cron slot. */
export const MORNING_SLOT_ET_HOUR = 10;
export const MORNING_SLOT_TRIGGER_SHARE = 1 / 3;

export const TipDecisionSchema = z.object({
  articleKey: z.string(),
  /** null in the template; the owner's verdict once reviewed. */
  verdict: z.enum(['would_send', 'would_not', 'wrong_fact']).nullable(),
  note: z.string(),
});
export type TipDecision = z.infer<typeof TipDecisionSchema>;

export const TipDecisionsFileSchema = z.object({
  promptVersion: z.string(),
  since: z.string(),
  generatedAt: z.string(),
  items: z.array(TipDecisionSchema),
});
export type TipDecisionsFile = z.infer<typeof TipDecisionsFileSchema>;

export interface PacketMeta {
  since: string;
  generatedAt: string;
  reporters: string[];
}

const PACKET_INSTRUCTIONS = [
  'How to score: for every PROPOSED TIP below, open the article, then read the cited',
  'document. In decisions-template.json set `verdict` to one of:',
  '  would_send — concrete, correct, and the article really did not cover it',
  '  would_not  — not worth sending (already covered, not specific enough, off-beat)',
  '  wrong_fact — the tip misstates the document (a number, date, party, or holding)',
  'Leave no_tip articles as null unless you believe a tip was missed (note it).',
  'Title-only matches had no lede; read the piece before judging the tip.',
];

function judgeLine(it: PipelineItem): string {
  const j = it.judge;
  return `${j.verdict} · ${j.model} · ${j.calls} call(s) · ${j.tokensIn}/${j.tokensOut} tokens · ${(j.latencyMs / 1000).toFixed(1)}s`;
}

function verdictSection(it: PipelineItem): string[] {
  if (it.judge.tip) {
    const t = it.judge.tip;
    const doc = it.match.docs.find((d) => d.ref === t.documentRef);
    return [
      '',
      `**Tip (confidence ${t.confidence}):**`,
      ...t.sentences.map((s, i) => `${i + 1}. ${s}`),
      '',
      `Specific claim: ${t.specificClaim}`,
      `Why it appears unreported: ${t.whyUnreportedAppears}`,
      `Cited document: [Doc ${t.documentRef}] ${doc?.title ?? '?'} — ${doc?.url ?? 'no url'} (id ${t.documentId})`,
    ];
  }
  if (it.judge.reasonsNoTip) return [`No tip because: ${it.judge.reasonsNoTip}`];
  if (it.judge.error) return [`Error: ${it.judge.error}`];
  return [];
}

function contextSection(it: PipelineItem): string[] {
  const lines: string[] = [];
  if (it.match.docs.length > 0) {
    lines.push('', 'Top matched documents:');
    for (const d of it.match.docs.slice(0, 5)) {
      lines.push(
        `  - [Doc ${d.ref}] ${d.title} (${d.category}/${d.tier}${d.priorBoosted ? ', beat' : ''})${d.url ? ` ${d.url}` : ''}`,
      );
    }
  }
  if (it.match.structural.length > 0) {
    lines.push('', 'Weekly context:');
    for (const s of it.match.structural) {
      lines.push(
        `  - ${s.category} (week of ${s.weekOf}): ${s.status ?? 'unknown'}, ${s.documentCount ?? '?'} docs`,
      );
    }
  }
  if (it.recentTitles.length > 0) {
    lines.push('', 'Reporter’s other recent titles:', ...it.recentTitles.map((t) => `  - ${t}`));
  }
  return lines;
}

function itemMarkdown(it: PipelineItem): string {
  const a = it.article;
  const heading = it.judge.verdict === 'tip' ? 'PROPOSED TIP' : it.judge.verdict.toUpperCase();
  return [
    `## ${heading} — ${it.reporter.name} (${it.reporter.outlet})${it.reactive ? ' — REACTIVE' : ''}`,
    '',
    `**Article:** ${a.title}`,
    `Published: ${a.publishedAt ?? 'unknown'} · Lede source: ${a.ledeSource}${a.coauthorCount ? ` · co-authors: ${a.coauthorCount}` : ''}`,
    a.url ? `URL: ${a.url}` : '',
    a.lede ? `Lede: ${a.lede}` : 'Lede: (none — title-only match)',
    `Article key: \`${a.articleKey}\``,
    '',
    `Judge: ${judgeLine(it)}`,
    ...verdictSection(it),
    ...contextSection(it),
    '',
    '---',
    '',
  ].join('\n');
}

/** Proposed tips first (reactive first within), then title-only matches, then the rest. */
export function buildPacketMarkdown(items: PipelineItem[], meta: PacketMeta): string {
  const tips = items.filter((i) => i.judge.verdict === 'tip' && i.article.ledeSource !== 'none');
  const titleOnly = items.filter(
    (i) => i.judge.verdict === 'tip' && i.article.ledeSource === 'none',
  );
  const rest = items.filter((i) => i.judge.verdict !== 'tip');
  const byReactive = (a: PipelineItem, b: PipelineItem) => Number(b.reactive) - Number(a.reactive);
  const counts = `${items.length} articles · ${tips.length + titleOnly.length} proposed tips · ${rest.filter((i) => i.judge.verdict === 'no_tip').length} no_tip · ${rest.filter((i) => i.judge.verdict !== 'no_tip').length} failed`;
  const out = [
    `# Tipwire dry run — since ${meta.since} (generated ${meta.generatedAt}, prompt ${TIP_PROMPT_VERSION})`,
    '',
    `Reporters: ${meta.reporters.join(', ')}`,
    counts,
    '',
    ...PACKET_INSTRUCTIONS,
    '',
    `# PROPOSED TIPS (${tips.length})`,
    '',
    ...tips.sort(byReactive).map(itemMarkdown),
  ];
  if (titleOnly.length > 0) {
    out.push(
      `# ⚠ TITLE-ONLY MATCHES (${titleOnly.length}) — no lede was available; read the piece before sending`,
      '',
      ...titleOnly.sort(byReactive).map(itemMarkdown),
    );
  }
  out.push(`# NO TIP / FAILED (${rest.length})`, '', ...rest.map(itemMarkdown));
  return out.join('\n');
}

export function decisionsTemplate(items: PipelineItem[], meta: PacketMeta): TipDecisionsFile {
  return {
    promptVersion: TIP_PROMPT_VERSION,
    since: meta.since,
    generatedAt: meta.generatedAt,
    items: items.map((it) => ({ articleKey: it.article.articleKey, verdict: null, note: '' })),
  };
}

export interface ReporterScore {
  reporter: string;
  articles: number;
  proposed: number;
  wouldSend: number;
  wrongFact: number;
}

export interface TipScore {
  articles: number;
  judged: number;
  proposed: number;
  decidedProposed: number;
  wouldSend: number;
  wouldNot: number;
  wrongFact: number;
  /** would_send / decided proposed tips; null when nothing was decided. */
  precision: number | null;
  noTipRate: number;
  measurable: boolean;
  pass: boolean;
  /** Share of dated articles published before 10:00 ET (feeds the cron-slot decision). */
  publishedBefore10EtShare: number | null;
  recommendMorningSlot: boolean;
  byReporter: ReporterScore[];
  missedTipNotes: Array<{ articleKey: string; note: string }>;
}

export function etHour(iso: string): number | null {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const h = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    hour: 'numeric',
    hour12: false,
  }).format(d);
  return Number(h) % 24;
}

type DecisionLookup = Map<string, TipDecision>;

function reporterScores(items: PipelineItem[], byKey: DecisionLookup): ReporterScore[] {
  return [...new Set(items.map((i) => i.reporter.id))].map((rid) => {
    const mine = items.filter((i) => i.reporter.id === rid);
    const mineDecided = mine
      .filter((i) => i.judge.verdict === 'tip')
      .map((i) => byKey.get(i.article.articleKey)?.verdict ?? null);
    return {
      reporter: rid,
      articles: mine.length,
      proposed: mine.filter((i) => i.judge.verdict === 'tip').length,
      wouldSend: mineDecided.filter((v) => v === 'would_send').length,
      wrongFact: mineDecided.filter((v) => v === 'wrong_fact').length,
    };
  });
}

/** Share of dated articles published before MORNING_SLOT_ET_HOUR Eastern. */
function earlyPublicationShare(items: PipelineItem[]): number | null {
  const dated = items.map((i) => i.article.publishedAt).filter((p): p is string => Boolean(p));
  if (dated.length === 0) return null;
  const early = dated
    .map(etHour)
    .filter((h): h is number => h !== null && h < MORNING_SLOT_ET_HOUR);
  return early.length / dated.length;
}

export function scoreDecisions(decisions: TipDecisionsFile, items: PipelineItem[]): TipScore {
  const byKey: DecisionLookup = new Map(decisions.items.map((d) => [d.articleKey, d]));
  const proposed = items.filter((i) => i.judge.verdict === 'tip');
  const decided = proposed
    .map((i) => byKey.get(i.article.articleKey)?.verdict ?? null)
    .filter((v): v is NonNullable<TipDecision['verdict']> => v !== null);
  const count = (v: TipDecision['verdict']) => decided.filter((d) => d === v).length;
  const wouldSend = count('would_send');
  const wrongFact = count('wrong_fact');
  const judged = items.filter((i) => i.judge.verdict === 'tip' || i.judge.verdict === 'no_tip');
  const share = earlyPublicationShare(items);
  const measurable = decided.length >= GATE_MIN_PROPOSED;
  const precision = decided.length ? wouldSend / decided.length : null;
  const byReporter = reporterScores(items, byKey);

  return {
    articles: items.length,
    judged: judged.length,
    proposed: proposed.length,
    decidedProposed: decided.length,
    wouldSend,
    wouldNot: count('would_not'),
    wrongFact,
    precision,
    noTipRate: judged.length
      ? judged.filter((i) => i.judge.verdict === 'no_tip').length / judged.length
      : 0,
    measurable,
    pass: measurable && (precision ?? 0) >= GATE_MIN_PRECISION && wrongFact === 0,
    publishedBefore10EtShare: share,
    recommendMorningSlot: share !== null && share > MORNING_SLOT_TRIGGER_SHARE,
    byReporter,
    missedTipNotes: decisions.items
      .filter((d) => d.verdict === null && d.note.trim() !== '')
      .map((d) => ({ articleKey: d.articleKey, note: d.note })),
  };
}

const pct = (x: number | null) => (x === null ? 'n/a' : `${(x * 100).toFixed(0)}%`);

export function renderScore(s: TipScore): string[] {
  const lines = [
    `Tipwire dry-run score: ${s.articles} articles, ${s.judged} judged, ${s.proposed} proposed tips (${pct(s.noTipRate)} no_tip)`,
    `  decided: ${s.decidedProposed} · would_send ${s.wouldSend} · would_not ${s.wouldNot} · wrong_fact ${s.wrongFact} · precision ${pct(s.precision)}`,
  ];
  if (!s.measurable) {
    lines.push(
      `  GATE UNMEASURABLE: fewer than ${GATE_MIN_PROPOSED} decided proposed tips — extend --since by two weeks and re-run (few tips is not a failure).`,
    );
  } else {
    lines.push(
      `  GATE ${s.pass ? 'PASS' : 'FAIL'}: precision ≥ ${pct(GATE_MIN_PRECISION)} on ≥ ${GATE_MIN_PROPOSED} tips with zero wrong_fact`,
    );
  }
  lines.push(
    `  published before ${MORNING_SLOT_ET_HOUR}:00 ET: ${pct(s.publishedBefore10EtShare)} → ${s.recommendMorningSlot ? 'ADD the 13:30 UTC morning cron slot at ship' : 'single 21:30 UTC slot is enough'}`,
  );
  for (const r of s.byReporter) {
    lines.push(
      `  ${r.reporter}: ${r.articles} articles, ${r.proposed} proposed, ${r.wouldSend} would_send, ${r.wrongFact} wrong_fact`,
    );
  }
  for (const m of s.missedTipNotes) lines.push(`  missed-tip note on ${m.articleKey}: ${m.note}`);
  return lines;
}
