/**
 * validate:mf-drops / validate:ia-drops (#524, #545; generalized in #834) —
 * LLM audit over the FR drop ledger for any filtered category.
 *
 * Runs the gpt-4o-mini relevance gate over recent drop-ledger rows and
 * reports disagreements (docs the LLM considers category-relevant that the
 * pattern filter dropped). Disagreements need human adjudication: if the
 * LLM is right, the doc joins the labeled sample and the allowlist gets a
 * versioned change re-verified against sample + holdout.
 *
 * Usage: pnpm validate:mf-drops [--days N]   (default 35)
 *        pnpm validate:ia-drops [--days N]   (--category infoAvailability)
 */
import { desc, eq, gte, and } from 'drizzle-orm';
import { getProvider } from '@/lib/ai/provider';
import { getDb } from '@/lib/db';
import { frDropLedger } from '@/lib/db/schema';

const AUDIT_MODEL = 'gpt-4o-mini';
const DISAGREEMENT_ALERT_THRESHOLD = 3;

const GATE_PROMPTS: Record<string, string> = {
  mediaFreedom: `You screen U.S. Federal Register documents for a press-freedom monitoring category.
Reply with exactly one word: YES if the document's subject matter concerns public information access or the press (FOIA/public-records policy, procedures, fees, or rescissions; press credentials or access; journalist protections; whistleblower disclosure and records production rules; agency records-disclosure regulations), otherwise NO.
Privacy Act system-of-records notices, paperwork/information-collection notices, org-chart notices, meetings, and sector regulations are NO.`,
  infoAvailability: `You screen U.S. Federal Register documents for a government-information-availability monitoring category.
Reply with exactly one word: YES if the document's SUBJECT is public access to government information (FOIA or records-access rules; public disclosure or reporting requirements; public registries or data systems; NEPA implementing regulations or public-participation requirements; records-release determinations; Privacy Act implementation or exemption rules; discontinuance of an information collection), otherwise NO.
Privacy Act system-of-records NOTICES, routine information-collection renewals, matching programs, meetings, advisory committees, project-level environmental impact statements, consumer or tax filing requirements, and sector regulations are NO.`,
};

function parseDays(): number {
  const idx = process.argv.indexOf('--days');
  const value = idx >= 0 ? Number(process.argv[idx + 1]) : NaN;
  return Number.isFinite(value) && value > 0 ? value : 35;
}

function parseCategory(): string {
  const idx = process.argv.indexOf('--category');
  return idx >= 0 ? process.argv[idx + 1] : 'mediaFreedom';
}

async function main() {
  const { loadEnvConfig } = require('@next/env');
  loadEnvConfig(process.cwd());

  const days = parseDays();
  const category = parseCategory();
  const gatePrompt = GATE_PROMPTS[category];
  if (!gatePrompt) {
    console.error(`[drops-audit] No gate prompt configured for category '${category}'.`);
    process.exit(1);
  }
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
    .where(and(eq(frDropLedger.category, category), gte(frDropLedger.createdAt, since)))
    .orderBy(desc(frDropLedger.createdAt));

  console.log(
    `[drops-audit:${category}] Auditing ${rows.length} drops from the last ${days} days...`,
  );
  const disagreements: Array<{ title: string; url: string; publishedAt: string | null }> = [];

  for (const row of rows) {
    const result = await provider.complete(
      `Agency: ${row.agency ?? 'unknown'}\nTitle: ${row.title}`,
      { model: AUDIT_MODEL, maxTokens: 2, temperature: 0, systemPrompt: gatePrompt },
    );
    if (/YES/i.test(result.content)) {
      disagreements.push({ title: row.title, url: row.url, publishedAt: row.publishedAt });
    }
  }

  console.log(
    `\n[drops-audit:${category}] ${disagreements.length} disagreement(s) out of ${rows.length} drops.`,
  );
  for (const d of disagreements) {
    console.log(`  - [${d.publishedAt ?? '?'}] ${d.title}\n    ${d.url}`);
  }
  if (disagreements.length >= DISAGREEMENT_ALERT_THRESHOLD) {
    console.log(
      `\n[drops-audit:${category}] ALERT: >= ${DISAGREEMENT_ALERT_THRESHOLD} disagreements — adjudicate and consider a versioned allowlist change (re-verify against the labeled sample + a fresh holdout).`,
    );
    process.exit(2);
  }
}

main().catch((err) => {
  console.error('[mf-drops] Failed:', err);
  process.exit(1);
});
