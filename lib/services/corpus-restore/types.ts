/**
 * Corpus restore contracts (#894, R-SEARCH-ORTHOGONAL). Each source module
 * exports `restore<Source>(opts)` producing one batch per target category:
 * the source-matched population, the net-new subset after the anti-join
 * against current `documents`, and the fetched candidates ready for
 * `storeExcludedDocuments`. The CLI (lib/cron/restore-corpus.ts) prints the
 * precheck numbers and writes only under --confirm.
 */
import type { ContentItem } from '@/lib/types';

export const RESTORE_SOURCES = ['fr', 'chrg', 'cl', 'cpd', 'doj', 'crec'] as const;
export type RestoreSource = (typeof RESTORE_SOURCES)[number];

export function isRestoreSource(value: string): value is RestoreSource {
  return (RESTORE_SOURCES as readonly string[]).includes(value);
}

export interface RestoreOptions {
  /** Inclusive date range (YYYY-MM-DD); ledger sources ignore it. */
  from: string;
  to: string;
  /** Cap on documents fetched this run; the cap tripping is reported, never silent. */
  maxDocs?: number;
}

export interface RestoreBatch {
  /** Source-matched: rows the source's ledger, feed walk, or window produced. */
  matched: number;
  /** After the anti-join against current `documents`, before the cap. */
  netNew: number;
  /** Fetched items ready to store (at most `maxDocs` across the run). */
  candidates: ContentItem[];
  category: string;
  /** True when more net-new work existed than `maxDocs` allowed. */
  capTripped: boolean;
}

export type RestoreFn = (opts: RestoreOptions) => Promise<RestoreBatch[]>;
