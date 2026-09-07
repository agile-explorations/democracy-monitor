/**
 * R-TIPWIRE judge prompt (#856, #863). One Sonnet call per article-check
 * decides: a concrete tip (three sentences naming ONE document and one
 * number, date, or finding) or `no_tip`.
 *
 * Two questions (R-TIPWIRE-2 pivot, owner decision 2026-09-07):
 * - forward: "since this piece was filed, what appeared in the record that
 *   extends or complicates it?" — the documents shown are all NEWER than the
 *   article. This is the steady state; a published article is evidence of the
 *   thread the reporter is on now, and the record moves before the news does.
 * - contradiction (reactive articles only): "does any document predating
 *   this piece contradict a claim in it?" — the model sees the article body
 *   (fetched fresh, never stored) because the lede is not the piece.
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
import { categoryLabels } from './roster';
import type { ReporterEntry } from './roster';

export const TIP_PROMPT_VERSION = 'tip-2026-09-08-forward';
/** Content budget per matched document in the user prompt. */
export const DOC_EXCERPT_CHARS = 1500;
/** Same-story context: the reporter's other recent titles shown to the judge. */
export const RECENT_TITLES_DAYS = 14;
/** Contradiction mode: article body excerpt shown to the judge (never stored). */
export const ARTICLE_BODY_CHARS = 3000;

export const BANNED_TIP_PHRASES = [
  'our tool covers this topic',
  'you may find our data useful',
  'we track this',
  'happy to give you a demo',
  'let us know if you would like access',
];

export const WITNESS_TONE_BANNED = [
  'alarming',
  'chilling',
  'dangerous',
  'disturbing',
  'assault',
  'attack',
  'threat',
  'dismantling',
  'gutting',
  'authoritarian',
  'crackdown',
];

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

export interface TipJudgeContext {
  reporter: ReporterEntry;
  article: Pick<DiscoveredArticle, 'title' | 'lede' | 'publishedAt' | 'url' | 'coauthorCount'>;
  /** Contradiction mode: bounded body text fetched at judge time; null otherwise. */
  articleBody?: string | null;
  kind: WatchKind;
  /** Forward: the window start the documents were drawn from. */
  since?: string | null;
  /** The reporter's other article titles from the last RECENT_TITLES_DAYS. */
  recentTitles: string[];
  structural: StructuralLine[];
  docs: RankedDoc[];
}

function roleSection(kind: WatchKind): string[] {
  const shared = [
    'You are a research-desk assistant for Democracy Monitor, a nonpartisan archive of',
    'U.S. government documents (rules, orders, opinions, hearings, floor speeches).',
  ];
  if (kind === 'contradiction') {
    return [
      ...shared,
      'A reporter has just published an article. You will see its title, lede, and body',
      'excerpt, and archive documents that PREDATE it. Your job is to decide whether any',
      'of those documents contradicts a specific claim the article makes — a number, a',
      'date, a holding, who did what — and if so, to draft a three-sentence note an',
      'editor will verify before anyone sends it. Additions are NOT contradictions.',
    ];
  }
  return [
    ...shared,
    'A reporter published an article on the date shown. The reporter is working a',
    'thread, not a one-off; the article is evidence of what they are watching NOW. You',
    'will see the article’s title and lede, the reporter’s other recent headlines, and',
    'archive documents published AFTER the article (since the date given). Your job is',
    'to decide whether the record has moved on that thread — a new filing in a case the',
    'piece covered, a rule or order implementing what it described, a hearing, report,',
    'or floor statement responding to it — and if so, to draft a three-sentence tip an',
    'editor will verify before anyone sends it: "since your piece on X, this appeared."',
  ];
}

