import { getProvider } from '@/lib/ai/provider';
import { CATEGORIES } from '@/lib/data/categories';
import { AUDIT_SAMPLE_RATE } from '@/lib/methodology/scoring-config';
import type { ContentItem } from '@/lib/types';
import type { AIAssessmentSummary } from '@/lib/types/structural';
import { sleep } from '@/lib/utils/async';
import type { Pass1Result, Pass2Result } from './layer2-assessment-service';
import {
  assessPass1,
  assessPass2,
  selectAuditSample,
  computeAIAssessmentSummary,
} from './layer2-assessment-service';
import { storePass1Assessment, storePass2Assessment, getBaselineAIFlagRate } from './layer2-store';

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
const RATE_LIMIT_DELAY_MS = 200;

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

  for (const item of items) {
    const result = await assessPass1(item, categoryDescription, provider, model);
    if (result) {
      results.push(result);
      if (!dryRun) {
        storePass1Assessment(result, categoryKey, weekOf).catch((err) =>
          console.warn(`[layer2] Pass 1 store failed for ${result.url}:`, err),
        );
      }
    }
    await sleep(RATE_LIMIT_DELAY_MS);
  }

  console.log(
    `[layer2] Pass 1: ${results.length}/${items.length} assessed, ` +
      `${results.filter((r) => r.response.relevant).length} flagged`,
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

  for (const url of urlsToProcess) {
    const item = itemByUrl.get(url);
    const pass1 = pass1ByUrl.get(url);
    if (!item || !pass1) continue;

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

    if (result) {
      results.push(result);
      if (!dryRun) {
        storePass2Assessment(result, categoryKey, weekOf).catch((err) =>
          console.warn(`[layer2] Pass 2 store failed for ${result.url}:`, err),
        );
      }
    }
    await sleep(RATE_LIMIT_DELAY_MS);
  }

  console.log(`[layer2] Pass 2: ${results.length} assessed (${auditUrls.size} audit samples)`);
  return results;
}
