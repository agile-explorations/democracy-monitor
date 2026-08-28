/**
 * CLI: pnpm audit:symmetry [--sample N] [--max-calls N] [--confirm] [--out FILE] [--concurrency N]
 *
 * AI-verdict political symmetry — the swap audit (#772). Samples current-term
 * Pass-2-reviewed documents whose text names an administration, then runs
 * TWO Pass-2 verdicts per document with the baseline prompt (no week
 * context): a control re-run of the unchanged text (the model's own
 * draw-to-draw noise) and a re-run with the administration tokens swapped.
 * Reports the swap-induced concern-line flip rate net of noise, with a
 * Wilson 95% interval, by direction and by category.
 *
 * Read-only against the database; writes a JSONL ledger. AI spend protocol
 * (#563/#564): the precheck prints the three numbers; every call goes
 * through the shared AI call budget; the cap trips with exit 3.
 */

import { appendFileSync, existsSync, readFileSync, writeFileSync } from 'fs';
import { sql } from 'drizzle-orm';
import { getProvider } from '@/lib/ai/provider';
import { T2_INAUGURATION } from '@/lib/data/analysis-periods';
import { CATEGORIES } from '@/lib/data/categories';
import { getDb, isDbAvailable } from '@/lib/db';
import { AiCallBudgetExceededError, configureAiCallBudget } from '@/lib/services/ai-call-budget';
import { assessPass2 } from '@/lib/services/document-review-assessment-service';
import {
  hasSwappableToken,
  renderSymmetrySummary,
  summarizeSymmetry,
  swapAdministrationTokens,
} from '@/lib/services/verdict-symmetry';
import type { SymmetryRecord, Verdict } from '@/lib/services/verdict-symmetry';
import type { ContentItem } from '@/lib/types';
import { mapConcurrent } from '@/lib/utils/async';
import { checkHelp } from '@/lib/utils/cli-help';
import { stripBoilerplate } from '@/lib/utils/content-cleaners';

const P2_MODEL = 'claude-sonnet-4-5-20250929';
const CONTENT_CHARS = 8000;
const DEFAULT_SAMPLE = 200;
/** Two calls per document, ×1.5 headroom for parse retries. */
const CALLS_PER_DOC = 2;
const CAP_FACTOR = 1.5;
const EXIT_CAP_TRIPPED = 3;

interface SampleRow {
  rowId: number;
  category: string;
  url: string;
  title: string;
  content: string;
  sourceType: string;
  assessment: Verdict;
  signals: string[];
  erosionType: string;
}

function argValue(args: string[], flag: string): string | undefined {
  const i = args.indexOf(flag);
  return i >= 0 ? args[i + 1] : undefined;
}

/** Deterministic era-stratified sample of current-term P2 rows whose text is swappable. */
async function selectSample(
  n: number,
): Promise<{ rows: SampleRow[]; matched: number; withContent: number }> {
  const db = getDb();
  const matched = await db.execute(sql`
    SELECT count(*) AS n FROM ai_document_assessments a
    WHERE a.pass = 2 AND NOT a.is_audit_sample AND a.week_of >= ${T2_INAUGURATION}::date`);
  const candidates = await db.execute(sql`
    SELECT a.id AS row_id, a.category, a.url, a.assessment, a.signals, a.erosion_type,
      d.title, d.source_type, d.source_origin, LEFT(d.content, ${CONTENT_CHARS * 2}) AS content
    FROM ai_document_assessments a
    JOIN documents d ON d.url = a.url AND d.category = a.category
    WHERE a.pass = 2 AND NOT a.is_audit_sample AND a.week_of >= ${T2_INAUGURATION}::date
      AND d.content IS NOT NULL AND length(d.content) >= 400 AND d.retrieval_relevant IS NOT FALSE
    ORDER BY md5(a.id::text || 'audit-772')
    LIMIT ${n * 4}`);
  const rows: SampleRow[] = [];
  let withContent = 0;
  for (const r of candidates.rows as Array<Record<string, unknown>>) {
    withContent++;
    const content = stripBoilerplate(
      String(r.content ?? ''),
      (r.source_origin as string | null) ?? null,
      String(r.title ?? ''),
    ).slice(0, CONTENT_CHARS);
    if (!hasSwappableToken(`${r.title ?? ''}\n${content}`)) continue;
    rows.push({
      rowId: Number(r.row_id),
      category: String(r.category),
      url: String(r.url),
      title: String(r.title ?? ''),
      content,
      sourceType: String(r.source_type ?? ''),
      assessment: r.assessment as Verdict,
      signals: (r.signals as string[] | null) ?? [],
      erosionType: String(r.erosion_type ?? 'none'),
    });
    if (rows.length >= n) break;
  }
  return { rows, matched: Number((matched.rows[0] as { n: string }).n), withContent };
}

function alreadyDone(outFile: string): Set<number> {
  if (!existsSync(outFile)) return new Set();
  return new Set(
    readFileSync(outFile, 'utf8')
      .split('\n')
      .filter(Boolean)
      .map((l) => (JSON.parse(l) as SymmetryRecord).rowId),
  );
}

