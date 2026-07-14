/**
 * validate:mf-drops (#524, #545) — LLM audit over the FR drop ledger.
 *
 * Runs the gpt-4o-mini relevance gate over recent drop-ledger rows and
 * reports disagreements (docs the LLM considers press-freedom-relevant that
 * the pattern filter dropped). Disagreements need human adjudication: if the
 * LLM is right, the doc joins the labeled sample and the allowlist gets a
 * versioned change re-verified against sample + holdout.
 *
 * Usage: pnpm validate:mf-drops [--days N] (default 35)
 */
import { desc, eq, gte, and } from 'drizzle-orm';
import { getProvider } from '@/lib/ai/provider';
import { getDb } from '@/lib/db';
import { frDropLedger } from '@/lib/db/schema';

const AUDIT_MODEL = 'gpt-4o-mini';
const DISAGREEMENT_ALERT_THRESHOLD = 3;

const GATE_PROMPT = `You screen U.S. Federal Register documents for a press-freedom monitoring category.
Reply with exactly one word: YES if the document's subject matter concerns public information access or the press (FOIA/public-records policy, procedures, fees, or rescissions; press credentials or access; journalist protections; whistleblower disclosure and records production rules; agency records-disclosure regulations), otherwise NO.
Privacy Act system-of-records notices, paperwork/information-collection notices, org-chart notices, meetings, and sector regulations are NO.`;

function parseDays(): number {
  const idx = process.argv.indexOf('--days');
  const value = idx >= 0 ? Number(process.argv[idx + 1]) : NaN;
  return Number.isFinite(value) && value > 0 ? value : 35;
}

async function main() {
  const { loadEnvConfig } = require('@next/env');
  loadEnvConfig(process.cwd());

  const days = parseDays();
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const provider = getProvider('openai');
  if (!provider.isAvailable()) {
    console.error('[mf-drops] OPENAI_API_KEY not configured — cannot run audit.');
    process.exit(1);
  }

  const db = getDb();
  const rows = await db
    .select()
    .from(frDropLedger)
    .where(and(eq(frDropLedger.category, 'mediaFreedom'), gte(frDropLedger.createdAt, since)))
    .orderBy(desc(frDropLedger.createdAt));

  console.log(`[mf-drops] Auditing ${rows.length} drops from the last ${days} days...`);
  const disagreements: Array<{ title: string; url: string; publishedAt: string | null }> = [];

  for (const row of rows) {
    const result = await provider.complete(
      `Agency: ${row.agency ?? 'unknown'}\nTitle: ${row.title}`,
      { model: AUDIT_MODEL, maxTokens: 2, temperature: 0, systemPrompt: GATE_PROMPT },
    );
    if (/YES/i.test(result.content)) {
      disagreements.push({ title: row.title, url: row.url, publishedAt: row.publishedAt });
    }
  }

  console.log(`\n[mf-drops] ${disagreements.length} disagreement(s) out of ${rows.length} drops.`);
  for (const d of disagreements) {
    console.log(`  - [${d.publishedAt ?? '?'}] ${d.title}\n    ${d.url}`);
  }
  if (disagreements.length >= DISAGREEMENT_ALERT_THRESHOLD) {
    console.log(
      `\n[mf-drops] ALERT: >= ${DISAGREEMENT_ALERT_THRESHOLD} disagreements — adjudicate and consider a versioned allowlist change (re-verify against the labeled sample + a fresh holdout).`,
    );
    process.exit(2);
  }
}

main().catch((err) => {
  console.error('[mf-drops] Failed:', err);
  process.exit(1);
});
