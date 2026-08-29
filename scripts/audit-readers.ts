/**
 * CLI: pnpm audit:readers --sample 50 --seed 2026-Q3 --out DIR [--current N]
 *      pnpm audit:readers --score DIR/reader-A.json DIR/reader-B.json --packet DIR/packet.json [--out FILE]
 *
 * Two-outside-reader audit (#816). Packet mode draws a deterministic,
 * era-stratified sample of Pass-2 readings (the same md5(id||seed) ordering
 * the annotation and swap audits use — reproducible and citable), and writes
 * the reader packet (document excerpt + the reviewer's reading), the raw
 * items, and a decisions template. Score mode reads two filled-in decision
 * files and reports agreement with the reviewer, agreement between readers,
 * and Cohen's kappa, per era, plus every item both readers read differently.
 *
 * Read-only against the database; no AI calls.
 */

import { mkdirSync, readFileSync, writeFileSync } from 'fs';
import path from 'path';
import { sql } from 'drizzle-orm';
import { T2_INAUGURATION } from '@/lib/data/analysis-periods';
import { getDb, isDbAvailable } from '@/lib/db';
import {
  buildPacketMarkdown,
  decisionsTemplate,
  ReaderDecisionsFileSchema,
  renderReaderAudit,
  scoreReaders,
  stratifiedSampleSpec,
} from '@/lib/services/reader-audit';
import type { Era, ModelVerdict, PacketItem } from '@/lib/services/reader-audit';
import type { Verdict } from '@/lib/services/verdict-symmetry';
import { checkHelp } from '@/lib/utils/cli-help';
import { stripBoilerplate } from '@/lib/utils/content-cleaners';

const EXCERPT_CHARS = 8000;
const USAGE = `Usage:
  pnpm audit:readers --sample 50 --seed 2026-Q3 --out DIR [--current 35]
  pnpm audit:readers --score DIR/reader-A.json DIR/reader-B.json --packet DIR/packet.json [--out FILE]

Packet mode writes DIR/packet.md (for the readers), DIR/packet.json (raw items),
DIR/decisions-template.json (one copy per reader: fill reader, agree, verdict, reasoning).
Score mode validates both decision files, joins them to the packet, and writes a
ReaderAuditResult JSON (default DIR/result.json) — commit it into lib/data/reader-audits.ts.`;

function argValue(args: string[], flag: string): string | undefined {
  const i = args.indexOf(flag);
  return i >= 0 ? args[i + 1] : undefined;
}

async function sampleEra(
  era: Era,
  n: number,
  seed: string,
): Promise<{ matched: number; withContent: number; items: PacketItem[] }> {
  const db = getDb();
  const eraWhere =
    era === 'current'
      ? sql`a.week_of >= ${T2_INAUGURATION}::date`
      : sql`a.week_of < ${T2_INAUGURATION}::date`;
  const matched = await db.execute(sql`
    SELECT count(*) AS n FROM ai_document_assessments a
    WHERE a.pass = 2 AND NOT a.is_audit_sample AND length(a.reasoning) > 100 AND ${eraWhere}`);
  const rows = await db.execute(sql`
    SELECT a.id, a.category, a.week_of::text AS week_of, a.assessment, a.erosion_type, a.confidence,
      a.reasoning, a.cited_passages, a.counter_arguments, a.comparative_context, a.prompt_version,
      d.title, d.url, d.source_origin, d.source_type, d.published_at::date::text AS published_at,
      LEFT(d.content, ${EXCERPT_CHARS * 2}) AS content
    FROM ai_document_assessments a
    JOIN documents d ON d.url = a.url AND d.category = a.category
    WHERE a.pass = 2 AND NOT a.is_audit_sample AND length(a.reasoning) > 100 AND ${eraWhere}
      AND d.content IS NOT NULL AND length(d.content) >= 400 AND d.retrieval_relevant IS NOT FALSE
    ORDER BY md5(a.id::text || ${seed})
    LIMIT ${n}`);
  const items = (rows.rows as Array<Record<string, unknown>>).map((r) => ({
    id: Number(r.id),
    era,
    category: String(r.category),
    weekOf: String(r.week_of),
    title: String(r.title ?? ''),
    url: (r.url as string | null) ?? null,
    sourceOrigin: (r.source_origin as string | null) ?? null,
    sourceType: (r.source_type as string | null) ?? null,
    publishedAt: (r.published_at as string | null) ?? null,
    excerpt: stripBoilerplate(
      String(r.content ?? ''),
      (r.source_origin as string | null) ?? null,
      String(r.title ?? ''),
    ).slice(0, EXCERPT_CHARS),
    verdict: r.assessment as Verdict,
    erosionType: (r.erosion_type as string | null) ?? null,
    confidence: r.confidence != null ? Number(r.confidence) : null,
    reasoning: String(r.reasoning ?? ''),
    citedPassages: (r.cited_passages as string[] | null) ?? [],
    counterArguments: (r.counter_arguments as string[] | null) ?? [],
    comparativeContext: (r.comparative_context as string | null) ?? null,
    promptVersion: (r.prompt_version as string | null) ?? null,
  }));
  return {
    matched: Number((matched.rows[0] as { n: string }).n),
    withContent: items.length,
    items,
  };
}

