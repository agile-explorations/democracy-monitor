/**
 * CLI: pnpm routing:reapply [--dry-run] [--source cpd|crec|all]
 *
 * Re-applies routing rules to existing CPD and CREC documents.
 * Inserts new rows for categories that documents now qualify for
 * (due to expanded CPD subject mappings or CREC topic routing terms)
 * without refetching from external APIs.
 *
 * Does NOT delete existing rows — only adds new category assignments.
 * Sets embedded_at = NULL on new rows so embeddings:backfill picks them up.
 */

import { eq, sql } from 'drizzle-orm';
import { mapSubjectsToCategories } from '@/lib/data/cpd-subject-map';
import { isDbAvailable, getDb } from '@/lib/db';
import { documents } from '@/lib/db/schema';
import { classifyCrecToCategories } from '@/lib/services/crec-classifier';
import { storeDocuments } from '@/lib/services/document-store';
import type { ContentItem } from '@/lib/types';
import { checkHelp } from '@/lib/utils/cli-help';

type Source = 'cpd' | 'crec' | 'all';

interface ReapplyOptions {
  sources: Source[];
  dryRun: boolean;
}

// ---------------------------------------------------------------------------
// CPD routing
// ---------------------------------------------------------------------------

async function reapplyCpd(dryRun: boolean): Promise<number> {
  // nosemgrep: opengrep.cron-needs-env-config — loadEnvConfig called in CLI entry block below
  const db = getDb();

  // Load all CPD docs with their current categories and subjects
  const rows = await db
    .select({
      id: documents.id,
      url: documents.url,
      title: documents.title,
      content: documents.content,
      category: documents.category,
      publishedAt: documents.publishedAt,
      sourceType: documents.sourceType,
      sourceOrigin: documents.sourceOrigin,
      metadata: documents.metadata,
      speaker: documents.speaker,
    })
    .from(documents)
    .where(eq(documents.sourceOrigin, 'govinfo_cpd'));

  // Group by URL to find all current categories per document
  const byUrl = new Map<
    string,
    { categories: Set<string>; subjects: string[]; row: (typeof rows)[0] }
  >();
  for (const row of rows) {
    if (!row.url) continue;
    const existing = byUrl.get(row.url);
    if (existing) {
      existing.categories.add(row.category);
    } else {
      const meta = row.metadata as Record<string, unknown> | null;
      const subjects = (meta?.subjects as string[]) ?? [];
      byUrl.set(row.url, { categories: new Set([row.category]), subjects, row });
    }
  }

  console.log(`[routing:reapply] cpd: ${byUrl.size} unique documents, ${rows.length} total rows`);

  let newRows = 0;
  const newCategoryCounts = new Map<string, number>();

  for (const [, entry] of byUrl) {
    const newCategories = mapSubjectsToCategories(entry.subjects);
    const missing = newCategories.filter((c) => !entry.categories.has(c));
    if (missing.length === 0) continue;

    const item: ContentItem = {
      title: entry.row.title,
      content: entry.row.content || undefined,
      link: entry.row.url || undefined,
      pubDate: entry.row.publishedAt?.toISOString(),
      type: entry.row.sourceType,
      sourceOrigin: 'govinfo_cpd',
      metadata: entry.row.metadata as Record<string, unknown>,
    };

    for (const cat of missing) {
      if (!dryRun) {
        await storeDocuments([item], cat);
      }
      newRows++;
      newCategoryCounts.set(cat, (newCategoryCounts.get(cat) ?? 0) + 1);
    }
  }

  console.log(`[routing:reapply] cpd: ${newRows} new category rows`);
  if (newCategoryCounts.size > 0) {
    const sorted = [...newCategoryCounts.entries()].sort((a, b) => b[1] - a[1]);
    for (const [cat, count] of sorted) {
      console.log(`  ${cat}: +${count}`);
    }
  }

  return newRows;
}

// ---------------------------------------------------------------------------
// CREC routing
// ---------------------------------------------------------------------------

