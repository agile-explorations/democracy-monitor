/**
 * Reproducibility audit: re-runs a sample of stored AI assessments and compares.
 *
 * Usage:
 *   npx tsx scripts/reproducibility-check.ts --category civilService --sample 50
 */
// @ts-expect-error @next/env ships with Next.js but lacks type declarations
import { loadEnvConfig } from '@next/env';
import { and, eq, sql } from 'drizzle-orm';
import { getProvider } from '@/lib/ai/provider';
import { CATEGORIES } from '@/lib/data/categories';
import { getDb, isDbAvailable } from '@/lib/db';
import { aiDocumentAssessments, documents } from '@/lib/db/schema';
import { assessPass1 } from '@/lib/services/layer2-assessment-service';
import type { ContentItem } from '@/lib/types';
import { sleep } from '@/lib/utils/async';

const AGREEMENT_THRESHOLD = 0.9;
const RATE_LIMIT_MS = 200;

interface AuditResult {
  url: string;
  originalRelevant: boolean;
  rerunRelevant: boolean | null;
  agreed: boolean;
}

interface StoredAssessment {
  url: string;
  relevant: boolean | null;
  model: string;
}

interface DocRecord {
  title: string;
  url: string | null;
  content: string | null;
  publishedAt: Date | null;
  sourceType: string;
  metadata: unknown;
}

function parseArgs() {
  const args = process.argv.slice(2);
  const categoryIdx = args.indexOf('--category');
  const sampleIdx = args.indexOf('--sample');

  const categoryKey = categoryIdx >= 0 ? args[categoryIdx + 1] : undefined;
  const sampleSize = sampleIdx >= 0 ? parseInt(args[sampleIdx + 1], 10) : 20;

  return { categoryKey, sampleSize };
}

function toContentItem(doc: DocRecord): ContentItem {
  return {
    title: doc.title,
    link: doc.url ?? undefined,
    summary: doc.content?.slice(0, 2000) ?? '',
    pubDate: doc.publishedAt?.toISOString(),
    type: doc.sourceType,
    agency: (doc.metadata as Record<string, string>)?.agency,
  };
}

async function rerunAssessments(
  stored: StoredAssessment[],
  docByUrl: Map<string, DocRecord>,
  categoryDescription: string,
): Promise<AuditResult[]> {
  const provider = getProvider('openai');
  const results: AuditResult[] = [];

  for (const assessment of stored) {
    const doc = docByUrl.get(assessment.url);
    if (!doc) {
      results.push({
        url: assessment.url,
        originalRelevant: assessment.relevant ?? false,
        rerunRelevant: null,
        agreed: false,
      });
      continue;
    }

    const contentItem = toContentItem(doc);
    const rerun = await assessPass1(contentItem, categoryDescription, provider, assessment.model);
    const agreed = rerun ? rerun.response.relevant === assessment.relevant : false;

    results.push({
      url: assessment.url,
      originalRelevant: assessment.relevant ?? false,
      rerunRelevant: rerun?.response.relevant ?? null,
      agreed,
    });

    await sleep(RATE_LIMIT_MS);
  }

  return results;
}

function reportResults(results: AuditResult[]) {
  const successfulReruns = results.filter((r) => r.rerunRelevant !== null);
  const agreements = successfulReruns.filter((r) => r.agreed);
  const agreementRate =
    successfulReruns.length > 0 ? agreements.length / successfulReruns.length : 0;

  console.log(`\n[audit] Results:`);
  console.log(`  Total sampled: ${results.length}`);
  console.log(`  Successfully re-run: ${successfulReruns.length}`);
  console.log(`  Agreements: ${agreements.length}`);
  console.log(`  Agreement rate: ${(agreementRate * 100).toFixed(1)}%`);

  if (agreementRate < AGREEMENT_THRESHOLD) {
    console.warn(
      `\n[audit] WARNING: Agreement rate ${(agreementRate * 100).toFixed(1)}% ` +
        `is below threshold ${(AGREEMENT_THRESHOLD * 100).toFixed(1)}%`,
    );

    const disagreements = successfulReruns.filter((r) => !r.agreed);
    console.log('\nDisagreements:');
    for (const d of disagreements.slice(0, 10)) {
      console.log(`  ${d.url}: original=${d.originalRelevant} rerun=${d.rerunRelevant}`);
    }
  } else {
    console.log(`\n[audit] PASS: Agreement rate meets threshold`);
  }
}

async function main() {
  const { categoryKey, sampleSize } = parseArgs();

  if (!isDbAvailable()) {
    console.error('Database not available');
    process.exit(1);
  }

  const db = getDb();
  const category = categoryKey ? CATEGORIES.find((c) => c.key === categoryKey) : CATEGORIES[0];
  if (!category) {
    console.error(`Unknown category: ${categoryKey}`);
    process.exit(1);
  }

  console.log(`[audit] Category: ${category.key}, sample size: ${sampleSize}`);

  const stored = await db
    .select({
      url: aiDocumentAssessments.url,
      relevant: aiDocumentAssessments.relevant,
      model: aiDocumentAssessments.model,
    })
    .from(aiDocumentAssessments)
    .where(and(eq(aiDocumentAssessments.category, category.key), eq(aiDocumentAssessments.pass, 1)))
    .orderBy(sql`RANDOM()`)
    .limit(sampleSize);

  if (stored.length === 0) {
    console.log('[audit] No stored assessments found');
    return;
  }

  console.log(`[audit] Found ${stored.length} stored assessments to re-run`);

  const urls = stored.map((s) => s.url);
  const docs = await db
    .select()
    .from(documents)
    .where(sql`${documents.url} = ANY(${urls})`);

  const docByUrl = new Map<string, DocRecord>();
  for (const d of docs) {
    if (d.url) docByUrl.set(d.url, d);
  }
  const results = await rerunAssessments(stored, docByUrl, category.description);
  reportResults(results);
}

loadEnvConfig(process.cwd());
main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('[audit] Fatal error:', err);
    process.exit(1);
  });
