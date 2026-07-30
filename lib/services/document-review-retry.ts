import { getProvider } from '@/lib/ai/provider';
import { CATEGORIES } from '@/lib/data/categories';
import type { AIProvider, ContentItem } from '@/lib/types';
import { mapConcurrent } from '@/lib/utils/async';
import { assessPass2 } from './document-review-assessment-service';
import { findPass2Gaps } from './document-review-queries';
import { storePass2Assessment } from './document-review-store';
import type { Layer2Options, RetryWeekContext } from './document-review-week-context';
import { buildPerDocContext, buildRetryWeekContext } from './document-review-week-context';

const DEFAULT_PASS2_PROVIDER = 'anthropic';
const DEFAULT_PASS2_MODEL = 'claude-sonnet-4-5-20250929';
const RETRY_CONCURRENCY = 3;
const MIN_RETRY_CONTENT_LENGTH = 100;

type Pass2Gap = Awaited<ReturnType<typeof findPass2Gaps>>[number];

function filterViableGaps(gaps: Pass2Gap[], verbose?: boolean, label?: string): Pass2Gap[] {
  const viable = gaps.filter((g) => g.content && g.content.length >= MIN_RETRY_CONTENT_LENGTH);
  if (gaps.length > viable.length && verbose) {
    console.warn(
      `[layer2] Skipping ${gaps.length - viable.length}/${gaps.length} gaps ` +
        `with insufficient content for ${label}`,
    );
  }
  return viable;
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
  const p2Name = options?.pass2Provider ?? DEFAULT_PASS2_PROVIDER;
  const p2Provider = getProvider(p2Name);
  if (!p2Provider.isAvailable()) return 0;
  const p2Model = options?.pass2Model ?? DEFAULT_PASS2_MODEL;
  const category = CATEGORIES.find((c) => c.key === categoryKey);
  if (!category) return 0;

  const gaps = await findPass2Gaps(categoryKey, weekOf);
  if (gaps.length === 0) return 0;
  const viable = filterViableGaps(gaps, options?.verbose, `${categoryKey} / ${weekOf}`);
  if (viable.length === 0) return 0;

  console.log(`[layer2] Retrying ${viable.length} missing Pass 2 for ${categoryKey} / ${weekOf}`);
  const weekContext = await buildRetryWeekContext(
    categoryKey,
    weekOf,
    category.title,
    category.expertDescription,
  );

  const retryResults = await mapConcurrent(viable, RETRY_CONCURRENCY, (gap) =>
    retryGap(gap, weekContext ?? undefined, category.description, p2Provider, p2Model, {
      categoryKey,
      weekOf,
      dryRun: options?.dryRun,
      verbose: options?.verbose,
    }),
  );
  return retryResults.reduce<number>((sum, n) => sum + n, 0);
}

interface RetryGapOpts {
  categoryKey: string;
  weekOf: string;
  dryRun?: boolean;
  verbose?: boolean;
}

async function retryGap(
  gap: Pass2Gap,
  weekContext: Omit<RetryWeekContext, never> | undefined,
  categoryDescription: string,
  p2Provider: AIProvider,
  p2Model: string,
  opts: RetryGapOpts,
): Promise<number> {
  const doc: ContentItem = {
    title: gap.title ?? '',
    content: gap.content ?? '',
    link: gap.url,
    type: gap.sourceType ?? undefined,
  };
  const docContext = buildPerDocContext(weekContext, weekContext?.flaggedPeers, gap.url);
  const result = await assessPass2(
    doc,
    gap.signals,
    gap.erosionType,
    categoryDescription,
    p2Provider,
    false,
    p2Model,
    docContext,
  );
  if (result && !opts.dryRun) {
    await storePass2Assessment(result, opts.categoryKey, opts.weekOf);
  }
  if (!result) {
    // Unconditional: retry failures are rare, actionable, and previously
    // invisible without --verbose (#612). assessPass2 logs the cause.
    console.warn(
      `[layer2] Pass 2 retry failed for ${gap.url} (${opts.categoryKey} / ${opts.weekOf})`,
    );
  }
  return result ? 1 : 0;
}
