import type { NextApiRequest, NextApiResponse } from 'next';
import { isDbAvailable } from '@/lib/db';

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

/** Extract a human-readable message from an unknown error value. */
export function formatError(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
