/**
 * One-line AI event headlines for EVERY analysis week (#539) — extends the
 * significant-weeks headline machinery to the whole timeline. Weeks with
 * confirmed documents get a generated headline; routine weeks get a
 * deterministic fallback (zero AI cost, never blank) so the strip visibly
 * distinguishes "nothing happened" from "something happened".
 */

import { eq, sql } from 'drizzle-orm';
import { getProvider } from '@/lib/ai/provider';
import { getDb, isDbAvailable } from '@/lib/db';
import { weekHeadlines } from '@/lib/db/schema';
import {
  buildHeadlinePrompt,
  HEADLINE_MAX_TOKENS,
  HEADLINE_MODEL,
  HEADLINE_SYSTEM_PROMPT,
} from '@/lib/services/significant-weeks-headlines';
import type { WeekConcernDoc } from '@/lib/services/significant-weeks-headlines';
import { getOverviewExcerpts } from '@/lib/services/term-summary-queries';
import { addDays } from '@/lib/utils/date-utils';

export const ROUTINE_WEEK_HEADLINE =
  'Routine administrative, congressional, and judicial activity.';

const TOP_DOCS_PER_WEEK = 3;
const OVERVIEW_EXCERPT_CHARS = 700;

/**
 * Top confirmed docs for a week via a RANGE window (drift-tolerant per #534,
 * unlike the significant-weeks exact-match query).
 */
async function getWeekTopConcernsRange(weekOf: string): Promise<WeekConcernDoc[]> {
  const db = getDb();
  const weekEnd = addDays(weekOf, 7);
  const rows = await db.execute(sql`
    SELECT DISTINCT ON (d.title) d.title, a.reasoning
    FROM ai_document_assessments a
    JOIN documents d ON d.url = a.url AND d.category = a.category
    WHERE a.week_of >= ${weekOf} AND a.week_of < ${weekEnd}
      AND a.pass = 2 AND (a.is_audit_sample IS NOT TRUE)
      AND a.assessment IN ('clearly_concerning', 'potentially_concerning')
    ORDER BY d.title, a.confidence DESC NULLS LAST
    LIMIT ${TOP_DOCS_PER_WEEK}
  `);
  return rows.rows as unknown as WeekConcernDoc[];
}

async function generateHeadlineText(
  weekOf: string,
  docs: WeekConcernDoc[],
): Promise<string | null> {
  const provider = getProvider('openai');
  if (!provider.isAvailable()) return null;
  const excerpts = await getOverviewExcerpts([weekOf], OVERVIEW_EXCERPT_CHARS);
  try {
    const result = await provider.complete(
      buildHeadlinePrompt(weekOf, docs, excerpts.get(weekOf) ?? null),
      {
        systemPrompt: HEADLINE_SYSTEM_PROMPT,
        temperature: 0.2,
        maxTokens: HEADLINE_MAX_TOKENS,
        model: HEADLINE_MODEL,
      },
    );
    const headline = result.content.trim().replace(/^["']|["']$/g, '');
    return headline.length > 0 ? headline : null;
  } catch (err) {
    console.warn(`[week-headlines] generation failed for ${weekOf}:`, (err as Error).message);
    return null;
  }
}

export interface EnsureHeadlineResult {
  status: 'generated' | 'routine' | 'kept' | 'failed';
}

/**
 * Ensure a week has a headline. Generated headlines are kept unless `force`;
 * routine fallbacks self-heal — if the week later gains confirmed docs (e.g.
 * after a backfill correction), the next ensure upgrades it to a generated
 * headline. A failed generation stores nothing so a later run can retry.
 */
export async function ensureWeekHeadline(
  weekOf: string,
  opts: { force?: boolean } = {},
): Promise<EnsureHeadlineResult> {
  if (!isDbAvailable()) return { status: 'failed' };
  const db = getDb();
  const [existing] = await db
    .select()
    .from(weekHeadlines)
    .where(eq(weekHeadlines.weekOf, weekOf))
    .limit(1);

  if (existing?.generated && !opts.force) return { status: 'kept' };

  const docs = await getWeekTopConcernsRange(weekOf);
  if (docs.length === 0) {
    if (existing && !existing.generated) return { status: 'kept' };
    await upsertHeadline(weekOf, ROUTINE_WEEK_HEADLINE, false);
    return { status: 'routine' };
  }

  const headline = await generateHeadlineText(weekOf, docs);
  if (!headline) return { status: 'failed' };
  await upsertHeadline(weekOf, headline, true);
  return { status: 'generated' };
}

async function upsertHeadline(weekOf: string, headline: string, generated: boolean): Promise<void> {
  const db = getDb();
  await db
    .insert(weekHeadlines)
    .values({ weekOf, headline, generated })
    .onConflictDoUpdate({
      target: weekHeadlines.weekOf,
      set: { headline, generated, computedAt: new Date() },
    });
}

/** Headline for one week (API read path). */
export async function getWeekHeadline(
  weekOf: string,
): Promise<{ headline: string; generated: boolean } | null> {
  if (!isDbAvailable()) return null;
  const db = getDb();
  const [row] = await db
    .select({ headline: weekHeadlines.headline, generated: weekHeadlines.generated })
    .from(weekHeadlines)
    .where(eq(weekHeadlines.weekOf, weekOf))
    .limit(1);
  return row ?? null;
}