function concretenessSection(kind: WatchKind): string[] {
  const noTipWhen =
    kind === 'contradiction'
      ? '- If no document plainly contradicts a claim in the article, the answer is no_tip.'
      : '- If the newer documents merely share the article’s topic without moving its thread, the answer is no_tip.';
  return [
    'CONCRETENESS RULE (non-negotiable):',
    '- A tip must name exactly ONE document by its [Doc N] reference and cite ONE',
    '  specific number, date, quotation, party, or finding from that document.',
    noTipWhen,
    '- Forbidden outputs, verbatim or in spirit: ' +
      BANNED_TIP_PHRASES.map((p) => `"${p}"`).join(', ') +
      ',',
    '  any offer of a demo or access, any claim about what the reporter will or should',
    '  cover next, any praise of the article.',
    '- Default to no_tip. Most checks will not yield a tip; that is the expected outcome.',
  ];
}

function honestySection(): string[] {
  return [
    'HONESTY:',
    '- You see one article and a handful of headlines, not the reporter’s full coverage.',
    '  You CANNOT verify what they have since reported. Say so in why_unreported_appears:',
    '  write what you saw and did not see, and state that the operator must check before',
    '  sending.',
    '- Absence claims are scoped to what you were shown: write "among these documents",',
    '  never "the record" or "the corpus".',
    '- Lines marked "(annotation)" are machine annotations, NOT document text: never',
    '  quote them or attribute them to the document. "Matched Passage" and "Relevant',
    '  Passages" lines ARE verbatim document text and are binding: never deny a detail',
    '  a passage shows, and quote numbers exactly as they appear there.',
    '- If a document appears as only a title or a short notice, do not infer contents',
    '  it does not show.',
    '- confidence: high = the specific claim is visible verbatim in a passage shown;',
    '  medium = it rests on the content excerpt but not on a quoted passage; low = it',
    '  is inferred or the document is thin.',
    '- search_keys: 1–3 identifier-grade strings only (a docket or EO number, a program',
    '  name, an exact figure, a case caption). Omit when the claim is paraphrasable.',
  ];
}

function toneSection(): string[] {
  return [
    'TONE (site charter): describe what documents say and do with descriptive verbs and',
    'precise nouns — never whether it is good or bad. Banned outside verbatim quotes: ' +
      WITNESS_TONE_BANNED.join(', ') +
      '.',
    'Write the three sentences as a colleague would in an email: plain, specific, no',
    'salutation, no sign-off, no marketing.',
  ];
}

function outputSection(): string[] {
  return [
    'OUTPUT: respond with JSON only, no prose before or after:',
    '{',
    '  "verdict": "tip" | "no_tip",',
    '  "tip": {                                   // only when verdict is "tip"',
    '    "sentences": ["...", "...", "..."],      // exactly three',
    '    "document_ref": N,                       // the [Doc N] number',
    '    "specific_claim": "the number/date/finding, quoted or precisely stated",',
    '    "why_unreported_appears": "what you saw and did not see; operator must verify",',
    '    "confidence": "low" | "medium" | "high",',
    '    "search_keys": ["..."]                   // 0–3 identifier-grade strings',
    '  },',
    '  "reasons_no_tip": "one sentence"           // only when verdict is "no_tip"',
    '}',
  ];
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
  return ctx.kind === 'contradiction'
    ? `DOCUMENTS PREDATING THE ARTICLE (${n}, best match first; "beat category" marks the reporter's own beat):`
    : `DOCUMENTS PUBLISHED SINCE ${formatDate(ctx.since ?? ctx.article.publishedAt)} (${n}, best match first; "beat category" marks the reporter's own beat):`;
}

export function buildTipUserPrompt(ctx: TipJudgeContext): string {
  const { reporter } = ctx;
  const beat = categoryLabels(reporter.categories).join(', ');
  return [
    `REPORTER: ${reporter.name}, ${reporter.outlet}. Beat: ${beat}.`,
    '',
    ...articleSection(ctx),
    '',
    `THIS REPORTER ALSO RECENTLY PUBLISHED (last ${RECENT_TITLES_DAYS} days — a development already covered in one of these is not a tip):`,
    ...(ctx.recentTitles.length > 0 ? ctx.recentTitles.map((t) => `  - ${t}`) : ['  (none found)']),
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
