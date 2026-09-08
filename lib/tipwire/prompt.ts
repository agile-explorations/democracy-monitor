/**
 * R-TIPWIRE judge prompt (#856, #863). One Sonnet call per article-check
 * decides: a concrete tip (three sentences naming ONE document and one
 * number, date, or finding) or `no_tip`.
 *
 * Three questions (R-TIPWIRE-2 pivot 2026-09-07; beat pass R-TIPWIRE-3 #869):
 * - forward: "since this piece was filed, what appeared in the record that
 *   extends or complicates it?" — the documents shown are all NEWER than the
 *   article. This is the steady state; a published article is evidence of the
 *   thread the reporter is on now, and the record moves before the news does.
 * - contradiction (reactive articles only): "does any document predating
 *   this piece contradict a claim in it?" — the model sees the article body
 *   (fetched fresh, never stored) because the lede is not the piece.
 * - beat (no article anchor): among documents the pipeline's own review
 *   flagged on the beat this week, is ONE a reportable development the
 *   reporters on it have not written? — "have you seen this?" Since
 *   R-TIPWIRE-4 (#876) a beat check lists every reporter on the category,
 *   with headlines per reporter where a feed exists; absence of headlines is
 *   never evidence (the outlet coverage check answers that after the verdict).
 *
 * The concreteness rule and the banned outputs are the whole point: "our
 * tool covers this topic" is a forbidden answer. Honesty clauses reuse the
 * research-answer rules (coverage scoped to what was shown, matched passages
 * binding, witness tone); the operator verifies before sending.
 *
 * BUMP TIP_PROMPT_VERSION (to the change date) whenever the system prompt,
 * the user prompt layout, or the schema changes substantively; it is stored
 * on every tip_candidates row so precision can be compared across versions.
 */

import { z } from 'zod';
import { extractJsonFromLlm } from '@/lib/utils/ai-helpers';
import type { DiscoveredArticle } from './acquire';
import type { RankedDoc, StructuralLine, WatchKind } from './match';
import {
  concretenessSection,
  honestySection,
  outputSection,
  roleSection,
  toneSection,
} from './prompt-sections';
import { categoryLabels } from './roster';
import type { CategoryKey, ReporterEntry } from './roster';

export const TIP_PROMPT_VERSION = 'tip-2026-09-08-beat-group';
/** Content budget per matched document in the user prompt. */
export const DOC_EXCERPT_CHARS = 1500;
/** Same-story context: the reporter's other recent titles shown to the judge. */
export const RECENT_TITLES_DAYS = 14;
/** Contradiction mode: article body excerpt shown to the judge (never stored). */
export const ARTICLE_BODY_CHARS = 3000;

export { BANNED_TIP_PHRASES, WITNESS_TONE_BANNED } from './prompt-sections';

export const TipVerdictSchema = z.object({
  verdict: z.enum(['tip', 'no_tip']),
  tip: z
    .object({
      sentences: z.array(z.string().min(1)).length(3),
      document_ref: z.number().int().min(1),
      specific_claim: z.string().min(1),
      why_unreported_appears: z.string().min(1),
      confidence: z.enum(['low', 'medium', 'high']),
      /** Identifier-grade strings for the coverage check (#861): docket or EO
       *  numbers, program names, exact figures, case captions. Empty when the
       *  claim is paraphrasable — then the check reports "not checkable". */
      search_keys: z.array(z.string().min(1)).max(3).optional(),
    })
    .optional(),
  reasons_no_tip: z.string().optional(),
});
export type TipVerdict = z.infer<typeof TipVerdictSchema>;

export interface BeatReporterContext {
  name: string;
  outlet: string;
  /** false = no sanctioned byline source; the judge must not read silence as "unwritten". */
  hasFeed: boolean;
  recentTitles: string[];
}

/** Beat checks (R-TIPWIRE-4): the category checked and every reporter on it. */
export interface BeatJudgeContext {
  categories: CategoryKey[];
  reporters: BeatReporterContext[];
}

