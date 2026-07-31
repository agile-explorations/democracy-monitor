import type { NextApiRequest, NextApiResponse } from 'next';
import { isDbAvailable } from '@/lib/db';
import type { StoredNarrative } from '@/lib/types';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Returns true if the request method matches; sends 405 and returns false otherwise.
 * Usage: `if (!requireMethod(req, res, 'GET')) return;`
 */
export function requireMethod(req: NextApiRequest, res: NextApiResponse, method: string): boolean {
  if (req.method === method) return true;
  res.status(405).json({ error: 'Method not allowed' });
  return false;
}

/**
 * Returns true if the database is available; sends 503 and returns false otherwise.
 * Usage: `if (!requireDb(res)) return;`
 */
export function requireDb(res: NextApiResponse): boolean {
  if (isDbAvailable()) return true;
  res.status(503).json({ error: 'Database not configured' });
  return false;
}

/**
 * Validates and returns the weekOf query parameter; sends 400 and returns null otherwise.
 * Usage: `const weekOf = requireWeekOf(req, res); if (!weekOf) return;`
 */
export function requireWeekOf(req: NextApiRequest, res: NextApiResponse): string | null {
  const weekOf = req.query.weekOf as string | undefined;
  if (!weekOf) {
    res.status(400).json({ error: 'Missing required query parameter: weekOf' });
    return null;
  }
  if (!DATE_RE.test(weekOf)) {
    res.status(400).json({ error: 'Invalid weekOf format. Expected YYYY-MM-DD.' });
    return null;
  }
  return weekOf;
}

/** Extract a human-readable message from an unknown error value. */
export function formatError(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/** Extract narrative content from stored results, filtering by optional version. */
export function tryStoredResponse(
  stored: { expert: StoredNarrative | null; public: StoredNarrative | null },
  version?: 'expert' | 'public',
): Record<string, string> | null {
  if (version) {
    if (stored[version]) return { [version]: stored[version]!.content };
  } else if (stored.expert && stored.public) {
    return { expert: stored.expert.content, public: stored.public.content };
  }
  return null;
}

const ADMIN_COOKIE = 'dm_admin_session';

/** Admin session lifetime (also the cookie Max-Age). */
const ADMIN_SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Constant-time string equality for secrets/tokens. Length-guarded: a length
 * mismatch returns false without calling timingSafeEqual (which throws on
 * unequal-length buffers) and without leaking the comparison via early exit.
 */
export function safeEqual(a: string, b: string): boolean {
  const { timingSafeEqual } = require('crypto') as typeof import('crypto');
  const ab = Buffer.from(a, 'utf8');
  const bb = Buffer.from(b, 'utf8');
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

/**
 * Returns true if the request has a valid, unexpired admin session cookie;
 * sends 401 otherwise. The token carries its own HMAC-authenticated expiry.
 */
export function requireAdmin(req: NextApiRequest, res: NextApiResponse): boolean {
  const password = process.env.ADMIN_PASSWORD;
  if (!password) {
    res.status(503).json({ error: 'ADMIN_PASSWORD not configured' });
    return false;
  }
  if (!verifyAdminToken(password, req.cookies[ADMIN_COOKIE])) {
    res.status(401).json({ error: 'Unauthorized' });
    return false;
  }
  return true;
}

/**
 * Session token = `<expiresAtMs>.<HMAC>` where the HMAC (keyed by the admin
 * password) authenticates the expiry, so it can't be extended by tampering.
 */
export function makeAdminToken(password: string, expiresAtMs: number): string {
  const { createHmac } = require('crypto') as typeof import('crypto');
  const mac = createHmac('sha256', password)
    .update(`dm-admin-session:${expiresAtMs}`)
    .digest('hex');
  return `${expiresAtMs}.${mac}`;
}

/** Validate a presented token: well-formed, not expired, HMAC matches (constant-time). */
export function verifyAdminToken(password: string, token: string | undefined): boolean {
  if (!token) return false;
  const dot = token.indexOf('.');
  if (dot < 1) return false;
  const expiresAtMs = Number(token.slice(0, dot));
  if (!Number.isFinite(expiresAtMs) || expiresAtMs <= Date.now()) return false;
  return safeEqual(token, makeAdminToken(password, expiresAtMs));
}

export { ADMIN_COOKIE, ADMIN_SESSION_TTL_MS };

/** Send a JSON response with 1-hour CDN cache headers. */
export function sendCached(res: NextApiResponse, body: object): void {
  res.setHeader('Cache-Control', 'public, s-maxage=3600');
  res.status(200).json(body);
}