function readLedger(outFile: string): SymmetryRecord[] {
  if (!existsSync(outFile)) return [];
  return readFileSync(outFile, 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((l) => JSON.parse(l) as SymmetryRecord);
}

async function verdictFor(row: SampleRow, text: string, title: string): Promise<Verdict | null> {
  const description = CATEGORIES.find((c) => c.key === row.category)?.description ?? '';
  const doc: ContentItem = { title, content: text, link: row.url, type: row.sourceType };
  const result = await assessPass2(
    doc,
    row.signals,
    row.erosionType,
    description,
    getProvider('anthropic'),
    false,
    P2_MODEL,
  );
  return (result?.response.assessment as Verdict | undefined) ?? null;
}

/** Second unchanged draw for every ledger row without one; the ledger is
 *  rewritten with `control2` filled in (rows keep their order). */
async function runSecondControl(rows: SampleRow[], outFile: string, concurrency: number) {
  const ledger = readLedger(outFile);
  const byId = new Map(rows.map((r) => [r.rowId, r]));
  const todo = ledger.filter((rec) => rec.control2 === undefined && byId.has(rec.rowId));
  console.log(
    `[audit-symmetry] second control: ${todo.length} documents (${ledger.length} in ledger)`,
  );
  let processed = 0;
  try {
    await mapConcurrent(todo, concurrency, async (rec) => {
      const row = byId.get(rec.rowId)!;
      rec.control2 = await verdictFor(row, row.content, row.title);
      processed++;
      if (processed % 20 === 0) console.log(`[audit-symmetry] ${processed}/${todo.length}...`);
    });
  } catch (err) {
    if (!(err instanceof AiCallBudgetExceededError)) throw err;
    console.error('[audit-symmetry] AI call cap reached — stopping (partial second control kept)');
    process.exitCode = EXIT_CAP_TRIPPED;
  }
  writeFileSync(outFile, ledger.map((r) => JSON.stringify(r)).join('\n') + '\n');
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  checkHelp(
    args,
    `Usage: pnpm audit:symmetry [options]

Swap audit of Pass-2 verdicts (#772): control re-run vs administration-token
swap, per document. Read-only against the DB; ledger is JSONL.

Options:
  --sample N        Documents to test (default ${DEFAULT_SAMPLE})
  --max-calls N     Hard AI-call cap (default sample × ${CALLS_PER_DOC} × ${CAP_FACTOR}); exit ${EXIT_CAP_TRIPPED} when hit
  --confirm         Make the AI calls (without it: precheck only)
  --out FILE        Ledger path (default .audit-symmetry.jsonl); resumable
  --concurrency N   Parallel documents (default 2)
  --second-control  Add a second unchanged draw to every ledger row lacking one
                    (one call per document) — the clean draw-noise measure`,
  );
  if (!isDbAvailable()) throw new Error('DATABASE_URL not configured');
  const sampleN = Number(argValue(args, '--sample') ?? DEFAULT_SAMPLE);
  const maxCalls = Number(
    argValue(args, '--max-calls') ?? Math.ceil(sampleN * CALLS_PER_DOC * CAP_FACTOR),
  );
  const confirm = args.includes('--confirm');
  const outFile = argValue(args, '--out') ?? '.audit-symmetry.jsonl';
  const concurrency = Number(argValue(args, '--concurrency') ?? 2);

  const { rows, matched, withContent } = await selectSample(sampleN);
  console.log(
    `[audit-symmetry] three numbers — source-matched P2 rows: ${matched}; scanned with content: ${withContent}; assessable (swappable) in sample: ${rows.length}`,
  );
  console.log(
    `[audit-symmetry] expected calls: ${rows.length * CALLS_PER_DOC}; cap: ${maxCalls}; est cost ~$${((rows.length * CALLS_PER_DOC * (2300 * 3 + 600 * 15)) / 1e6).toFixed(2)}`,
  );
  if (!confirm) {
    console.log('[audit-symmetry] Precheck only. Run with --confirm to make the calls.');
    return;
  }

  configureAiCallBudget(maxCalls);
  if (args.includes('--second-control')) {
    await runSecondControl(rows, outFile, concurrency);
    const summary2 = summarizeSymmetry(readLedger(outFile));
    for (const line of renderSymmetrySummary(summary2)) console.log(line);
    return;
  }
  const done = alreadyDone(outFile);
  const todo = rows.filter((r) => !done.has(r.rowId));
  console.log(`[audit-symmetry] ${todo.length} documents to run (${done.size} already in ledger)`);
  let processed = 0;
  try {
    await mapConcurrent(todo, concurrency, async (row) => {
      const control = await verdictFor(row, row.content, row.title);
      const swapped = await verdictFor(
        row,
        swapAdministrationTokens(row.content),
        swapAdministrationTokens(row.title),
      );
      const rec: SymmetryRecord = {
        rowId: row.rowId,
        category: row.category,
        original: row.assessment,
        control,
        swapped,
      };
      appendFileSync(outFile, JSON.stringify(rec) + '\n');
      processed++;
      if (processed % 10 === 0) console.log(`[audit-symmetry] ${processed}/${todo.length}...`);
    });
  } catch (err) {
    if (err instanceof AiCallBudgetExceededError) {
      console.error(
        `[audit-symmetry] AI call cap ${maxCalls} reached — stopping (ledger is resumable)`,
      );
      process.exitCode = EXIT_CAP_TRIPPED;
    } else {
      throw err;
    }
  }

  const summary = summarizeSymmetry(readLedger(outFile));
  for (const line of renderSymmetrySummary(summary)) console.log(line);
  console.log(`[audit-symmetry] ledger: ${outFile}`);
}

if (require.main === module) {
  const { loadEnvConfig } = require('@next/env');
  loadEnvConfig(process.cwd());
  main().catch((err) => {
    console.error('[audit-symmetry] Fatal:', err);
    process.exit(1);
  });
}
