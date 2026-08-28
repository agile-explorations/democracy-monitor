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

/** The cookie is HttpOnly, so the page keeps its own note of when a pass
 *  was obtained — in localStorage, so a reload does not re-run Turnstile
 *  while the cookie is still valid (the cause of "a checkbox on every
 *  search"). Stale or missing notes are harmless: the stream's refusal
 *  triggers a reactive re-verify. */
const STORAGE_KEY = 'dm_pass_at';

function readStoredPassAt(): number {
  try {
    return Number(globalThis.localStorage?.getItem(STORAGE_KEY) ?? 0) || 0;
  } catch {
    return 0;
  }
}

function storePassAt(at: number): void {
  try {
    if (at) globalThis.localStorage?.setItem(STORAGE_KEY, String(at));
    else globalThis.localStorage?.removeItem(STORAGE_KEY);
  } catch {
    /* storage unavailable — memory only */
  }
}

let lastPassAt = readStoredPassAt();

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

/** Obtain (or refresh) the pass: Turnstile token → POST /api/search/pass.
 *  `mount` places a visible challenge (if Cloudflare asks for one) under
 *  the search box; `onWaiting` lets the page say so while it waits. */
export async function ensurePass(
  force = false,
  opts: { mount?: HTMLElement | null; onWaiting?: (waiting: boolean) => void } = {},
): Promise<void> {
  if (!force && passIsFresh(lastPassAt, Date.now())) return;
  opts.onWaiting?.(true);
  let turnstileToken: string;
  try {
    turnstileToken = await getTurnstileToken(opts.mount);
  } finally {
    opts.onWaiting?.(false);
  }
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
  storePassAt(lastPassAt);
}

/** Forget the remembered pass (tests; also the right move after a refusal). */
export function resetPassMemory(): void {
  lastPassAt = 0;
  storePassAt(0);
}

/** Re-read the stored note (tests simulate a reload with this). */
export function reloadPassMemory(): void {
  lastPassAt = readStoredPassAt();
}
