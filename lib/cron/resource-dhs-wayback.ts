/**
 * CLI: pnpm dhs:resource-wayback [--confirm] [--limit N]
 *
 * Robots-compliance remediation (#685): re-source the content of DHS-host
 * baseline-period press releases from the Internet Archive. The original
 * bodies were fetched from dhs.gov/archive/ before the `Disallow: /archive/`
 * rule was noticed; this pass re-fetches each document's content from the
 * Wayback Machine and stamps wayback provenance.
 *
 * Per document: fetch the nearest Wayback capture (the /archive/news URL
 * first, falling back to the original pre-purge /news/YYYY/MM/DD/ URL), parse
 * with the standard DHS article parser, then:
 * - body matches the stored content → metadata-only update (provenance stamp);
 * - body differs → replace content + delete the row's derived score/assessment
 *   rows so the standard runbook commands re-derive from the Wayback text.
 *
 * Dry-run by default; --confirm required to write. Baseline-period writes —
 * owner approval per the standing rule (granted 2026-08-08 for this pass).
 */

import { and, eq, lt, sql } from 'drizzle-orm';
import { getDb, isDbAvailable } from '@/lib/db';
import { aiDocumentAssessments, documentScores, documents } from '@/lib/db/schema';
import { parseArticlePage } from '@/lib/services/dhs-press-parsers';
import { sleep } from '@/lib/utils/async';
import { checkHelp } from '@/lib/utils/cli-help';

const WAYBACK_DELAY_MS = 2_000;
const FETCH_TIMEOUT_MS = 45_000;
const T2_INAUGURATION = '2025-01-20';

interface ResourceOptions {
  confirm: boolean;
  limit?: number;
}

interface DhsBaselineRow {
  id: number;
  url: string;
  category: string;
  content: string | null;
  publishedAt: Date | null;
  metadata: Record<string, unknown> | null;
}

async function fetchWaybackHtml(url: string): Promise<{ html: string; captureUrl: string } | null> {
  // web/2026id_/ redirects to the nearest capture at-or-before 2026; id_ serves
  // the original bytes without replay chrome.
  for (const target of [url, toOriginalNewsUrl(url)].filter(Boolean) as string[]) {
    const replayUrl = `https://web.archive.org/web/2026id_/${target}`;
    try {
      const response = await fetch(replayUrl, {
        headers: { 'User-Agent': 'DemocracyMonitor/1.0 (civic monitoring)' },
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
        redirect: 'follow',
      });
      if (response.ok) return { html: await response.text(), captureUrl: response.url };
      console.warn(`[dhs-wayback] ${response.status} for ${replayUrl}`);
    } catch (err) {
      console.warn(`[dhs-wayback] fetch failed for ${replayUrl}: ${err}`);
    }
    await sleep(WAYBACK_DELAY_MS);
  }
  return null;
}

/** /archive/news/YYYY/MM/DD/slug → the pre-purge /news/YYYY/MM/DD/slug URL (or null). */
export function toOriginalNewsUrl(url: string): string | null {
  const m = url.match(/^https:\/\/www\.dhs\.gov\/archive(\/news\/\d{4}\/\d{2}\/\d{2}\/.+)$/);
  return m ? `https://www.dhs.gov${m[1]}` : null;
}

const normalize = (s: string) => s.replace(/\s+/g, ' ').trim();

async function loadDhsBaselineRows(limit?: number): Promise<DhsBaselineRow[]> {
  const rows = await getDb()
    .select({
      id: documents.id,
      url: documents.url,
      category: documents.category,
      content: documents.content,
      publishedAt: documents.publishedAt,
      metadata: documents.metadata,
    })
    .from(documents)
    .where(
      and(
        eq(documents.sourceOrigin, 'dhs_press'),
        sql`${documents.metadata}->>'host' = 'dhs'`,
        lt(documents.publishedAt, new Date(T2_INAUGURATION)),
      ),
    )
    .orderBy(documents.publishedAt);
  return (limit ? rows.slice(0, limit) : rows) as DhsBaselineRow[];
}

