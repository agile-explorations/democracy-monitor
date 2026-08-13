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
- A claim is supported ONLY if the document's text states it AND the annotation presents it the way the document does. If the document contains it as someone's RHETORIC but the annotation states it as established fact, that is a REAL DEFECT (rhetoric-as-fact), not a false positive.
- The annotation's own analytical judgments (significance, routineness, erosion typing) are its job — never defects.
- Real defects are: rhetoric stated as fact without attribution; real-world knowledge presented as document content; causal acts credited to the wrong instrument; misdescriptions of what the document says.

If EVERY flagged claim is a false positive: verdict FALSE_POSITIVE.
If ANY flagged claim is a real defect: verdict TRUE_POSITIVE, and draft the corrected annotation. Drafting rules:
- Fix EVERY defect of these classes in the ENTIRE annotation, not just the flagged span — before returning, re-audit your corrected text sentence by sentence against the document to the same standard; a defect surviving in the "corrected" text is a failed correction.
- NEVER attribute a statement to a named person unless the document shows that person saying it — re-voicing analyst commentary as "Senator X charges..." fabricates a quote. If a claim has no in-document source, either mark it "(context: ...)" as the annotation's own analysis, or delete it.
- A correction that merely rephrases the same unsupported claim ("is framed by proponents as X" -> "proponents frame it as X") is NOT a fix — remove or context-mark the claim.
- Documents that are only a bill title or a one-line summary support almost nothing: strip or context-mark every mechanism/effect claim beyond the title's own words.
- Conditional effect/impact claims and superlatives ("would constitute...", "eliminating the capacity...", "unprecedented") must either quote the document or carry a "(context: ...)" marker — apply this to every such phrase in the paragraph, including ones carried over from the original.
- Preserve the original assessment stance and keep similar length where possible.

Respond with ONLY a single JSON object — no analysis, no preamble, your first character must be "{":
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
    // The model sometimes prefixes prose analysis despite the format
    // instruction — extract the outermost JSON object.
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    const parsed = JSON.parse(jsonMatch ? jsonMatch[0] : raw) as {
      verdict: CorrectionRecord['verdict'];
      evidence: string;
      correctedReasoning?: string;
    };
    if (parsed.verdict !== 'TRUE_POSITIVE' && parsed.verdict !== 'FALSE_POSITIVE') {
      console.warn(
        `[verify-flags] row ${row.rowId}: unexpected verdict ${JSON.stringify(parsed.verdict).slice(0, 60)}`,
      );
      return null;
    }
    if (parsed.verdict === 'TRUE_POSITIVE' && !parsed.correctedReasoning) {
      console.warn(`[verify-flags] row ${row.rowId}: TRUE_POSITIVE without correctedReasoning`);
      return null;
    }
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
    console.warn(
      `[verify-flags] unparseable verdict for row ${row.rowId}: ${content.slice(0, 120).replace(/\n/g, ' ')}…[len ${content.length}]`,
    );
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
  const concurrency = args.includes('--concurrency')
    ? Number(args[args.indexOf('--concurrency') + 1])
    : 6;
  let calls = 0;
  let tp = 0;
  let fp = 0;
  const verifyRow = async (row: ScreenedRow) => {
    if (calls >= callCap) throw new Error(`call cap ${callCap} reached — aborting (#563)`);
    let fetched: Awaited<ReturnType<typeof fetchRowAndDoc>>;
    try {
      fetched = await fetchRowAndDoc(row.rowId);
    } catch {
      // Transient DB errors (connection resets) must not kill the stage —
      // retry once, then skip the row (ledger-resume picks it up later).
      await new Promise((r) => setTimeout(r, 5000));
      try {
        fetched = await fetchRowAndDoc(row.rowId);
      } catch (err) {
        console.warn(`[verify-flags] row ${row.rowId} DB fetch failed twice, skipping:`, err);
        return;
      }
    }
    if (!fetched) return;
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
    if (calls % 100 === 0)
      console.log(`[verify-flags] ${calls}/${flagged.length} (tp=${tp} fp=${fp})...`);
  };
  // Bounded worker pool (Sonnet rate limits tolerate ~6 concurrent).
  for (let i = 0; i < flagged.length; i += concurrency) {
    await Promise.all(flagged.slice(i, i + concurrency).map(verifyRow));
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
