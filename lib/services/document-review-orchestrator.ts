import type { Pass2WeekContext } from '@/lib/ai/prompts/document-review-pass2';
import { getProvider } from '@/lib/ai/provider';
import { CATEGORIES } from '@/lib/data/categories';
import { AUDIT_SAMPLE_RATE } from '@/lib/methodology/scoring-config';
import type { ContentItem } from '@/lib/types';
import type { AIAssessmentSummary } from '@/lib/types/structural';
import { mapConcurrent } from '@/lib/utils/async';
import type { Pass1Result, Pass2Result } from './document-review-assessment-service';
import {
  assessPass1,
  assessPass2,
  selectAuditSample,
  computeAIAssessmentSummary,
} from './document-review-assessment-service';
import {
  storePass1Assessment,
  storePass2Assessment,
  getBaselineAIFlagRate,
  getExistingPass1Urls,
  getExistingPass2Urls,
  loadStoredPass1Results,
  getWeekP1Context,
} from './document-review-store';
import type { Layer2Options, PriorWeekData } from './document-review-week-context';
import {
  buildBaseContext,
  buildPeerList,
  buildPerDocContext,
  getPriorWeekOf,
} from './document-review-week-context';

export type { Layer2Options } from './document-review-week-context';
export { retryMissingPass2 } from './document-review-retry';

const DEFAULT_PASS1_PROVIDER = 'openai';
const DEFAULT_PASS1_MODEL = 'gpt-4o-mini';
const DEFAULT_PASS2_PROVIDER = 'anthropic';
const DEFAULT_PASS2_MODEL = 'claude-sonnet-4-5-20250929';
const PASS1_CONCURRENCY = 5;
const PASS2_CONCURRENCY = 3;

interface ResolvedOptions {
  p1Provider: ReturnType<typeof getProvider>;
  p2Provider: ReturnType<typeof getProvider>;
  p1Model: string;
  p2Model: string;
  auditRate: number;
  dryRun?: boolean;
}

function resolveOptions(options?: Layer2Options): ResolvedOptions | null {
  const p1Name = options?.pass1Provider ?? DEFAULT_PASS1_PROVIDER;
  const p2Name = options?.pass2Provider ?? DEFAULT_PASS2_PROVIDER;
  const p1Provider = getProvider(p1Name);
  const p2Provider = getProvider(p2Name);

  if (!p1Provider.isAvailable() || !p2Provider.isAvailable()) {
    console.warn(`[layer2] Provider unavailable (${p1Name}/${p2Name}), skipping`);
    return null;
  }

  return {
    p1Provider,
    p2Provider,
    p1Model: options?.pass1Model ?? DEFAULT_PASS1_MODEL,
    p2Model: options?.pass2Model ?? DEFAULT_PASS2_MODEL,
    auditRate: options?.auditSampleRate ?? AUDIT_SAMPLE_RATE,
    dryRun: options?.dryRun,
  };
}

/**
 * Run the full Layer 2 assessment pipeline: Pass 1 → Pass 2 → Audit.
 */
export async function runLayer2Assessment(
  items: ContentItem[],
  categoryKey: string,
  weekOf: string,
  options?: Layer2Options,
): Promise<AIAssessmentSummary | null> {
  if (items.length === 0) return null;

  const category = CATEGORIES.find((c) => c.key === categoryKey);
  if (!category) return null;

  const resolved = resolveOptions(options);
  if (!resolved) return null;

  const pass1Results = await runPass1Phase(
    items,
    category.description,
    resolved.p1Provider,
    resolved.p1Model,
    categoryKey,
    weekOf,
    resolved.dryRun,
  );
  if (pass1Results.length === 0) return null;

  // Fetch baseline and prior week context before P2 (needed for B-E prompt)
  const priorWeek = getPriorWeekOf(weekOf);
  const [baseline, priorWeekCtx] = await Promise.all([
    getBaselineAIFlagRate(categoryKey, 'biden_2022'),
    getWeekP1Context(categoryKey, priorWeek),
  ]);

  // passFilter 1 (#563): P1 only — previously the flag was parsed by the
  // backfill CLI but never wired, so "--pass 1" ran the full P1+P2 pipeline
  // and "--pass 2" ran it all again.
  const pass2Results =
    options?.passFilter === 1
      ? []
      : await runPass2FromPass1(
          items,
          pass1Results,
          resolved,
          category.description,
          categoryKey,
          weekOf,
          category.title,
          category.expertDescription,
          baseline?.rate ?? 0,
          priorWeekCtx,
        );

  return computeAIAssessmentSummary(
    pass1Results,
    pass2Results,
    baseline?.rate ?? 0,
    baseline?.stdDev ?? 0.05,
    resolved.p1Model,
    resolved.p2Model,
  );
}

