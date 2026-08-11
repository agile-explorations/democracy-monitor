/**
 * Sampled annotation-vs-document audit (#711): estimates how often P2 review
 * annotations (ai_document_assessments.reasoning) assert specifics the
 * underlying document does not support. Born from two found poisonings
 * (EO 14029 credited with EO 14003's revocation; a statutory 30-day notice
 * put in a speaker's mouth) that re-poisoned research answers through the
 * synthesis context despite prompt-level guards.
 *
 * Stratified random sample (era x proportional category), one gpt-4o-mini
 * call per row classifying each specific claim against up to 40k chars of
 * stored content: SUPPORTED / UNSUPPORTED_EXTERNAL / CONTRADICTED /
 * UNVERIFIABLE. Read-only against the target database except for nothing —
 * results print as a report plus a JSONL ledger for corrections.
 *
 * Usage:
 *   pnpm audit:annotations                 # Dry run: sample + cost model only
 *   pnpm audit:annotations --confirm       # Run the audit (default 200 rows)
 *   pnpm audit:annotations --confirm --sample 100 --out FILE.jsonl
 */

import { appendFileSync } from 'fs';
import { sql } from 'drizzle-orm';
import { getProvider } from '@/lib/ai/provider';
import { getDb, isDbAvailable } from '@/lib/db';
import { checkHelp } from '@/lib/utils/cli-help';

const AUDIT_MODEL = 'gpt-4o-mini';
const DOC_CONTENT_CHARS = 40000;
const DEFAULT_SAMPLE = 200;
/** Hard call cap: expected x 1.25 (#563 — deterministic loop). */
const CALL_CAP_FACTOR = 1.25;
const T2_START = '2025-01-20';

interface SampleRow {
  id: number;
  category: string;
  reasoning: string;
  doc_id: number;
  era: string;
  content: string | null;
  content_len: number;
}

interface ClaimFinding {
  claim: string;
  classification: 'SUPPORTED' | 'UNSUPPORTED_EXTERNAL' | 'CONTRADICTED' | 'UNVERIFIABLE';
  note?: string;
}

interface RowVerdict {
  rowId: number;
  era: string;
  category: string;
  verdict: 'clean' | 'minor' | 'poisoned';
  claims: ClaimFinding[];
}

const AUDIT_PROMPT = (reasoning: string, content: string, truncated: boolean) =>
  `You are auditing an AI-written annotation against the government document it describes.

ANNOTATION:
${reasoning}

DOCUMENT CONTENT${truncated ? ' (truncated — later text unavailable)' : ''}:
${content}

Extract every SPECIFIC factual claim the annotation makes about this document (named people/roles, numbers, dates, statutes, order/bill numbers, causal attributions like "this order revokes X", quoted phrases). For each, classify:
- SUPPORTED: the document's text states it.
- UNSUPPORTED_EXTERNAL: plausibly true real-world knowledge presented as if the document states it, but the document does not.
- CONTRADICTED: the document's text says otherwise.
- UNVERIFIABLE: would require text beyond what is shown.
General characterizations (tone, significance, erosion typing) are NOT specific claims — skip them.

Return ONLY JSON: {"claims":[{"claim":"...","classification":"...","note":"..."}],"verdict":"clean|minor|poisoned"}
verdict: "poisoned" if any claim is CONTRADICTED or UNSUPPORTED_EXTERNAL on a load-bearing specific (who did what, which instrument, statutory requirements, quoted words); "minor" for small deviations only (a shortened quote, an approximated number); "clean" otherwise.`;

async function drawSample(n: number): Promise<SampleRow[]> {
  // nosemgrep: opengrep.cron-needs-env-config — loadEnvConfig called in CLI entry block below
  const db = getDb();
  const perEra = Math.floor(n / 2);
  const draw = async (eraCond: ReturnType<typeof sql>, era: string, count: number) =>
    (
      await db.execute(sql`
        SELECT a.id, a.category, a.reasoning, d.id AS doc_id, ${era} AS era,
          LEFT(d.content, ${DOC_CONTENT_CHARS}) AS content, length(d.content) AS content_len
        FROM ai_document_assessments a
        JOIN documents d ON d.url = a.url AND d.category = a.category
        WHERE a.pass = 2 AND length(a.reasoning) > 100 AND d.content IS NOT NULL
          AND ${eraCond}
        ORDER BY md5(a.id::text || 'audit-711')
        LIMIT ${count}`)
    ).rows as unknown as SampleRow[];
  const baseline = await draw(sql`d.published_at < ${T2_START}`, 'baseline', perEra);
  const current = await draw(sql`d.published_at >= ${T2_START}`, 'current', n - perEra);
  return [...baseline, ...current];
}