export interface TipJudgeContext {
  /** The anchor's reporter; on a beat check the first of `beat.reporters`. */
  reporter: ReporterEntry;
  beat?: BeatJudgeContext;
  article: Pick<DiscoveredArticle, 'title' | 'lede' | 'publishedAt' | 'url' | 'coauthorCount'>;
  /** Contradiction mode: bounded body text fetched at judge time; null otherwise. */
  articleBody?: string | null;
  kind: WatchKind;
  /** Forward: the window start the documents were drawn from. Beat: the beat week. */
  since?: string | null;
  /** The reporter's other article titles from the last RECENT_TITLES_DAYS. */
  recentTitles: string[];
  structural: StructuralLine[];
  docs: RankedDoc[];
}

export function buildTipSystemPrompt(kind: WatchKind = 'forward'): string {
  return [
    ...roleSection(kind),
    '',
    ...concretenessSection(kind),
    '',
    ...honestySection(),
    '',
    ...toneSection(),
    '',
    ...outputSection(),
  ].join('\n');
}

function formatDate(iso: string | null | undefined): string {
  if (!iso) return 'date unknown';
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? 'date unknown'
    : d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

function formatAnnotation(doc: RankedDoc): string[] {
  if (!doc.p2Assessment) return [];
  const head = `  AI Assessment (annotation): ${doc.p2Assessment}${doc.p2ErosionType ? ` (erosion: ${doc.p2ErosionType})` : ''}`;
  return doc.p2Summary
    ? [head, `  AI Review Note (annotation — NOT document text): ${doc.p2Summary}`]
    : [head];
}

/** Compact model-facing rendering of the matched documents. */
export function formatDocsForTip(docs: RankedDoc[]): string {
  return docs
    .map((doc, i) => {
      const lines = [
        `[Doc ${i + 1} | ${doc.tier === 'discussion' ? 'DISCUSSION' : 'ACTION'}${doc.priorBoosted ? ' | beat category' : ''}] ${doc.title}`,
        `  Date: ${formatDate(doc.publishedAt)} · Source: ${doc.sourceType} (${doc.sourceOrigin ?? 'unknown'}) · Category: ${doc.category}`,
        ...formatAnnotation(doc),
      ];
      if (doc.matchSnippet)
        lines.push(`  Matched Passage (verbatim): "${doc.matchSnippet.replace(/\[\[|\]\]/g, '')}"`);
      if (doc.queryExcerpt) lines.push(`  Relevant Passages (verbatim): "${doc.queryExcerpt}"`);
      lines.push(
        `  URL: ${doc.url ?? 'N/A'}`,
        `  Content: ${doc.content ? doc.content.slice(0, DOC_EXCERPT_CHARS) : '(no content available)'}`,
      );
      return lines.join('\n');
    })
    .join('\n\n');
}

function formatStructural(lines: StructuralLine[]): string[] {
  if (lines.length === 0) return ['  (no weekly context available for these categories)'];
  return lines.map((s) => {
    const mix =
      s.actionConfirmed != null || s.discussionConfirmed != null
        ? ` · confirmed: ${s.actionConfirmed ?? 0} action-tier, ${s.discussionConfirmed ?? 0} discussion-tier`
        : '';
    return `  ${s.category} (week of ${s.weekOf}): status ${s.status ?? 'unknown'} · ${s.documentCount ?? '?'} documents${mix}${s.silenceElevated ? ' · unusual quiet flagged' : ''}`;
  });
}

function articleSection(ctx: TipJudgeContext): string[] {
  const { article } = ctx;
  if (ctx.kind === 'beat') {
    return [
      `BEAT CHECK — no article anchor · week of ${ctx.since?.slice(0, 10) ?? 'unknown'}.`,
      'The documents below were flagged by Democracy Monitor’s review on this beat this',
      'week; each document’s own publication date is shown.',
    ];
  }
  const coauthor =
    article.coauthorCount > 0
      ? ` (co-authored with ${article.coauthorCount} other${article.coauthorCount > 1 ? 's' : ''})`
      : '';
  const lines = [
    `ARTICLE${coauthor}:`,
    `Title: ${article.title}`,
    `Published: ${formatDate(article.publishedAt)}`,
    article.lede
      ? `Lede: ${article.lede}`
      : 'Lede: (not available — the article’s specifics are unknown; require a stronger, more specific match before proposing a tip)',
    article.url ? `URL: ${article.url}` : '',
  ];
  if (ctx.kind === 'contradiction') {
    lines.push(
      ctx.articleBody
        ? `Body excerpt (first ${ARTICLE_BODY_CHARS} characters): ${ctx.articleBody.slice(0, ARTICLE_BODY_CHARS)}`
        : 'Body: (not available — judge only what the lede states)',
    );
  }
  return lines;
}

function docsHeading(ctx: TipJudgeContext): string {
  const n = ctx.docs.length;
  if (ctx.kind === 'beat')
    return `DOCUMENTS FLAGGED ON THIS BEAT (${n}, best first; "AI Review Note" lines are annotations, not document text):`;
  return ctx.kind === 'contradiction'
    ? `DOCUMENTS PREDATING THE ARTICLE (${n}, best match first; "beat category" marks the reporter's own beat):`
    : `DOCUMENTS PUBLISHED SINCE ${formatDate(ctx.since ?? ctx.article.publishedAt)} (${n}, best match first; "beat category" marks the reporter's own beat):`;
}

const NO_FEED_NOTE = '(no feed — recent headlines unknown)';

function reporterHeader(ctx: TipJudgeContext): string[] {
  if (ctx.beat) {
    return [
      `REPORTERS ON THIS BEAT (${categoryLabels(ctx.beat.categories).join(', ')}):`,
      ...ctx.beat.reporters.map(
        (r) => `  - ${r.name}, ${r.outlet}${r.hasFeed ? '' : ` ${NO_FEED_NOTE}`}`,
      ),
    ];
  }
  const beat = categoryLabels(ctx.reporter.categories).join(', ');
  return [`REPORTER: ${ctx.reporter.name}, ${ctx.reporter.outlet}. Beat: ${beat}.`];
}

function recentTitlesSection(ctx: TipJudgeContext): string[] {
  if (ctx.beat) {
    return [
      `RECENT HEADLINES BY THESE REPORTERS (last ${RECENT_TITLES_DAYS} days — a development already covered in one of these is not a tip; absence of headlines is NOT evidence the story is unwritten):`,
      ...ctx.beat.reporters.flatMap((r) => [
        `  ${r.name} (${r.outlet}):`,
        ...(r.recentTitles.length > 0
          ? r.recentTitles.map((t) => `    - ${t}`)
          : [`    ${r.hasFeed ? '(none stored)' : NO_FEED_NOTE}`]),
      ]),
    ];
  }
  return [
    `THIS REPORTER ALSO RECENTLY PUBLISHED (last ${RECENT_TITLES_DAYS} days — a development already covered in one of these is not a tip):`,
    ...(ctx.recentTitles.length > 0 ? ctx.recentTitles.map((t) => `  - ${t}`) : ['  (none found)']),
  ];
}

export function buildTipUserPrompt(ctx: TipJudgeContext): string {
  return [
    ...reporterHeader(ctx),
    '',
    ...articleSection(ctx),
    '',
    ...recentTitlesSection(ctx),
    '',
    "DEMOCRACY MONITOR WEEKLY CONTEXT for the reporter's beat categories:",
    ...formatStructural(ctx.structural),
    '',
    docsHeading(ctx),
    '',
    formatDocsForTip(ctx.docs),
    '',
    'Decide: tip or no_tip. JSON only.',
  ]
    .filter((l) => l !== '')
    .join('\n');
}

export type ParsedTipVerdict =
  | { ok: true; verdict: TipVerdict }
  | { ok: false; reason: 'unparseable' | 'invalid_shape' | 'missing_tip' | 'ref_out_of_range' };

/** Parse and validate a judge response against the document count shown. */
export function parseTipVerdict(raw: string, docCount: number): ParsedTipVerdict {
  const json = extractJsonFromLlm(raw);
  if (!json) return { ok: false, reason: 'unparseable' };
  const parsed = TipVerdictSchema.safeParse(json);
  if (!parsed.success) return { ok: false, reason: 'invalid_shape' };
  const v = parsed.data;
  if (v.verdict === 'tip') {
    if (!v.tip) return { ok: false, reason: 'missing_tip' };
    if (v.tip.document_ref > docCount) return { ok: false, reason: 'ref_out_of_range' };
  }
  return { ok: true, verdict: v };
}
