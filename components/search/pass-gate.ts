/**
 * Search pass gate, client side (#792). The server requires a signed
 * `dm_pass` cookie before it will start a cold build or a stream; cached
 * answers never ask. We can't read the HttpOnly cookie, so we remember when
 * we last obtained one and refresh proactively before a stream, and react to
 * a 403 `pass_required` on the docs fetch by obtaining one and retrying once.
 */

import { getTurnstileToken } from '@/lib/hooks/useTurnstile';

/** Refresh before the server's 6h TTL so a stream never opens on a stale pass. */
export const PASS_FRESH_MS = 5 * 3600 * 1000;

let lastPassAt = 0;

/** Pure: does a pass obtained at `lastAt` still count as fresh at `now`? */
export function passIsFresh(lastAt: number, now: number): boolean {
  return lastAt > 0 && now - lastAt < PASS_FRESH_MS;
}

/** A 403 with the server's `pass_required` code (body read on a clone so the
 *  caller can still consume it). */
export async function isPassRequired(res: Pick<Response, 'status' | 'clone'>): Promise<boolean> {
  if (res.status !== 403) return false;
  const body = (await res
    .clone()
    .json()
    .catch(() => ({}))) as { code?: string };
  return body.code === 'pass_required';
}

/** Obtain (or refresh) the pass: Turnstile token → POST /api/search/pass. */
export async function ensurePass(force = false): Promise<void> {
  if (!force && passIsFresh(lastPassAt, Date.now())) return;
  const turnstileToken = await getTurnstileToken();
  const res = await fetch('/api/search/pass', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ turnstileToken }),
  });
  if (res.status !== 204) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error || 'Verification failed — please retry.');
  }
  lastPassAt = Date.now();
}

/** Test hook: forget the remembered pass time. */
export function resetPassMemory(): void {
  lastPassAt = 0;
}
