/**
 * Search pass (#792): the origin-verified front door on every expensive
 * search path (cold research builds, the streamed synthesis).
 *
 * Two credentials, resolved into one "source" identity:
 *  - **human**: a signed `dm_pass` cookie issued by POST /api/search/pass
 *    after a Cloudflare Turnstile verification. Invisible on the happy path;
 *    lasts SEARCH_PASS_TTL_SECONDS; the id is the per-source key for
 *    fairness and spend accounting (better than an IP behind NAT/proxies).
 *  - **machine**: `Authorization: Bearer <SEARCH_MACHINE_TOKEN>` for our own
 *    harnesses (prewarm workflow, eval, loadtest, golden guard).
 *
 * Verified at origin, so it holds even when Cloudflare is bypassed via the
 * onrender.com hostname (#620/#623). Fail-open when NEITHER a Turnstile
 * secret nor a machine token is configured (local dev, tests) — the same
 * contract as verifyTurnstile.
 */

import { createHmac, randomBytes } from 'crypto';
import type { NextApiRequest, NextApiResponse } from 'next';
import { safeEqual } from '@/lib/utils/api-helpers';
import { envInt } from '@/lib/utils/env';
import { getClientIp } from '@/lib/utils/rate-limit';

export const PASS_COOKIE = 'dm_pass';
export const PASS_TTL_SECONDS = envInt('SEARCH_PASS_TTL_SECONDS', 6 * 3600, 300, 86_400);
const HMAC_HEX_CHARS = 32;

export interface SearchSource {
  /** 'open' = enforcement off (nothing configured); the id is the client IP. */
  kind: 'human' | 'machine' | 'open';
  id: string;
}

function passSecret(): string | undefined {
  return process.env.SEARCH_PASS_SECRET || process.env.CRON_SECRET || undefined;
}

/** True when at least one credential is configured — then a pass or token
 *  is required on the expensive paths. */
export function passEnforced(): boolean {
  return Boolean(process.env.TURNSTILE_SECRET_KEY || process.env.SEARCH_MACHINE_TOKEN);
}

export function newPassId(): string {
  return randomBytes(12).toString('hex');
}

function hmac(id: string, issuedAt: number, secret: string): string {
  return createHmac('sha256', secret)
    .update(`${id}.${issuedAt}`)
    .digest('hex')
    .slice(0, HMAC_HEX_CHARS);
}

/** `id.issuedAtSeconds.hmac` — pure. */
export function signPass(id: string, issuedAt: number, secret: string): string {
  return `${id}.${issuedAt}.${hmac(id, issuedAt, secret)}`;
}

/** The pass id when the value is well-formed, unexpired and authentic; null
 *  otherwise. Pure. */
export function verifyPass(
  value: string | undefined,
  secret: string,
  nowSeconds: number,
  ttlSeconds: number = PASS_TTL_SECONDS,
): string | null {
  if (!value) return null;
  const parts = value.split('.');
  if (parts.length !== 3) return null;
  const [id, issuedRaw, mac] = parts;
  const issuedAt = Number(issuedRaw);
  if (!/^[0-9a-f]{24}$/.test(id) || !Number.isInteger(issuedAt)) return null;
  if (nowSeconds - issuedAt > ttlSeconds || issuedAt > nowSeconds + 60) return null;
  return safeEqual(mac, hmac(id, issuedAt, secret)) ? id : null;
}

/** Minimal cookie-header parser (one value we care about). Pure. */
export function readCookie(header: string | undefined, name: string): string | undefined {
  if (!header) return undefined;
  for (const part of header.split(';')) {
    const [k, ...rest] = part.trim().split('=');
    if (k === name) return decodeURIComponent(rest.join('='));
  }
  return undefined;
}

/** Set-Cookie value for a freshly issued pass. Scoped to /api/search so it
 *  rides on the docs fetch, the 202 polls and the EventSource alike. */
export function passCookieHeader(value: string, ttlSeconds: number = PASS_TTL_SECONDS): string {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  return `${PASS_COOKIE}=${value}; Path=/api/search; HttpOnly; SameSite=Lax; Max-Age=${ttlSeconds}${secure}`;
}

/** Issue a new pass: returns the cookie header value to set. */
export function issuePass(nowSeconds: number = Math.floor(Date.now() / 1000)): string | null {
  const secret = passSecret();
  if (!secret) return null;
  return passCookieHeader(signPass(newPassId(), nowSeconds, secret));
}

/** Resolve the request's source: machine token, human pass, or 'open' when
 *  enforcement is off. null = a credential is required and none is valid. */
export function resolveSearchSource(req: NextApiRequest): SearchSource | null {
  const machineToken = process.env.SEARCH_MACHINE_TOKEN;
  const bearer = req.headers.authorization?.replace(/^Bearer\s+/i, '');
  if (machineToken && bearer && safeEqual(bearer, machineToken)) {
    return { kind: 'machine', id: `machine:${getClientIp(req)}` };
  }
  if (!passEnforced()) return { kind: 'open', id: `ip:${getClientIp(req)}` };
  const secret = passSecret();
  if (!secret) return null;
  const id = verifyPass(
    readCookie(req.headers.cookie, PASS_COOKIE),
    secret,
    Math.floor(Date.now() / 1000),
  );
  return id ? { kind: 'human', id: `pass:${id}` } : null;
}

/** Enforce at an expensive entry point: writes 403 { code: 'pass_required' }
 *  and returns null when no valid credential is present. */
export function requireSearchSource(
  req: NextApiRequest,
  res: NextApiResponse,
): SearchSource | null {
  const source = resolveSearchSource(req);
  if (!source) {
    res.status(403).json({
      error: 'A verified session is required to start a new search build.',
      code: 'pass_required',
    });
  }
  return source;
}
