import { getProvider } from '@/lib/ai/provider';
import { CATEGORIES } from '@/lib/data/categories';
import type { ContentItem } from '@/lib/types';
import { mapConcurrent } from '@/lib/utils/async';
import { assessPass2 } from './layer2-assessment-service';
import { findPass2Gaps, storePass2Assessment } from './layer2-store';
import type { Layer2Options } from './layer2-week-context';
import { buildPerDocContext, buildRetryWeekContext } from './layer2-week-context';

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

  const retryResults = await mapConcurrent(viable, RETRY_CONCURRENCY, async (gap) => {
    const doc: ContentItem = {
      title: gap.title ?? '',
      summary: gap.content ?? '',
      link: gap.url,
      type: gap.sourceType ?? undefined,
    };
    const docContext = buildPerDocContext(weekContext, weekContext?.flaggedPeers, gap.url);
    const result = await assessPass2(
      doc,
      gap.signals,
      gap.erosionType,
      category.description,
      p2Provider,
      false,
      p2Model,
      docContext,
    );
    if (result && !options?.dryRun) {
      await storePass2Assessment(result, categoryKey, weekOf);
    }
    if (!result && options?.verbose) {
      console.warn(`[layer2] Pass 2 retry failed for ${gap.url}`);
    }
    return result ? 1 : 0;
  });

  return retryResults.reduce<number>((sum, n) => sum + n, 0);
}
