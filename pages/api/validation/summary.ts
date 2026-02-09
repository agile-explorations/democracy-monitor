import type { NextApiRequest, NextApiResponse } from 'next';
import { getValidationSummary } from '@/lib/services/validation-index-service';
import { VALIDATION_SOURCES } from '@/lib/types/validation';
import type { ValidationSource } from '@/lib/types/validation';
import { requireMethod, requireDb } from '@/lib/utils/api-helpers';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (!requireMethod(req, res, 'GET')) return;
  if (!requireDb(res)) return;

  const { source } = req.query;
  const sourceParam = typeof source === 'string' ? source : undefined;

  if (sourceParam && !VALIDATION_SOURCES.includes(sourceParam as ValidationSource)) {
    return res
      .status(400)
      .json({ error: `Invalid source. Must be one of: ${VALIDATION_SOURCES.join(', ')}` });
  }

  try {
    const summary = await getValidationSummary({
      source: sourceParam as ValidationSource | undefined,
    });
    res.status(200).json(summary);
  } catch (err) {
    console.error('Validation summary error:', err);
    res.status(500).json({ error: 'Failed to fetch validation summary' });
  }
}