async function resourceRow(
  row: DhsBaselineRow,
  counts: { matched: number; replaced: number; failed: number },
  confirm: boolean,
): Promise<void> {
  const wayback = await fetchWaybackHtml(row.url);
  if (!wayback) {
    counts.failed++;
    console.warn(`[dhs-wayback] NO CAPTURE: ${row.url}`);
    return;
  }
  const article = parseArticlePage(wayback.html, 'dhs', row.url);
  const provenance = {
    ...(row.metadata ?? {}),
    retrievedVia: 'wayback',
    waybackCaptureUrl: wayback.captureUrl,
    resourcedAt: new Date().toISOString(),
  };

  const bodyMatches =
    article.body.length > 0 &&
    row.content !== null &&
    normalize(article.body) === normalize(row.content);

  if (!confirm) {
    counts[bodyMatches ? 'matched' : 'replaced']++;
    return;
  }

  if (bodyMatches) {
    await getDb().update(documents).set({ metadata: provenance }).where(eq(documents.id, row.id));
    counts.matched++;
    return;
  }

  // Body differs (or Wayback parse came up empty — keep stored text only if
  // wayback yielded nothing at all).
  if (article.body.length === 0) {
    counts.failed++;
    console.warn(`[dhs-wayback] EMPTY BODY from capture: ${row.url}`);
    return;
  }
  await getDb()
    .update(documents)
    .set({ content: article.body, metadata: provenance })
    .where(eq(documents.id, row.id));
  await getDb()
    .delete(documentScores)
    .where(and(eq(documentScores.url, row.url), eq(documentScores.category, row.category)));
  await getDb()
    .delete(aiDocumentAssessments)
    .where(
      and(eq(aiDocumentAssessments.url, row.url), eq(aiDocumentAssessments.category, row.category)),
    );
  counts.replaced++;
}

async function run(opts: ResourceOptions): Promise<void> {
  if (!isDbAvailable()) throw new Error('DATABASE_URL not configured');
  const rows = await loadDhsBaselineRows(opts.limit);
  console.log(
    `[dhs-wayback] ${rows.length} DHS baseline docs to re-source${opts.confirm ? '' : ' (dry-run: fetches Wayback, writes nothing)'}`,
  );
  const counts = { matched: 0, replaced: 0, failed: 0 };
  for (const [i, row] of rows.entries()) {
    await sleep(WAYBACK_DELAY_MS);
    await resourceRow(row, counts, opts.confirm);
    if ((i + 1) % 100 === 0) {
      console.log(
        `  ${i + 1}/${rows.length} — matched ${counts.matched}, replaced ${counts.replaced}, failed ${counts.failed}`,
      );
    }
  }
  console.log(
    `[dhs-wayback] Done: ${counts.matched} bodies matched (provenance stamped), ${counts.replaced} replaced (derived rows purged for re-derivation), ${counts.failed} without usable captures`,
  );
  if (counts.replaced > 0) {
    console.log(
      '[dhs-wayback] Re-derive replaced docs: scores:backfill --from 2017-01-20 --to 2025-01-19, then review:backfill --source dhs_press (same range, capped)',
    );
  }
}

function parseCliArgs(args: string[]): ResourceOptions {
  const opts: ResourceOptions = { confirm: false };
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--confirm') opts.confirm = true;
    else if (args[i] === '--limit') opts.limit = parseInt(args[++i], 10);
  }
  return opts;
}

if (require.main === module) {
  const { loadEnvConfig } = require('@next/env');
  loadEnvConfig(process.cwd());
  const argv = process.argv.slice(2);
  checkHelp(
    argv,
    `Usage: pnpm dhs:resource-wayback [--confirm] [--limit N]

Re-source DHS-host baseline press-release content from the Wayback Machine
(#685 robots remediation). Dry-run by default; --confirm writes. Matching
bodies get a provenance stamp; differing bodies are replaced and their
derived rows purged for re-derivation.`,
  );
  run(parseCliArgs(argv))
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('[dhs-wayback] failed:', err);
      process.exit(1);
    });
}
