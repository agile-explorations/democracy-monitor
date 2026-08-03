/**
 * GET /api/version — the running build's git commit, for deterministic deploy
 * verification (#664).
 *
 * The tag-gated deploy workflow (deploy.yml) polls this after triggering a
 * Render deploy and only goes green once `commit` equals the deployed tag's
 * SHA — so "workflow green" means "the new code is confirmed serving," not
 * "a deploy was queued" (the v1.5.0 silent-stale-deploy class). Render sets
 * RENDER_GIT_COMMIT to the deployed commit automatically.
 *
 * Public: the commit SHA is non-sensitive (the repo is public). No DB.
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { requireMethod } from '@/lib/utils/api-helpers';

export default function handler(req: NextApiRequest, res: NextApiResponse): void {
  if (!requireMethod(req, res, 'GET')) return;
  // Must never be cached: verification reads the live running commit.
  res.setHeader('Cache-Control', 'no-store');
  res.status(200).json({
    commit: process.env.RENDER_GIT_COMMIT ?? 'unknown',
    branch: process.env.RENDER_GIT_BRANCH ?? null,
  });
}
