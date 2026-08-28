/**
 * Dev environment lifecycle (#791): suspend / resume / inspect the dev web
 * service and dev Postgres through the Render API, so gate runs can bring
 * the environment up and down without the dashboard (the owner keeps dev
 * suspended between measurement rounds to save money).
 *
 * Usage: RENDER_API_KEY=... pnpm dev:status | dev:suspend | dev:resume
 *
 * Resume order is Postgres → web service (the app needs the DB); suspend is
 * the reverse. After a resume: dev deploys do NOT run migrations — apply
 * schema changes by hand (`DATABASE_URL=<dev> pnpm db:migrate`) and re-warm
 * the indexes (`pnpm db:prewarm`) before measuring.
 */

import { sleep } from '@/lib/utils/async';
import { checkHelp } from '@/lib/utils/cli-help';

checkHelp(
  process.argv.slice(2),
  'Dev environment lifecycle via the Render API (#791). Usage: RENDER_API_KEY=... pnpm dev:status | dev:suspend | dev:resume',
);

/** Dashboard-managed dev stack (deliberately outside render.yaml's drift
 *  guard — render-dev.yaml is documentation only). */
export const DEV_STACK = {
  service: { id: 'srv-d77d21h5pdvs739c0ds0', name: 'democracy-monitor-dev' },
  postgres: { id: 'dpg-d770812a214c73d6tl0g-a', name: 'epd-db-dev' },
  url: 'https://democracy-monitor-dev.onrender.com',
} as const;

const API = 'https://api.render.com/v1';
const RESUME_TIMEOUT_MS = 10 * 60 * 1000;
const POLL_MS = 15_000;

export type Action = 'status' | 'suspend' | 'resume';

export interface DevState {
  serviceSuspended: boolean;
  postgresSuspended: boolean;
}

export interface Step {
  kind: 'postgres' | 'service';
  op: 'suspend' | 'resume';
}

/** The API calls an action needs given the current state, in the order
 *  they must run: resume DB before web, suspend web before DB; resources
 *  already in the target state are skipped. Pure. */
export function planTransition(action: Exclude<Action, 'status'>, state: DevState): Step[] {
  const steps: Step[] = [];
  if (action === 'resume') {
    if (state.postgresSuspended) steps.push({ kind: 'postgres', op: 'resume' });
    if (state.serviceSuspended) steps.push({ kind: 'service', op: 'resume' });
  } else {
    if (!state.serviceSuspended) steps.push({ kind: 'service', op: 'suspend' });
    if (!state.postgresSuspended) steps.push({ kind: 'postgres', op: 'suspend' });
  }
  return steps;
}

async function render(path: string, init: RequestInit = {}): Promise<Response> {
  const key = process.env.RENDER_API_KEY;
  if (!key) throw new Error('RENDER_API_KEY is required');
  return fetch(`${API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${key}`,
      Accept: 'application/json',
      ...(init.headers ?? {}),
    },
  });
}

async function readState(): Promise<DevState> {
  const [svc, pg] = await Promise.all([
    render(`/services/${DEV_STACK.service.id}`).then((r) => r.json()),
    render(`/postgres/${DEV_STACK.postgres.id}`).then((r) => r.json()),
  ]);
  return {
    serviceSuspended: (svc as { suspended?: string }).suspended === 'suspended',
    postgresSuspended: (pg as { status?: string }).status === 'suspended',
  };
}

function resourcePath(step: Step): string {
  const base =
    step.kind === 'postgres'
      ? `/postgres/${DEV_STACK.postgres.id}`
      : `/services/${DEV_STACK.service.id}`;
  return `${base}/${step.op}`;
}

async function waitForResume(): Promise<void> {
  const deadline = Date.now() + RESUME_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const state = await readState();
    if (!state.postgresSuspended && !state.serviceSuspended) {
      const ok = await fetch(`${DEV_STACK.url}/api/version`, {
        signal: AbortSignal.timeout(10_000),
      })
        .then((r) => r.ok)
        .catch(() => false);
      if (ok) return;
    }
    await sleep(POLL_MS);
  }
  throw new Error('dev did not come up within 10 minutes — check the Render dashboard');
}

async function main(): Promise<void> {
  const action = (process.argv[2] ?? 'status') as Action;
  if (!['status', 'suspend', 'resume'].includes(action)) {
    console.error('usage: pnpm dev:status | dev:suspend | dev:resume');
    process.exit(1);
  }
  const state = await readState();
  console.log(
    `[dev-env] ${DEV_STACK.service.name}: ${state.serviceSuspended ? 'suspended' : 'running'} · ${DEV_STACK.postgres.name}: ${state.postgresSuspended ? 'suspended' : 'running'}`,
  );
  if (action === 'status') return;
  const steps = planTransition(action, state);
  if (steps.length === 0) {
    console.log(
      `[dev-env] already ${action === 'resume' ? 'running' : 'suspended'} — nothing to do`,
    );
    return;
  }
  for (const step of steps) {
    const res = await render(resourcePath(step), { method: 'POST' });
    if (!res.ok)
      throw new Error(`${step.kind} ${step.op} failed: HTTP ${res.status} ${await res.text()}`);
    console.log(`[dev-env] ${step.kind} ${step.op}: accepted`);
  }
  if (action === 'resume') {
    console.log('[dev-env] waiting for dev to answer /api/version …');
    await waitForResume();
    console.log(
      `[dev-env] dev is up at ${DEV_STACK.url}. Reminders: dev deploys do not run migrations (DATABASE_URL=<dev> pnpm db:migrate); re-warm indexes (pnpm db:prewarm) before measuring.`,
    );
  } else {
    console.log(
      '[dev-env] suspend accepted for both resources (data retained; resume with pnpm dev:resume)',
    );
  }
}

if (require.main === module) {
  main().catch((err) => {
    console.error('[dev-env] failed:', err instanceof Error ? err.message : err);
    process.exit(1);
  });
}
