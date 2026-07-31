/**
 * Pure decision logic for the origin↔Cloudflare shared-secret guard (#620, #622).
 *
 * Edge-safe (string ops only — no Node `crypto`), so `middleware.ts` can import
 * it and it can be unit-tested in vitest. The two-stage design exists because a
 * fail-closed mismatch once 403'd all production traffic on deploy (2026-07-31):
 * when the secret is set but ORIGIN_ENFORCE is not 'true', a missing/mismatched
 * header is LOGGED but still allowed, so enforcement can be confirmed from logs
 * before it's ever able to block.
 */

export const ORIGIN_HEADER = 'x-dm-origin';

/** Paths that legitimately reach the origin without a Cloudflare header (Render
 *  health probe) or are independently authenticated (cron via CRON_SECRET), plus
 *  the CSP report sink — never blocked. */
export const ALLOWLIST_PREFIXES = ['/api/health/', '/api/cron/', '/api/csp-report'];

/** Constant-time compare — `crypto.timingSafeEqual` is unavailable in the Edge runtime. */
export function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export interface OriginGuardInput {
  isProduction: boolean;
  secret: string | undefined;
  enforce: boolean;
  pathname: string;
  header: string | null;
}

export type OriginDecision =
  | { action: 'allow' }
  | { action: 'log'; reason: 'missing' | 'mismatch' } // log-only mode: allowed but noted
  | { action: 'block' };

export function evaluateOrigin(input: OriginGuardInput): OriginDecision {
  const { isProduction, secret, enforce, pathname, header } = input;

  // Fail open outside production or when no secret is configured — never a self-outage.
  if (!isProduction || !secret) return { action: 'allow' };
  if (ALLOWLIST_PREFIXES.some((p) => pathname.startsWith(p))) return { action: 'allow' };

  if (header !== null && constantTimeEqual(header, secret)) return { action: 'allow' };

  // Header absent or mismatched: log-only until enforcement is explicitly enabled.
  if (!enforce) return { action: 'log', reason: header === null ? 'missing' : 'mismatch' };
  return { action: 'block' };
}
