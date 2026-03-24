import type { NextApiRequest, NextApiResponse } from 'next';
import type { CronRun } from '@/lib/services/cron-run-store';
import { getLatestRun } from '@/lib/services/cron-run-store';
import { requireDb, requireMethod } from '@/lib/utils/api-helpers';

const JOB_NAMES = ['snapshot', 'legiscan', 'dump'] as const;
const STALE_MS = 8 * 24 * 60 * 60 * 1000; // 8 days

type HealthStatus = 'healthy' | 'degraded' | 'unhealthy';

interface JobSummary {
  status: string;
  startedAt: string;
  durationMs: number | null;
  errors: string[] | null;
}

interface CronHealthResponse {
  status: HealthStatus;
  jobs: Record<string, JobSummary | null>;
  alerts: string[];
}

function classifyHealth(runs: Record<string, CronRun | null>): CronHealthResponse {
  const alerts: string[] = [];
  let hasUnhealthy = false;
  let hasDegraded = false;
  const now = Date.now();

  const jobs: Record<string, JobSummary | null> = {};

  for (const name of JOB_NAMES) {
    const run = runs[name];
    if (!run) {
      jobs[name] = null;
      hasDegraded = true;
      alerts.push(`No ${name} runs recorded yet`);
      continue;
    }

    jobs[name] = {
      status: run.status,
      startedAt: run.startedAt,
      durationMs: run.durationMs,
      errors: run.errors,
    };

    if (run.status === 'failed') {
      hasUnhealthy = true;
      alerts.push(`${name} last run failed`);
    } else if (run.status === 'partial' || run.status === 'skipped') {
      hasDegraded = true;
      alerts.push(`${name} last run status: ${run.status}`);
    }

    const age = now - new Date(run.startedAt).getTime();
    if (age > STALE_MS) {
      hasUnhealthy = true;
      alerts.push(`No ${name} run in 8+ days`);
    }
  }

  let status: HealthStatus = 'healthy';
  if (hasUnhealthy) status = 'unhealthy';
  else if (hasDegraded) status = 'degraded';

  return { status, jobs, alerts };
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (!requireMethod(req, res, 'GET')) return;
  if (!requireDb(res)) return;

  const runs: Record<string, CronRun | null> = {};
  for (const name of JOB_NAMES) {
    runs[name] = await getLatestRun(name);
  }

  const health = classifyHealth(runs);
  return res.status(200).json(health);
}