async function runPass2FromPass1(
  items: ContentItem[],
  pass1Results: Pass1Result[],
  resolved: ResolvedOptions,
  categoryDescription: string,
  categoryKey: string,
  weekOf: string,
  categoryTitle: string,
  expertDescription: string,
  baselineAvgFlagRate: number,
  priorWeek: PriorWeekData,
): Promise<Pass2Result[]> {
  const flaggedUrls = new Set(pass1Results.filter((r) => r.response.relevant).map((r) => r.url));
  const unflaggedUrls = pass1Results.filter((r) => !r.response.relevant).map((r) => r.url);
  const auditUrls = new Set(selectAuditSample(unflaggedUrls, resolved.auditRate));
  const allPeers = buildPeerList(pass1Results, items);
  const ctx = buildBaseContext(
    pass1Results,
    flaggedUrls.size,
    priorWeek,
    categoryTitle,
    expertDescription,
    baselineAvgFlagRate,
  );

  return runPass2Phase(
    items,
    pass1Results,
    flaggedUrls,
    auditUrls,
    categoryDescription,
    resolved.p2Provider,
    resolved.p2Model,
    categoryKey,
    weekOf,
    resolved.dryRun,
    ctx,
    allPeers,
  );
}

async function runPass1Phase(
  items: ContentItem[],
  categoryDescription: string,
  provider: ReturnType<typeof getProvider>,
  model: string,
  categoryKey: string,
  weekOf: string,
  dryRun?: boolean,
): Promise<Pass1Result[]> {
  const results: Pass1Result[] = [];

  const itemUrls = items.map((i) => i.link || i.title).filter(Boolean) as string[];
  const existingUrls = dryRun
    ? new Set<string>()
    : await getExistingPass1Urls(itemUrls, model, categoryKey);
  const existingResults =
    existingUrls.size > 0 ? await loadStoredPass1Results(existingUrls, categoryKey) : [];
  results.push(...existingResults);

  // Skip short-content CL docket items — they carry no assessable text (e.g., "440 Civil Rights: Other")
  // and have never produced a P2-relevant result across all years (verified).
  const MIN_CONTENT_FOR_REVIEW = 100;
  const newItems = items.filter(
    (i) =>
      !existingUrls.has(i.link ?? i.title ?? '') &&
      (i.content?.length ?? 0) >= MIN_CONTENT_FOR_REVIEW,
  );
  const newResults = await mapConcurrent(newItems, PASS1_CONCURRENCY, async (item) => {
    const result = await assessPass1(item, categoryDescription, provider, model);
    if (result && !dryRun) await storePass1Assessment(result, categoryKey, weekOf);
    return result;
  });
  for (const r of newResults) {
    if (r) results.push(r);
  }

  const skipped = existingResults.length;
  const assessed = results.length - skipped;
  const flagged = results.filter((r) => r.response.relevant).length;
  console.log(
    `[layer2] Pass 1: ${assessed}/${items.length} assessed` +
      (skipped > 0 ? `, ${skipped} cached` : '') +
      `, ${flagged} flagged`,
  );
  return results;
}

/**
 * Dedup P2 candidates against stored rows (#563). Without this, every
 * backfill re-ran the P2 model for all previously-flagged docs in any week
 * that contained a single new doc — the result was then discarded by
 * onConflictDoNothing.
 */
async function dedupAgainstStoredP2(
  candidateUrls: string[],
  categoryKey: string,
  dryRun?: boolean,
): Promise<{ validUrls: string[]; p2Cached: number }> {
  const existingP2 = dryRun
    ? new Set<string>()
    : await getExistingPass2Urls(candidateUrls, categoryKey);
  const validUrls = candidateUrls.filter((url) => !existingP2.has(url));
  return { validUrls, p2Cached: candidateUrls.length - validUrls.length };
}

async function runPass2Phase(
  items: ContentItem[],
  pass1Results: Pass1Result[],
  flaggedUrls: Set<string>,
  auditUrls: Set<string>,
  categoryDescription: string,
  provider: ReturnType<typeof getProvider>,
  model: string,
  categoryKey: string,
  weekOf: string,
  dryRun?: boolean,
  baseContext?: Omit<Pass2WeekContext, 'flaggedPeers'>,
  allPeers?: Array<{ url: string; title: string; erosionType: string }>,
): Promise<Pass2Result[]> {
  const results: Pass2Result[] = [];
  const pass1ByUrl = new Map(pass1Results.map((r) => [r.url, r]));
  const itemByUrl = new Map(items.map((i) => [i.link || i.title, i]));
  const urlsToProcess = [...flaggedUrls, ...auditUrls];
  const candidateUrls = urlsToProcess.filter((url) => itemByUrl.has(url) && pass1ByUrl.has(url));
  const { validUrls, p2Cached } = await dedupAgainstStoredP2(candidateUrls, categoryKey, dryRun);

  const pass2Results = await mapConcurrent(validUrls, PASS2_CONCURRENCY, async (url) => {
    const item = itemByUrl.get(url)!;
    const pass1 = pass1ByUrl.get(url)!;
    const weekContext = buildPerDocContext(baseContext, allPeers, url);
    const result = await assessPass2(
      item,
      pass1.response.signals,
      pass1.response.erosionType,
      categoryDescription,
      provider,
      auditUrls.has(url),
      model,
      weekContext,
    );
    if (result && !dryRun) await storePass2Assessment(result, categoryKey, weekOf);
    return result;
  });
  for (const r of pass2Results) {
    if (r) results.push(r);
  }

  console.log(
    `[layer2] Pass 2: ${results.length} assessed` +
      (p2Cached > 0 ? `, ${p2Cached} cached` : '') +
      ` (${auditUrls.size} audit samples)`,
  );
  return results;
}
