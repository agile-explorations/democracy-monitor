/**
 * DOJ restore (#894): one walk of the press-release feed over [from, to],
 * keeping releases from a corpus component (lib/data/doj-corpus-components)
 * that have no documents row in any category. The feed carries the bodies,
 * so no per-release fetch. Cost: log2(pages) calls to locate the start page
 * plus one call per 50 releases, 2 s apart (the fetcher's politeness delay);
 * the whole feed since 2017 is on the order of 1,500 pages, about an hour.
 *
 * The page walk mirrors doj-fetcher's private fetchDojPage/findStartPage —
 * they are not exported and that file is not part of this change; the
 * anti-join and the cap run per page here so a capped run stops early.
 */
import { CORPUS_CATEGORY } from '@/lib/db/document-filters';
import { fetchDojPage, findStartPage, toContentItem } from '@/lib/services/doj-fetcher';
import type { DojApiResponse, DojPressRelease } from '@/lib/services/doj-fetcher';
import type { ContentItem } from '@/lib/types';
import { sleep } from '@/lib/utils/async';
import { antiJoinByUrl, dojReleaseDate, selectCorpusReleases } from './plan';
import { findStoredUrls } from './stored-urls';
import type { RestoreBatch, RestoreOptions } from './types';

const POLITENESS_DELAY_MS = 2000;
const FETCH_TIMEOUT_MS = 30_000;
const PAGE_SIZE = 50;

interface WalkState {
  matched: number;
  netNew: number;
  candidates: ContentItem[];
  capTripped: boolean;
}

/** Fold one feed page into the walk; returns false when the walk should stop. */
async function consumePage(
  releases: DojPressRelease[],
  range: { fromDate: Date; toDate: Date },
  maxDocs: number | undefined,
  state: WalkState,
): Promise<boolean> {
  const corpus = selectCorpusReleases(releases, range.fromDate, range.toDate);
  state.matched += corpus.length;
  const items = corpus.map(toContentItem);
  const stored = await findStoredUrls(items.map((i) => i.link).filter((l): l is string => !!l));
  const fresh = antiJoinByUrl(items, stored);
  state.netNew += fresh.length;
  state.candidates.push(...fresh);
  if (maxDocs !== undefined && state.candidates.length > maxDocs) {
    state.candidates.length = maxDocs;
    state.capTripped = true;
    return false;
  }
  const last = releases[releases.length - 1];
  const lastDate = last ? dojReleaseDate(last) : null;
  return !(lastDate && lastDate < range.fromDate);
}

export async function restoreDoj(opts: RestoreOptions): Promise<RestoreBatch[]> {
  const range = { fromDate: new Date(opts.from), toDate: new Date(`${opts.to}T23:59:59Z`) };
  const state: WalkState = { matched: 0, netNew: 0, candidates: [], capTripped: false };

  const initial = await fetchDojPage(0, '');
  if (!initial) return [];
  const totalPages = Math.ceil(
    parseInt(initial.data.metadata?.resultset?.count || '0', 10) / PAGE_SIZE,
  );
  if (totalPages > 0) {
    const startPage = Math.max(0, (await findStartPage(range.toDate, totalPages)) - 1);
    console.log(`[restore:doj] ${totalPages} feed pages; walking from page ${startPage}`);
    let { cookies } = initial;
    for (let page = startPage; page < totalPages; page++) {
      await sleep(POLITENESS_DELAY_MS);
      const result = await fetchDojPage(page, cookies);
      if (!result) break;
      cookies = result.cookies;
      const releases = result.data.results ?? [];
      if (releases.length === 0) break;
      if (!(await consumePage(releases, range, opts.maxDocs, state))) break;
      if ((page - startPage) % 50 === 49) {
        console.log(`[restore:doj] page ${page}: ${state.candidates.length} net-new so far`);
      }
    }
  }

  return [{ ...state, category: CORPUS_CATEGORY }];
}