async function packetMode(args: string[]): Promise<void> {
  if (!isDbAvailable()) throw new Error('DATABASE_URL not configured');
  const sample = Number(argValue(args, '--sample') ?? 50);
  const seed = argValue(args, '--seed');
  const out = argValue(args, '--out');
  if (!seed || !out) throw new Error(USAGE);
  const spec = stratifiedSampleSpec(
    sample,
    argValue(args, '--current') ? Number(argValue(args, '--current')) : undefined,
  );
  const cur = await sampleEra('current', spec.current, seed);
  const base = await sampleEra('baseline', spec.baseline, seed);
  const items = [...cur.items, ...base.items];
  console.log(
    `[audit-readers] three numbers — source-matched P2 rows: ${cur.matched + base.matched} (current ${cur.matched}, baseline ${base.matched}); ` +
      `sampled with content: ${cur.withContent + base.withContent}; packet items: ${items.length} (current ${cur.items.length}, baseline ${base.items.length})`,
  );
  mkdirSync(out, { recursive: true });
  writeFileSync(path.join(out, 'packet.md'), buildPacketMarkdown(items, seed));
  writeFileSync(path.join(out, 'packet.json'), JSON.stringify(items, null, 1));
  writeFileSync(
    path.join(out, 'decisions-template.json'),
    JSON.stringify(decisionsTemplate(items, seed), null, 2),
  );
  console.log(`[audit-readers] wrote ${out}/packet.md, packet.json, decisions-template.json`);
}

function scoreMode(args: string[]): void {
  const i = args.indexOf('--score');
  const [fileA, fileB] = [args[i + 1], args[i + 2]];
  const packetPath = argValue(args, '--packet') ?? path.join(path.dirname(fileA), 'packet.json');
  const a = ReaderDecisionsFileSchema.parse(JSON.parse(readFileSync(fileA, 'utf8')));
  const b = ReaderDecisionsFileSchema.parse(JSON.parse(readFileSync(fileB, 'utf8')));
  const packet = JSON.parse(readFileSync(packetPath, 'utf8')) as PacketItem[];
  if (a.seed !== b.seed) throw new Error(`seed mismatch: ${a.seed} vs ${b.seed}`);
  const model: ModelVerdict[] = packet.map((p) => ({ id: p.id, era: p.era, verdict: p.verdict }));
  const result = scoreReaders(model, a, b);
  const out = argValue(args, '--out') ?? path.join(path.dirname(packetPath), 'result.json');
  writeFileSync(out, JSON.stringify(result, null, 2));
  for (const line of renderReaderAudit(result)) console.log(line);
  console.log(`[audit-readers] result: ${out}`);
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  checkHelp(args, USAGE);
  if (args.includes('--score')) {
    scoreMode(args);
    return;
  }
  await packetMode(args);
}

if (require.main === module) {
  const { loadEnvConfig } = require('@next/env');
  loadEnvConfig(process.cwd());
  main().catch((err) => {
    console.error('[audit-readers] Fatal:', err);
    process.exit(1);
  });
}
