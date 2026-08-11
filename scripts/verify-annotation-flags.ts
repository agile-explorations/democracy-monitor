/**
 * Verification + correction-drafting for screener-flagged annotations
 * (#712 stage 2). The cheap screener over-flags ~50% (measured 5/9 false
 * positives on the #711 sample), so every flagged row gets a Sonnet call
 * that must QUOTE the document evidence settling each flagged claim, then
 * either declares FALSE_POSITIVE or drafts a minimal corrected reasoning
 * (preserving the assessment verdict and analytical framing — only fixing
 * attribution, context-marking, or misdescription).
 *
 * Reads the screening ledger; writes a corrections ledger. Read-only
 * against the database. The original reasoning is snapshotted into the
 * corrections ledger so apply-annotation-corrections.ts can guard on
 * exact-match.
 *
 * Usage:
 *   pnpm verify:annotation-flags --ledger FILE.jsonl            # Dry run
 *   pnpm verify:annotation-flags --ledger FILE.jsonl --confirm [--out FILE]
 */

import { appendFileSync, readFileSync } from 'fs';
import { sql } from 'drizzle-orm';
import { getProvider } from '@/lib/ai/provider';
import { getDb, isDbAvailable } from '@/lib/db';
import { checkHelp } from '@/lib/utils/cli-help';

const VERIFY_MODEL = 'claude-sonnet-4-6';
const DOC_CONTENT_CHARS = 15000;
const CALL_CAP_FACTOR = 1.25;

interface ScreenedRow {
  rowId: number;
  era: string;
  category: string;
  claims: Array<{ claim: string; classification: string; note?: string }>;
}

interface CorrectionRecord {
  rowId: number;
  era: string;
  category: string;
  verdict: 'TRUE_POSITIVE' | 'FALSE_POSITIVE';
  evidence: string;
  originalReasoning: string;
  correctedReasoning?: string;
}

const VERIFY_PROMPT = (
  reasoning: string,
  flagged: string[],
  content: string,
  truncated: boolean,
) => `You are verifying whether flagged claims in an AI-written annotation are actually unsupported by the government document it describes, and drafting a minimal correction if so.

ANNOTATION (displayed publicly beside the document):
${reasoning}

FLAGGED CLAIMS (a cheap screener suspects these are unsupported — it is wrong about half the time):
${flagged.map((c, i) => `${i + 1}. ${c}`).join('\n')}

DOCUMENT CONTENT${truncated ? ' (truncated)' : ''}:
${content}

For each flagged claim, find the document text that settles it. Rules:
- If the claim is stated in or directly supported by the document, or the annotation already attributes it properly ("The speaker charges...", "(context: ...)"), the flag is a FALSE_POSITIVE for that claim.
- The annotation's own analytical judgments (significance, routineness, erosion typing) are its job — never defects.
- Real defects are: rhetoric stated as fact without attribution; real-world knowledge presented as document content; causal acts credited to the wrong instrument; misdescriptions of what the document says.

If EVERY flagged claim is a false positive: verdict FALSE_POSITIVE.
If ANY flagged claim is a real defect: verdict TRUE_POSITIVE, and draft the corrected annotation — a MINIMAL edit of the original preserving its assessment and framing, fixing only the defect(s) (add attribution "The speaker charges that...", mark external knowledge "(context: ...)", or correct the misdescription). Keep similar length.

Return ONLY JSON:
{"verdict":"TRUE_POSITIVE|FALSE_POSITIVE","evidence":"the document text that settles it (<=300 chars)","correctedReasoning":"full corrected text (TRUE_POSITIVE only)"}`;

