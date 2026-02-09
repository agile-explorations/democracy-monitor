import type { NextApiRequest, NextApiResponse } from 'next';
import { isDbAvailable } from '@/lib/db';
import { getValidationSummary } from '@/lib/services/validation-index-service';
import { VALIDATION_SOURCES } from '@/lib/types/validation';
import type { ValidationSource } from '@/lib/types/validation';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!isDbAvailable()) {
    return res.status(503).json({ error: 'Database not available' });
  }

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
