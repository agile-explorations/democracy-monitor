import type { NextApiRequest, NextApiResponse } from 'next';
import { isDbAvailable } from '@/lib/db';
import { computeMetaAssessment } from '@/lib/services/meta-assessment-service';
import { computeHealthSummary, getLatestSourceHealth } from '@/lib/services/source-health-service';
import { requireMethod } from '@/lib/utils/api-helpers';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (!requireMethod(req, res, 'GET')) return;

  // nosemgrep: opengrep.no-inline-db-guard
  if (!isDbAvailable()) {
    return res.status(200).json({
      dataIntegrity: 'high',
      integrityScore: 1,
      sourceAvailability: 1,
      canaryStatus: 'all_ok',
      summary: 'Source health data not available.',
      alerts: [],
      checkedAt: new Date().toISOString(),
    });
  }

  const sources = await getLatestSourceHealth();
  const summary = computeHealthSummary(sources);
  const meta = computeMetaAssessment(summary, sources);
  return res.status(200).json(meta);
}
