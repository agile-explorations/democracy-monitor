/**
 * Synthesis-context enrichment (#707 audit): the per-document excerpt the
 * LLM sees is the document's opening chars — claims whose support lies
 * deeper are invisible, which produced both the "denies content its own
 * snippets show" class and the Slaughter/Bedoya disposition error ("moot"
 * first appears at char 13,715 of the opinion; the excerpt ends at 3,000).
 *
 * Two targeted, verbatim excerpt classes are attached before prompting:
 * - queryExcerpt: ts_headline windows around the question's own terms, for
 *   EVERY document — generalizes the matched-passage win beyond keyword-arm
 *   survivors.
 * - dispositionExcerpt: for judicial opinions, windows around ruling
 *   language (granted/denied/dismissed/moot/vacated) so holdings are
 *   attributed to the parties the text actually names.
 *
 * Failure-tolerant: enrichment errors leave docs unenriched — synthesis
 * proceeds exactly as before.
 */

import { sql } from 'drizzle-orm';
import { getDb, isDbAvailable } from '@/lib/db';
import type { ResearchDocument } from '@/lib/services/search-service';

/** Headline scans at most this much content per row (perf bound). */
const HEADLINE_CONTENT_CHARS = 150000;
// StartSel/StopSel are EMPTY (no markers wanted) and MUST stay quoted:
// unquoted empty values are invalid deflist syntax — this exact string
// threw on every call from v1.9.9 to v1.9.26, silently disabling
// enrichment (caught 2026-08-14 via prod logs).
export const QUERY_HEADLINE_OPTS =
  'MaxFragments=2, MaxWords=50, MinWords=15, StartSel="", StopSel=""';
export const DISPOSITION_HEADLINE_OPTS =
  'MaxFragments=3, MaxWords=60, MinWords=20, StartSel="", StopSel=""';
/** Ruling-language terms whose surroundings carry the disposition. */
const DISPOSITION_TSQUERY =
  'granted or denied or dismissed or moot or vacated or affirmed or reversed or remanded';

const JUDICIAL_SOURCE_TYPES = new Set(['judicial_opinion', 'court_opinion']);

/** Chars to skip past the '[FR Doc No' sentinel (#744): covers the doc
 *  number and closing bracket; landing a few chars into the residual
 *  masthead is harmless (ts_headline is word-based and the fragment
 *  filter below is the belt). */
const FR_DOC_NO_SKIP_CHARS = 40;

/** ts_headline's default FragmentDelimiter. */
const FRAGMENT_DELIMITER = ' ... ';

/** Masthead shapes only (#744) — deliberately tighter than the storage-side
 *  cleaners so a body passage that merely mentions the Federal Register
 *  ("published in the Federal Register on August 29") survives. */
