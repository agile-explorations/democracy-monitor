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

/** Send a JSON response with 1-hour CDN cache headers. */
export function sendCached(res: NextApiResponse, body: object): void {
  res.setHeader('Cache-Control', 'public, s-maxage=3600');
  res.status(200).json(body);
}