function parseVerdict(content: string, rowId: number, era: string, cat: string): RowVerdict | null {
  try {
    const raw = content.replace(/```json|```/g, '').trim();
    const parsed = JSON.parse(raw) as { claims: ClaimFinding[]; verdict: RowVerdict['verdict'] };
    if (!parsed.verdict || !Array.isArray(parsed.claims)) return null;
    return { rowId, era, category: cat, verdict: parsed.verdict, claims: parsed.claims };
  } catch {
    console.warn(`[audit-annotations] unparseable verdict for row ${rowId}`);
    return null;
  }
}

// eslint-disable-next-line max-lines-per-function
async function main(): Promise<void> {
  if (!isDbAvailable()) throw new Error('DATABASE_URL not configured');
  const args = process.argv.slice(2);
  const confirm = args.includes('--confirm');
  const sampleN = args.includes('--sample')
    ? Number(args[args.indexOf('--sample') + 1])
    : DEFAULT_SAMPLE;
  const outFile = args.includes('--out')
    ? args[args.indexOf('--out') + 1]
    : `/tmp/annotation-audit-${sampleN}.jsonl`;

  const rows = await drawSample(sampleN);
  const callCap = Math.ceil(rows.length * CALL_CAP_FACTOR);
  console.log(
    `[audit-annotations] sample=${rows.length} (baseline ${rows.filter((r) => r.era === 'baseline').length} / current ${rows.filter((r) => r.era === 'current').length}), call cap=${callCap}, est cost ~$${((rows.length * 10500 * 0.15) / 1e6 + (rows.length * 350 * 0.6) / 1e6).toFixed(2)}`,
  );
  if (!confirm) {
    console.log('[audit-annotations] Dry run complete. Run with --confirm to audit.');
    return;
  }

  const provider = getProvider('openai');
  if (!provider.isAvailable()) throw new Error('OPENAI_API_KEY not configured');
  let calls = 0;
  const verdicts: RowVerdict[] = [];
  for (const row of rows) {
    if (calls >= callCap) throw new Error(`call cap ${callCap} reached — aborting (#563)`);
    calls++;
    try {
      const result = await provider.complete(
        AUDIT_PROMPT(row.reasoning, row.content ?? '', row.content_len > DOC_CONTENT_CHARS),
        { temperature: 0, model: AUDIT_MODEL, maxTokens: 2500 },
      );
      const verdict = parseVerdict(result.content, row.id, row.era, row.category);
      if (verdict) {
        verdicts.push(verdict);
        appendFileSync(outFile, JSON.stringify(verdict) + '\n');
      }
    } catch (err) {
      console.warn(`[audit-annotations] row ${row.id} failed:`, (err as Error).message);
    }
    if (calls % 25 === 0) console.log(`[audit-annotations] ${calls}/${rows.length}...`);
  }

  const byVerdict = (v: RowVerdict['verdict']) => verdicts.filter((x) => x.verdict === v);
  const byEra = (era: string, v: RowVerdict['verdict']) =>
    verdicts.filter((x) => x.era === era && x.verdict === v).length;
  console.log(`\n=== ANNOTATION AUDIT (${verdicts.length} rows judged, ${calls} calls) ===`);
  for (const v of ['clean', 'minor', 'poisoned'] as const) {
    console.log(
      `${v.padEnd(9)} ${String(byVerdict(v).length).padStart(4)}  (baseline ${byEra('baseline', v)}, current ${byEra('current', v)})`,
    );
  }
  const claimCounts = new Map<string, number>();
  for (const v of verdicts)
    for (const c of v.claims)
      claimCounts.set(c.classification, (claimCounts.get(c.classification) ?? 0) + 1);
  console.log('claims:', Object.fromEntries(claimCounts));
  console.log(`ledger: ${outFile}`);
  for (const v of byVerdict('poisoned').slice(0, 15)) {
    const worst = v.claims.find(
      (c) => c.classification === 'CONTRADICTED' || c.classification === 'UNSUPPORTED_EXTERNAL',
    );
    console.log(`  row ${v.rowId} [${v.era}/${v.category}]: ${worst?.claim?.slice(0, 110)}`);
  }
}

if (require.main === module) {
  const { loadEnvConfig } = require('@next/env');
  loadEnvConfig(process.cwd());
  checkHelp(
    process.argv.slice(2),
    'Usage: pnpm audit:annotations [--confirm] [--sample N] [--out FILE]',
  );
  main()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('[audit-annotations] Fatal:', err);
      process.exit(1);
    });
}
