import type { NextApiRequest, NextApiResponse } from 'next';
import { isDbAvailable } from '@/lib/db';
import { getValidationTimeSeries } from '@/lib/services/validation-index-service';
import { VALIDATION_SOURCES } from '@/lib/types/validation';
import type { ValidationSource } from '@/lib/types/validation';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!isDbAvailable()) {
    return res.status(503).json({ error: 'Database not available' });
  }

  const { source, dimension, from, to } = req.query;

  if (!source || typeof source !== 'string') {
    return res.status(400).json({ error: 'source parameter required' });
  }
  if (!VALIDATION_SOURCES.includes(source as ValidationSource)) {
    return res
      .status(400)
      .json({ error: `Invalid source. Must be one of: ${VALIDATION_SOURCES.join(', ')}` });
  }
  if (!dimension || typeof dimension !== 'string') {
    return res.status(400).json({ error: 'dimension parameter required' });
  }

  try {
    const data = await getValidationTimeSeries(source as ValidationSource, dimension, {
      from: typeof from === 'string' ? from : undefined,
      to: typeof to === 'string' ? to : undefined,
    });
    res.status(200).json(data);
  } catch (err) {
    console.error('Validation timeseries error:', err);
    res.status(500).json({ error: 'Failed to fetch validation time series' });
  }
}