function loadFlagged(ledgerPath: string): ScreenedRow[] {
  return readFileSync(ledgerPath, 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((l) => JSON.parse(l) as ScreenedRow)
    .filter((r) =>
      r.claims.some(
        (c) => c.classification === 'UNSUPPORTED_EXTERNAL' || c.classification === 'CONTRADICTED',
      ),
    );
}

function alreadyVerified(outFile: string): Set<number> {
  try {
    return new Set(
      readFileSync(outFile, 'utf8')
        .split('\n')
        .filter(Boolean)
        .map((l) => (JSON.parse(l) as CorrectionRecord).rowId),
    );
  } catch {
    return new Set();
  }
}

async function fetchRowAndDoc(
  rowId: number,
): Promise<{ reasoning: string; content: string; truncated: boolean } | null> {
  // nosemgrep: opengrep.cron-needs-env-config — loadEnvConfig called in CLI entry block below
  const db = getDb();
  const rows = await db.execute(sql`
    SELECT a.reasoning, LEFT(d.content, ${DOC_CONTENT_CHARS}) AS content,
      length(d.content) AS content_len
    FROM ai_document_assessments a
    JOIN documents d ON d.url = a.url AND d.category = a.category
    WHERE a.id = ${rowId}`);
  const r = rows.rows[0] as
    | { reasoning: string; content: string | null; content_len: number }
    | undefined;
  if (!r) return null;
  return {
    reasoning: r.reasoning,
    content: r.content ?? '',
    truncated: r.content_len > DOC_CONTENT_CHARS,
  };
}

function parseCorrection(
  content: string,
  row: ScreenedRow,
  originalReasoning: string,
): CorrectionRecord | null {
  try {
    const raw = content.replace(/```json|```/g, '').trim();
    const parsed = JSON.parse(raw) as {
      verdict: CorrectionRecord['verdict'];
      evidence: string;
      correctedReasoning?: string;
    };
    if (parsed.verdict !== 'TRUE_POSITIVE' && parsed.verdict !== 'FALSE_POSITIVE') return null;
    if (parsed.verdict === 'TRUE_POSITIVE' && !parsed.correctedReasoning) return null;
    return {
      rowId: row.rowId,
      era: row.era,
      category: row.category,
      verdict: parsed.verdict,
      evidence: (parsed.evidence ?? '').slice(0, 400),
      originalReasoning,
      correctedReasoning: parsed.correctedReasoning,
    };
  } catch {
    console.warn(`[verify-flags] unparseable verdict for row ${row.rowId}`);
    return null;
  }
}

// eslint-disable-next-line max-lines-per-function
async function main(): Promise<void> {
  if (!isDbAvailable()) throw new Error('DATABASE_URL not configured');
  const args = process.argv.slice(2);
  const confirm = args.includes('--confirm');
  const ledgerPath = args[args.indexOf('--ledger') + 1];
  if (!args.includes('--ledger') || !ledgerPath) throw new Error('--ledger FILE required');
  const outFile = args.includes('--out')
    ? args[args.indexOf('--out') + 1]
    : ledgerPath.replace(/\.jsonl$/, '') + '.corrections.jsonl';

  const skip = alreadyVerified(outFile);
  const flagged = loadFlagged(ledgerPath).filter((r) => !skip.has(r.rowId));
  const callCap = Math.ceil(flagged.length * CALL_CAP_FACTOR);
  console.log(
    `[verify-flags] flagged=${flagged.length}${skip.size ? ` (resume: ${skip.size} done)` : ''}, cap=${callCap}, est cost ~$${((flagged.length * 5000 * 3) / 1e6 + (flagged.length * 600 * 15) / 1e6).toFixed(2)}`,
  );
  if (!confirm) {
    console.log('[verify-flags] Dry run complete. Run with --confirm to verify.');
    return;
  }

  const provider = getProvider('anthropic');
  if (!provider.isAvailable()) throw new Error('ANTHROPIC_API_KEY not configured');
  let calls = 0;
  let tp = 0;
  let fp = 0;
  for (const row of flagged) {
    if (calls >= callCap) throw new Error(`call cap ${callCap} reached — aborting (#563)`);
    const fetched = await fetchRowAndDoc(row.rowId);
    if (!fetched) continue;
    const flaggedClaims = row.claims
      .filter(
        (c) => c.classification === 'UNSUPPORTED_EXTERNAL' || c.classification === 'CONTRADICTED',
      )
      .map((c) => c.claim);
    calls++;
    try {
      const result = await provider.complete(
        VERIFY_PROMPT(fetched.reasoning, flaggedClaims, fetched.content, fetched.truncated),
        { temperature: 0, model: VERIFY_MODEL, maxTokens: 1500 },
      );
      const record = parseCorrection(result.content, row, fetched.reasoning);
      if (record) {
        if (record.verdict === 'TRUE_POSITIVE') tp++;
        else fp++;
        appendFileSync(outFile, JSON.stringify(record) + '\n');
      }
    } catch (err) {
      console.warn(`[verify-flags] row ${row.rowId} failed:`, (err as Error).message);
    }
    if (calls % 25 === 0)
      console.log(`[verify-flags] ${calls}/${flagged.length} (tp=${tp} fp=${fp})...`);
  }
  console.log(
    `\n=== VERIFY (${calls} calls) === TRUE_POSITIVE ${tp} | FALSE_POSITIVE ${fp} | ledger: ${outFile}`,
  );
}

if (require.main === module) {
  const { loadEnvConfig } = require('@next/env');
  loadEnvConfig(process.cwd());
  checkHelp(
    process.argv.slice(2),
    'Usage: pnpm verify:annotation-flags --ledger FILE.jsonl [--confirm] [--out FILE]',
  );
  main()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('[verify-flags] Fatal:', err);
      process.exit(1);
    });
}
