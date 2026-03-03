import { getProvider } from '@/lib/ai/provider';
import { CATEGORIES } from '@/lib/data/categories';
import { AUDIT_SAMPLE_RATE } from '@/lib/methodology/scoring-config';
import type { ContentItem } from '@/lib/types';
import type { AIAssessmentSummary } from '@/lib/types/structural';
import { mapConcurrent } from '@/lib/utils/async';
import type { Pass1Result, Pass2Result } from './layer2-assessment-service';
import {
  assessPass1,
  assessPass2,
  selectAuditSample,
  computeAIAssessmentSummary,
} from './layer2-assessment-service';
import {
  storePass1Assessment,
  storePass2Assessment,
  getBaselineAIFlagRate,
  getExistingPass1Urls,
  loadStoredPass1Results,
  findPass2Gaps,
} from './layer2-store';

export interface Layer2Options {
  pass1Provider?: 'openai' | 'anthropic';
  pass1Model?: string;
  pass2Provider?: 'openai' | 'anthropic';
  pass2Model?: string;
  auditSampleRate?: number;
  dryRun?: boolean;
}

const DEFAULT_PASS1_PROVIDER = 'openai';
const DEFAULT_PASS1_MODEL = 'gpt-4o-mini';
const DEFAULT_PASS2_PROVIDER = 'anthropic';
const DEFAULT_PASS2_MODEL = 'claude-sonnet-4-5-20250929';
const PASS1_CONCURRENCY = 5;
const PASS2_CONCURRENCY = 3;
const RETRY_CONCURRENCY = 3;

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

  const pass2Results = await runPass2FromPass1(
    items,
    pass1Results,
    resolved,
    category.description,
    categoryKey,
    weekOf,
  );

  const baseline = await getBaselineAIFlagRate(categoryKey, 'biden_2022');
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
): Promise<Pass2Result[]> {
  const flaggedUrls = new Set(pass1Results.filter((r) => r.response.relevant).map((r) => r.url));
  const unflaggedUrls = pass1Results.filter((r) => !r.response.relevant).map((r) => r.url);
  const auditUrls = new Set(selectAuditSample(unflaggedUrls, resolved.auditRate));

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

  // Skip URLs that already have Pass 1 assessments for this category + model
  const itemUrls = items.map((i) => i.link || i.title).filter(Boolean) as string[];
  const existingUrls = dryRun
    ? new Set<string>()
    : await getExistingPass1Urls(itemUrls, model, categoryKey);
  const existingResults =
    existingUrls.size > 0 ? await loadStoredPass1Results(existingUrls, categoryKey) : [];
  results.push(...existingResults);

  const newItems = items.filter((i) => !existingUrls.has(i.link ?? i.title ?? ''));

  const newResults = await mapConcurrent(newItems, PASS1_CONCURRENCY, async (item) => {
    const result = await assessPass1(item, categoryDescription, provider, model);
    if (result && !dryRun) {
      await storePass1Assessment(result, categoryKey, weekOf);
    }
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
): Promise<Pass2Result[]> {
  const results: Pass2Result[] = [];
  const pass1ByUrl = new Map(pass1Results.map((r) => [r.url, r]));
  const itemByUrl = new Map(items.map((i) => [i.link || i.title, i]));

  const urlsToProcess = [...flaggedUrls, ...auditUrls];

  const validUrls = urlsToProcess.filter((url) => itemByUrl.has(url) && pass1ByUrl.has(url));
  const pass2Results = await mapConcurrent(validUrls, PASS2_CONCURRENCY, async (url) => {
    const item = itemByUrl.get(url)!;
    const pass1 = pass1ByUrl.get(url)!;
    const isAudit = auditUrls.has(url);
    const result = await assessPass2(
      item,
      pass1.response.signals,
      pass1.response.erosionType,
      categoryDescription,
      provider,
      isAudit,
      model,
    );
    if (result && !dryRun) {
      await storePass2Assessment(result, categoryKey, weekOf);
    }
    return result;
  });
  for (const r of pass2Results) {
    if (r) results.push(r);
  }

  console.log(`[layer2] Pass 2: ${results.length} assessed (${auditUrls.size} audit samples)`);
  return results;
}

/**
 * Retry Pass 2 for flagged docs in a category-week that are missing Pass 2.
 * Returns the number of successfully retried assessments.
 */
export async function retryMissingPass2(
  categoryKey: string,
  weekOf: string,
  options?: Layer2Options,
): Promise<number> {
  const resolved = resolveOptions(options);
  if (!resolved) return 0;

  const category = CATEGORIES.find((c) => c.key === categoryKey);
  if (!category) return 0;

  const gaps = await findPass2Gaps(categoryKey, weekOf);
  if (gaps.length === 0) return 0;

  // Skip gaps with no content — these docs only have titles and will always fail Pass 2
  const viable = gaps.filter((g) => g.content && g.content.length > 0);
  const skippedNoContent = gaps.length - viable.length;
  if (skippedNoContent > 0) {
    console.warn(
      `[layer2] Skipping ${skippedNoContent}/${gaps.length} gaps with null content ` +
        `for ${categoryKey} / ${weekOf}`,
    );
  }
  if (viable.length === 0) return 0;

  console.log(`[layer2] Retrying ${viable.length} missing Pass 2 for ${categoryKey} / ${weekOf}`);

  const retryResults = await mapConcurrent(viable, RETRY_CONCURRENCY, async (gap) => {
    const doc: ContentItem = { title: gap.title ?? '', summary: gap.content ?? '', link: gap.url };
    const result = await assessPass2(
      doc,
      gap.signals,
      gap.erosionType,
      category.description,
      resolved.p2Provider,
      false,
      resolved.p2Model,
    );
    if (result && !resolved.dryRun) {
      await storePass2Assessment(result, categoryKey, weekOf);
      return 1;
    }
    return 0;
  });

  return retryResults.reduce<number>((sum, n) => sum + n, 0);
}