const BOILERPLATE_FRAGMENT_PATTERNS = [
  /Federal Register(, Volume| Volume \d| \/ Vol\.)/i,
  /\[Federal Register Volume/i,
  /From the Federal Register Online/i,
  /\[FR Doc No/i,
  /Government Publishing Office/i,
  /\[(Senate|House|Joint) (Hearing|Report)\b/i,
  /^(Senate|House) Report \d/i,
  /BILLING CODE \d/i,
  // Non-FR mastheads (#744): CPD package ids + CSS preamble, press headers.
  /^DCPD\d+/,
  /\{\s*(margin|font|padding|text-align)[^}]*\}/i,
  /^For Immediate Release/i,
];

/**
 * Drop headline fragments that are document masthead rather than substance
 * (#744): the GPO header matches almost any query's terms (agency names,
 * "Federal Register", dates), so ts_headline elects it as the "most
 * relevant passage" — observed live as a Relevant Passages line that was
 * the header verbatim. No excerpt beats a boilerplate excerpt. Exported
 * for tests.
 */
export function dropBoilerplateFragments(excerpt: string): string | null {
  const kept = excerpt
    .split(FRAGMENT_DELIMITER)
    .filter((fragment) => !BOILERPLATE_FRAGMENT_PATTERNS.some((re) => re.test(fragment)))
    .map(trimSeparatorRuns)
    .filter((fragment) => fragment.length > 0);
  const joined = kept.join(FRAGMENT_DELIMITER).trim();
  return joined.length >= 20 ? joined : null;
}

/** GPO rule lines ("-----", "=====", "_____") that end a masthead land at
 *  the start of the offset source, so a headline window can open on them
 *  (observed on FR and House-report rows, 2026-08-28). Trim runs of three
 *  or more separator characters from either end; a single "- " bullet or
 *  an em-dash inside prose is untouched. Exported for tests. */
export function trimSeparatorRuns(fragment: string): string {
  return fragment
    .replace(/^[\s\-=_*]{3,}/, '')
    .replace(/[\s\-=_*]{3,}$/, '')
    .trim();
}

/** CPD CSS preamble lives in the first ~1500 chars (content-cleaners
 *  measured max 1460); the last '}' in this window ends it. */
const CPD_CSS_WINDOW_CHARS = 2000;
/** CHRG front matter (content-cleaners stripChrgFrontMatter) as a Postgres
 *  ARE: POSIX classes, no backslashes, and a bound of 250 — Postgres rejects
 *  repetition counts above 255 ("invalid repetition count(s)"), which the
 *  failure-tolerant enrichment path would swallow silently. Exported for the
 *  syntax test. */
export const CHRG_MASTHEAD_RE = '^[-[:space:]]*[^[]{0,250}[[](House|Senate|Joint) Hearing';
/** DHS press header sentinel length ('Contact:'). */
const DHS_CONTACT_SENTINEL_CHARS = 8;

/**
 * Headline source with each origin's masthead skipped (#744) — the SQL twin
 * of `stripBoilerplate` (lib/utils/content-cleaners.ts), which runs at read
 * time on the excerpt text but cannot reach ts_headline's input. Every
 * origin's header outranks real passages for almost any query (agency
 * names, "Federal Register", dates, hearing titles); skipping it makes the
 * masthead unreachable instead of merely filtered after the fact. `d` is
 * the documents alias; the fragment filter remains the belt. Exported for
 * the Matched Passage path (hybrid-arms.ts), which shares the exposure.
 */
export function headlineSourceSql(maxChars: number = HEADLINE_CONTENT_CHARS) {
  return sql`
    CASE
      WHEN d.source_origin = 'federal_register'
           AND d.content LIKE 'Federal Register, Volume%'
           AND strpos(d.content, '[FR Doc No') > 0
        THEN LEFT(substr(d.content, strpos(d.content, '[FR Doc No') + ${FR_DOC_NO_SKIP_CHARS}), ${maxChars})
      WHEN d.source_origin = 'govinfo'
           AND d.content ~ '^(Senate|House) Report'
           AND strpos(d.content, '===') > 0
        THEN LEFT(substr(d.content, strpos(d.content, '===')), ${maxChars})
      WHEN d.source_origin = 'govinfo_cpd'
           AND d.content LIKE 'DCPD%'
           AND strpos(LEFT(d.content, ${CPD_CSS_WINDOW_CHARS}), '}') > 0
        THEN LEFT(substr(d.content,
          char_length(LEFT(d.content, ${CPD_CSS_WINDOW_CHARS}))
            - strpos(reverse(LEFT(d.content, ${CPD_CSS_WINDOW_CHARS})), '}') + 2), ${maxChars})
      WHEN d.source_origin = 'crec'
           AND d.title IS NOT NULL AND char_length(d.title) > 0
           AND LEFT(d.content, char_length(d.title)) = d.title
        THEN LEFT(substr(d.content, char_length(d.title) + 1), ${maxChars})
      WHEN d.source_origin = 'chrg'
           AND d.content ~* ${CHRG_MASTHEAD_RE}
           AND strpos(d.content, ']') > 0
        THEN LEFT(substr(d.content, strpos(d.content, ']') + 1), ${maxChars})
      WHEN d.source_origin = 'dhs_press'
           AND d.content LIKE 'For Immediate Release%'
           AND strpos(LEFT(d.content, 300), 'Contact:') > 0
        THEN LEFT(substr(d.content, strpos(d.content, 'Contact:') + ${DHS_CONTACT_SENTINEL_CHARS}), ${maxChars})
      ELSE LEFT(d.content, ${maxChars})
    END`;
}

/** Origins with a masthead branch in headlineSourceSql — exported so the
 *  test can assert parity with the read-time cleaner's switch. */
export const HEADLINE_OFFSET_ORIGINS = [
  'federal_register',
  'govinfo',
  'govinfo_cpd',
  'crec',
  'chrg',
  'dhs_press',
] as const;

interface ExcerptRow {
  id: number;
  query_excerpt: string | null;
  disposition_excerpt: string | null;
}

/** Apply extracted excerpt rows onto docs in place, filtering boilerplate. */
function applyExcerpts(docs: ResearchDocument[], rows: ExcerptRow[]): void {
  const byId = new Map(rows.map((r) => [Number(r.id), r]));
  for (const doc of docs) {
    const r = byId.get(doc.id);
    if (!r) continue;
    if (r.query_excerpt && r.query_excerpt.trim().length >= 20) {
      const cleaned = dropBoilerplateFragments(r.query_excerpt.trim());
      if (cleaned) doc.queryExcerpt = cleaned;
    }
    if (r.disposition_excerpt && r.disposition_excerpt.trim().length >= 20) {
      // Ruling-language windows can elect masthead-adjacent text too (#744).
      const cleaned = dropBoilerplateFragments(r.disposition_excerpt.trim());
      if (cleaned) doc.dispositionExcerpt = cleaned;
    }
  }
}

/** Attach query-matched and disposition excerpts to docs in place. */
export async function enrichDocsForSynthesis(
  docs: ResearchDocument[],
  query: string,
): Promise<void> {
  if (!isDbAvailable() || docs.length === 0) return;
  const db = getDb();
  const ids = docs.map((d) => d.id);
  const judicialIds = docs.filter((d) => JUDICIAL_SOURCE_TYPES.has(d.sourceType)).map((d) => d.id);
  const headlineSource = headlineSourceSql();
  try {
    const rows = await db.execute(sql`
      SELECT d.id,
        ts_headline('english', ${headlineSource},
          websearch_to_tsquery('english', ${query}), ${QUERY_HEADLINE_OPTS}) as query_excerpt,
        CASE WHEN d.id IN (${sql.join(
          (judicialIds.length > 0 ? judicialIds : [-1]).map((i) => sql`${i}`),
          sql`, `,
        )})
          THEN ts_headline('english', ${headlineSource},
            websearch_to_tsquery('english', ${DISPOSITION_TSQUERY}), ${DISPOSITION_HEADLINE_OPTS})
          ELSE NULL
        END as disposition_excerpt
      FROM documents d
      WHERE d.id IN (${sql.join(
        ids.map((i) => sql`${i}`),
        sql`, `,
      )})`);
    applyExcerpts(docs, rows.rows as unknown as ExcerptRow[]);
  } catch (err) {
    console.warn('[synthesis-enrichment] failed (synthesis proceeds unenriched):', err);
  }
}
