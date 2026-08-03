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
 * `version` is the release version from package.json, baked into the build —
 * keep it in lockstep with the git tag (bump package.json before tagging; see
 * DEPLOYMENT.md). Render only exposes the commit, not the tag, so package.json
 * is the committed source of truth for the human-readable version shown on the
 * Architecture page.
 *
 * Public: the commit SHA is non-sensitive (the repo is public). No DB.
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { requireMethod } from '@/lib/utils/api-helpers';
import pkg from '@/package.json';

export default function handler(req: NextApiRequest, res: NextApiResponse): void {
  if (!requireMethod(req, res, 'GET')) return;
  // Must never be cached: verification reads the live running commit.
  res.setHeader('Cache-Control', 'no-store');
  res.status(200).json({
    version: pkg.version,
    commit: process.env.RENDER_GIT_COMMIT ?? 'unknown',
    branch: process.env.RENDER_GIT_BRANCH ?? null,
  });
}
