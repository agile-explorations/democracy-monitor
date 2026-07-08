/**
 * One-line AI headlines for significant weeks: what happened that week, in
 * concrete terms. Generated at index-recompute time from the week's top
 * concerning documents and its weekly overview narrative; stored alongside the
 * deterministic ranking. Ranking and links never depend on this — a failed or
 * unavailable generation leaves the headline null and the UI falls back to the
 * deterministic reason text.
 */

import { sql } from 'drizzle-orm';
import { getProvider } from '@/lib/ai/provider';
import { getDb, isDbAvailable } from '@/lib/db';
import { mapConcurrent } from '@/lib/utils/async';
import type { SignificantWeek } from './significant-weeks-service';
import { getOverviewExcerpts } from './term-summary-queries';

const HEADLINE_MODEL = 'gpt-4o-mini';
const HEADLINE_MAX_TOKENS = 90;
const TOP_DOCS_PER_WEEK = 3;
const OVERVIEW_EXCERPT_CHARS = 700;
const HEADLINE_CONCURRENCY = 4;

const HEADLINE_SYSTEM_PROMPT =
  'You write one-line factual summaries of U.S. government actions for a monitoring dashboard.';

export interface WeekConcernDoc {
  title: string;
  reasoning: string | null;
}

/** Build the headline prompt for one week. Pure. */
export function buildHeadlinePrompt(
  weekOf: string,
  topDocs: WeekConcernDoc[],
  overviewExcerpt: string | null,
): string {
  const docLines = topDocs.map(
    (d) => `- ${d.title}${d.reasoning ? ` — ${d.reasoning.slice(0, 200)}` : ''}`,
  );
  return [
    `Week of ${weekOf}. Source material:`,
    '',
    ...(docLines.length > 0 ? ['Top concerning documents:', ...docLines, ''] : []),
    ...(overviewExcerpt ? ['Weekly summary excerpt:', overviewExcerpt, ''] : []),
    'Write ONE sentence (max 160 characters) stating the concrete government',
    'action(s) that made this week notable — name the order, directive, firing,',
    'deployment, or ruling. Do NOT mention category counts, statistics, status',
    'levels, or dates. No preamble; output the sentence only.',
  ].join('\n');
}

/** Top clearly/potentially concerning documents for a week, across categories. */
async function getWeekTopConcerns(weekOf: string, limit: number): Promise<WeekConcernDoc[]> {
  const db = getDb();
  const rows = await db.execute(sql`
    SELECT DISTINCT ON (d.title) d.title, a.reasoning, a.assessment, a.confidence
    FROM ai_document_assessments a
    JOIN documents d ON d.url = a.url AND d.category = a.category
    WHERE a.week_of = ${weekOf} AND a.pass = 2 AND a.is_audit_sample = false
      AND a.assessment IN ('clearly_concerning', 'potentially_concerning')
    ORDER BY d.title, a.assessment ASC, a.confidence DESC NULLS LAST
  `);
  type Row = Record<string, unknown>;
  return (rows.rows as Row[])
    .sort((a, b) =>
      a.assessment === b.assessment
        ? Number(b.confidence ?? 0) - Number(a.confidence ?? 0)
        : String(a.assessment).localeCompare(String(b.assessment)),
    )
    .slice(0, limit)
    .map((r) => ({ title: r.title as string, reasoning: (r.reasoning as string) ?? null }));
}

/** Generate a headline for one week; null on any failure. */
async function generateHeadline(
  weekOf: string,
  overviewExcerpt: string | null,
): Promise<string | null> {
  try {
    const topDocs = await getWeekTopConcerns(weekOf, TOP_DOCS_PER_WEEK);
    if (topDocs.length === 0 && !overviewExcerpt) return null;
    const provider = getProvider('openai');
    const result = await provider.complete(buildHeadlinePrompt(weekOf, topDocs, overviewExcerpt), {
      model: HEADLINE_MODEL,
      maxTokens: HEADLINE_MAX_TOKENS,
      systemPrompt: HEADLINE_SYSTEM_PROMPT,
    });
    const headline = result.content.trim().replace(/^["']|["']$/g, '');
    return headline.length > 0 ? headline : null;
  } catch (err) {
    console.warn(`[significant-weeks] headline failed for ${weekOf}:`, err);
    return null;
  }
}

/**
 * Generate headlines for the ranked weeks. Returns a weekOf → headline map;
 * weeks that fail (or when no AI provider is configured) are simply absent.
 */
export async function generateHeadlines(weeks: SignificantWeek[]): Promise<Map<string, string>> {
  const headlines = new Map<string, string>();
  if (!isDbAvailable() || weeks.length === 0) return headlines;
  if (!getProvider('openai').isAvailable()) {
    console.log('[significant-weeks] no OpenAI key — skipping headlines');
    return headlines;
  }

  const excerpts = await getOverviewExcerpts(
    weeks.map((w) => w.weekOf),
    OVERVIEW_EXCERPT_CHARS,
  );
  const results = await mapConcurrent(weeks, HEADLINE_CONCURRENCY, async (week) => ({
    weekOf: week.weekOf,
    headline: await generateHeadline(week.weekOf, excerpts.get(week.weekOf) ?? null),
  }));
  for (const r of results) {
    if (r.headline) headlines.set(r.weekOf, r.headline);
  }
  console.log(`[significant-weeks] headlines generated: ${headlines.size}/${weeks.length}`);
  return headlines;
}
