import { useCallback, useEffect, useState } from 'react';
import type { CaseTimeline } from '@/lib/services/docket-timeline';

/**
 * Client-side fetch + cache for /api/case/timeline (#688). One module-level
 * cache shared by every CaseContext instance and the research posture line;
 * in-flight dedupe prevents duplicate requests; a concurrency-3 queue smooths
 * the auto-posture burst when research results render.
 */

export type TimelineStatus = 'idle' | 'loading' | 'ready' | 'error';

const resultCache = new Map<string, CaseTimeline | 'error'>();
const inFlight = new Map<string, Promise<CaseTimeline | 'error'>>();

const MAX_CONCURRENT = 3;
let active = 0;
const queue: Array<() => void> = [];

function acquire(): Promise<void> {
  if (active < MAX_CONCURRENT) {
    active++;
    return Promise.resolve();
  }
  return new Promise((resolve) => queue.push(resolve));
}

function release(): void {
  const next = queue.shift();
  if (next) next();
  else active--;
}

async function fetchTimeline(caseId: string): Promise<CaseTimeline | 'error'> {
  await acquire();
  try {
    const res = await fetch(`/api/case/timeline?caseId=${encodeURIComponent(caseId)}`);
    if (!res.ok) return 'error';
    return (await res.json()) as CaseTimeline;
  } catch {
    return 'error';
  } finally {
    release();
  }
}

export function loadCaseTimeline(caseId: string): Promise<CaseTimeline | 'error'> {
  const cached = resultCache.get(caseId);
  if (cached) return Promise.resolve(cached);
  const pending = inFlight.get(caseId);
  if (pending) return pending;
  const promise = fetchTimeline(caseId).then((result) => {
    resultCache.set(caseId, result);
    inFlight.delete(caseId);
    return result;
  });
  inFlight.set(caseId, promise);
  return promise;
}

/** Test-only reset for the module-level caches. */
export function resetCaseTimelineCache(): void {
  resultCache.clear();
  inFlight.clear();
}

export function useCaseTimeline(
  caseId: string | null | undefined,
  opts: { auto?: boolean } = {},
): { timeline: CaseTimeline | null; status: TimelineStatus; load: () => void } {
  const [status, setStatus] = useState<TimelineStatus>('idle');
  const [timeline, setTimeline] = useState<CaseTimeline | null>(null);

  const load = useCallback(() => {
    if (!caseId) return;
    const cached = resultCache.get(caseId);
    if (cached) {
      setStatus(cached === 'error' ? 'error' : 'ready');
      setTimeline(cached === 'error' ? null : cached);
      return;
    }
    setStatus('loading');
    void loadCaseTimeline(caseId).then((result) => {
      setStatus(result === 'error' ? 'error' : 'ready');
      setTimeline(result === 'error' ? null : result);
    });
  }, [caseId]);

  useEffect(() => {
    if (opts.auto && caseId) load();
  }, [opts.auto, caseId, load]);

  return { timeline, status, load };
}
