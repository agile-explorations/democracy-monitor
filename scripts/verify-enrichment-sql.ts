/**
 * CLI: pnpm verify:enrichment-sql
 *
 * Executes the synthesis-context enrichment SQL and the matched-passage
 * snippet SQL against DATABASE_URL for one real document per origin branch
 * (#744). Both paths are failure-tolerant — a SQL error (an invalid ts_headline
 * deflist, v1.9.9–v1.9.26; a Postgres regex bound above 255, caught 2026-08-28)
 * is swallowed as a console.warn and synthesis silently loses its passages —
 * so this script turns that warning into a nonzero exit. Read-only.
 */

import { sql } from 'drizzle-orm';
import { getDb, isDbAvailable } from '@/lib/db';
import { fetchMatchSnippets } from '@/lib/services/hybrid-arms';
import type { ResearchDocument } from '@/lib/services/search-service';
import {
  enrichDocsForSynthesis,
  HEADLINE_OFFSET_ORIGINS,
} from '@/lib/services/synthesis-context-enrichment';
import { checkHelp } from '@/lib/utils/cli-help';

/** One row per origin whose content actually carries that origin's masthead. */
const SAMPLE_CONDITIONS: Record<string, ReturnType<typeof sql>> = {
  federal_register: sql`AND content LIKE 'Federal Register, Volume%'`,
  govinfo: sql`AND content ~ '^(Senate|House) Report'`,
  govinfo_cpd: sql`AND content LIKE 'DCPD%' AND content LIKE '%}%'`,
  crec: sql`AND LEFT(content, char_length(title)) = title`,
  chrg: sql`AND content ~* '^[-[:space:]]*[^[]{0,250}[[](House|Senate|Joint) Hearing'`,
  dhs_press: sql`AND content LIKE 'For Immediate Release%'`,
};

const PROBE_QUERY = 'executive order agency department authority';
const PROBE_PHRASE = 'department';

async function sampleDocs(): Promise<ResearchDocument[]> {
  const db = getDb();
  const docs: ResearchDocument[] = [];
  for (const origin of [...HEADLINE_OFFSET_ORIGINS, 'courtlistener', 'doj']) {
    const cond = SAMPLE_CONDITIONS[origin] ?? sql``;
    const r = await db.execute(sql`
      SELECT id, title, source_type, source_origin FROM documents
      WHERE source_origin = ${origin} AND length(content) > 3000 ${cond}
      ORDER BY id DESC LIMIT 1`);
    const row = r.rows[0] as
      | { id: number; title: string; source_type: string; source_origin: string }
      | undefined;
    if (!row) {
      console.log(`  ${origin}: no sample row in this database (branch not exercised)`);
      continue;
    }
    docs.push({
      id: Number(row.id),
      title: row.title,
      sourceType: row.source_type,
      sourceOrigin: row.source_origin,
      content: '',
    } as unknown as ResearchDocument);
  }
  return docs;
}

async function main(): Promise<void> {
  if (!isDbAvailable()) throw new Error('DATABASE_URL not configured');
  const warnings: string[] = [];
  const originalWarn = console.warn;
  console.warn = (...args: unknown[]) => {
    warnings.push(args.map(String).join(' '));
    originalWarn(...args);
  };

  const docs = await sampleDocs();
  await enrichDocsForSynthesis(docs, PROBE_QUERY);
  for (const d of docs) {
    const excerpt = (d.queryExcerpt ?? '(none)').replace(/\s+/g, ' ').slice(0, 160);
    console.log(`  ${d.sourceOrigin} #${d.id}: ${excerpt}`);
  }
  const snippets = await fetchMatchSnippets(docs.map((d) => ({ id: d.id, phrase: PROBE_PHRASE })));
  console.log(`  snippets: ${snippets.size}/${docs.length}`);
  console.warn = originalWarn;

  if (warnings.length > 0) {
    console.error(
      `\nFAILED: ${warnings.length} swallowed warning(s) — the SQL did not execute cleanly`,
    );
    process.exit(1);
  }
  console.log(`\nOK: enrichment + snippet SQL executed for ${docs.length} origin samples`);
  process.exit(0);
}

if (require.main === module) {
  const { loadEnvConfig } = require('@next/env');
  loadEnvConfig(process.cwd());
  checkHelp(
    process.argv.slice(2),
    `Usage: pnpm verify:enrichment-sql

Executes the passage-excerpt SQL (every masthead branch) and the matched-passage
snippet SQL against DATABASE_URL for one real document per origin. Read-only;
exits 1 if either failure-tolerant path swallowed a SQL error.`,
  );
  main().catch((err) => {
    console.error('[verify-enrichment-sql] Fatal:', err);
    process.exit(1);
  });
}
