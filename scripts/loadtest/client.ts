/**
 * Load-test probe client (#781): mirrors the production browser contract
 * (components/search/helpers.ts fetchDocsResilient — 240s budget, 8s
 * default poll honoring retryAfterMs, re-request on edge cut), then keeps
 * cheap-polling past the client's give-up to record true build completion.
 */

import { createHash } from 'crypto';

/** Must match lib/services/search-docs-response.ts hashQuery — used to join
 *  probe rows to search_timings rows. */
export function hashQuery(q: string): string {
  return createHash('sha256').update(q.toLowerCase().trim()).digest('hex').slice(0, 16);
}

export interface ProbeResult {
  id: string;
  hash: string;
  /** Client-visible wall-clock to a usable doc list; null = DNF at budget. */
  tResultsMs: number | null;
  /** Wall-clock until a poll confirmed the build cached; null = never. */
  tBuildCompleteMs: number | null;
  docCount: number;
  n202: number;
  nEdgeCuts: number;
  n429: number;
}

const CLIENT_BUDGET_MS = 240_000;
const POST_BUDGET_POLL_MS = 60_000;
const POST_BUDGET_LIMIT_MS = 900_000;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** One browser-faithful research probe for a single novel question.
 *
 *  No synthetic client-IP header: onrender.com transits Cloudflare, which
 *  rejects any client-supplied `cf-connecting-ip` outright (403 error 1000 —
 *  discovered on the first real P0, 2026-08-26; lib/utils/rate-limit.ts
 *  documents the same behavior). All probes therefore share the runner's
 *  real IP; the runner neutralizes per-IP rate limits by clearing `rl:*`
 *  continuously instead (see rlFlusher in runner.ts). */
export async function researchProbe(
  baseUrl: string,
  id: string,
  question: string,
): Promise<ProbeResult> {
  const url = `${baseUrl}/api/search?${new URLSearchParams({
    q: question,
    mode: 'research',
    docsOnly: '1',
  })}`;
  const headers = {};
  const out: ProbeResult = {
    id,
    hash: hashQuery(question),
    tResultsMs: null,
    tBuildCompleteMs: null,
    docCount: 0,
    n202: 0,
    nEdgeCuts: 0,
    n429: 0,
  };
  const t0 = Date.now();

  const attempt = async (): Promise<'done' | 'wait'> => {
    let res: Response;
    try {
      res = await fetch(url, { headers, signal: AbortSignal.timeout(175_000) });
    } catch {
      out.nEdgeCuts++;
      return 'wait';
    }
    if (res.status === 202) {
      out.n202++;
      const body = (await res.json().catch(() => ({}))) as { retryAfterMs?: number };
      await sleep(body.retryAfterMs ?? 8_000);
      return 'wait';
    }
    if (res.status === 429) {
      out.n429++;
      await sleep(30_000);
      return 'wait';
    }
    if (!res.ok) {
      await sleep(8_000);
      return 'wait';
    }
    const body = (await res.json().catch(() => null)) as { documents?: unknown[] } | null;
    const n = body?.documents?.length ?? 0;
    if (n === 0) {
      await sleep(8_000);
      return 'wait';
    }
    out.docCount = n;
    return 'done';
  };

  // Phase 1: the browser-faithful window.
  while (Date.now() - t0 < CLIENT_BUDGET_MS) {
    if ((await attempt()) === 'done') {
      out.tResultsMs = Date.now() - t0;
      out.tBuildCompleteMs = out.tResultsMs;
      return out;
    }
  }
  // Phase 2: the client gave up; keep polling cheaply to time the build.
  while (Date.now() - t0 < POST_BUDGET_LIMIT_MS) {
    await sleep(POST_BUDGET_POLL_MS);
    if ((await attempt()) === 'done') {
      out.tBuildCompleteMs = Date.now() - t0;
      return out;
    }
  }
  return out;
}