async function reapplyCrec(dryRun: boolean): Promise<number> {
  // nosemgrep: opengrep.cron-needs-env-config — loadEnvConfig called in CLI entry block below
  const db = getDb();

  // Load all CREC docs with their current categories
  const rows = await db
    .select({
      id: documents.id,
      url: documents.url,
      title: documents.title,
      content: documents.content,
      category: documents.category,
      publishedAt: documents.publishedAt,
      sourceType: documents.sourceType,
      sourceOrigin: documents.sourceOrigin,
      metadata: documents.metadata,
      speaker: documents.speaker,
    })
    .from(documents)
    .where(eq(documents.sourceOrigin, 'crec'));

  // Group by URL to find all current categories per document
  const byUrl = new Map<string, { categories: Set<string>; row: (typeof rows)[0] }>();
  for (const row of rows) {
    if (!row.url) continue;
    const existing = byUrl.get(row.url);
    if (existing) {
      existing.categories.add(row.category);
    } else {
      byUrl.set(row.url, { categories: new Set([row.category]), row });
    }
  }

  console.log(`[routing:reapply] crec: ${byUrl.size} unique documents, ${rows.length} total rows`);

  let newRows = 0;
  const newCategoryCounts = new Map<string, number>();

  for (const [, entry] of byUrl) {
    const text = entry.row.content || '';
    const newCategories = classifyCrecToCategories(entry.row.title, text);
    const missing = newCategories.filter((c) => !entry.categories.has(c));
    if (missing.length === 0) continue;

    const item: ContentItem = {
      title: entry.row.title,
      content: entry.row.content || undefined,
      link: entry.row.url || undefined,
      pubDate: entry.row.publishedAt?.toISOString(),
      type: entry.row.sourceType,
      sourceOrigin: 'crec',
      metadata: entry.row.metadata as Record<string, unknown>,
    };

    for (const cat of missing) {
      if (!dryRun) {
        await storeDocuments([item], cat);
      }
      newRows++;
      newCategoryCounts.set(cat, (newCategoryCounts.get(cat) ?? 0) + 1);
    }
  }

  console.log(`[routing:reapply] crec: ${newRows} new category rows`);
  if (newCategoryCounts.size > 0) {
    const sorted = [...newCategoryCounts.entries()].sort((a, b) => b[1] - a[1]);
    for (const [cat, count] of sorted) {
      console.log(`  ${cat}: +${count}`);
    }
  }

  return newRows;
}

// ---------------------------------------------------------------------------
// Orchestrator
// ---------------------------------------------------------------------------

async function run(options: ReapplyOptions): Promise<void> {
  if (!isDbAvailable()) {
    console.error('[routing:reapply] DATABASE_URL not configured');
    process.exit(1);
  }

  let totalNew = 0;
  const runAll = options.sources.includes('all');

  if (runAll || options.sources.includes('cpd')) {
    totalNew += await reapplyCpd(options.dryRun);
  }
  if (runAll || options.sources.includes('crec')) {
    totalNew += await reapplyCrec(options.dryRun);
  }

  if (options.dryRun) {
    console.log(`\n[routing:reapply] Dry run: ${totalNew} new rows would be inserted`);
  } else {
    console.log(`\n[routing:reapply] Done: ${totalNew} new category rows inserted`);
    if (totalNew > 0) {
      console.log(
        '[routing:reapply] Run `pnpm scores:recompute --all-dates` to score new documents',
      );
      console.log('[routing:reapply] Run `pnpm embeddings:backfill` to embed new documents');
    }
  }
}

/* CLI entry */
if (require.main === module) {
  const { loadEnvConfig } = require('@next/env');
  loadEnvConfig(process.cwd());

  const args = process.argv.slice(2);
  checkHelp(
    args,
    `Usage: pnpm routing:reapply [options]

Options:
  --source <name>     Source to re-route (cpd, crec, all; default: all)
  --dry-run           Preview without writing to DB`,
  );

  const sourceIdx = args.indexOf('--source');
  const dryRun = args.includes('--dry-run');
  const sourceArg = sourceIdx !== -1 ? args[sourceIdx + 1] : undefined;
  const validSources: Source[] = ['cpd', 'crec', 'all'];
  const sources: Source[] =
    sourceArg && validSources.includes(sourceArg as Source) ? [sourceArg as Source] : ['all'];

  run({ sources, dryRun }).catch((err) => {
    console.error('[routing:reapply] Fatal:', err);
    process.exit(1);
  });
}
