/**
 * Infra drift guard (#780): diff render.yaml's declared plans against the
 * live Render API.
 *
 * Blueprint syncs ENFORCE render.yaml — on 2026-08-17 a re-sync silently
 * downgraded the prod database from its dashboard-upgraded Pro-4gb to the
 * stale basic-1gb in the file, and the search working set fell out of RAM
 * for a week before diagnosis. This check makes that class of failure
 * (dashboard and yaml disagreeing, in either direction) visible on demand.
 *
 * Usage: RENDER_API_KEY=... npx tsx scripts/validate-infra.ts
 * Exit 1 on any mismatch; prints a per-resource table either way.
 */

import { readFileSync } from 'fs';
import { checkHelp } from '@/lib/utils/cli-help';

checkHelp(
  process.argv.slice(2),
  'Diff render.yaml declared plans against the live Render API (drift guard, #780). Usage: RENDER_API_KEY=... pnpm validate:infra',
);

/** Resources checked: yaml name → { kind, id }. Dashboard-managed resources
 *  not in render.yaml (e.g. the dev stack) are deliberately out of scope —
 *  only declared state can be silently enforced by a sync. */
const RESOURCES: Array<{ name: string; kind: 'postgres' | 'service' | 'key-value'; id: string }> = [
  { name: 'democracy-monitor', kind: 'service', id: 'srv-d6mli9fgi27c73bvinhg' },
  { name: 'epd-db', kind: 'postgres', id: 'dpg-d6mlhofgi27c73bvih90-a' },
  { name: 'epd-redis', kind: 'key-value', id: 'red-d6mlhofgi27c73bvih7g' },
];

/** Pull `plan:` for a named resource out of render.yaml without a YAML dep:
 *  find the `- name: <name>` line, then the first `plan:` before the next
 *  `- name:`. Pure enough for this file's flat structure. */
export function declaredPlan(yaml: string, name: string): string | null {
  const lines = yaml.split('\n');
  // A resource name can also appear in fromDatabase/fromService references,
  // which carry no plan — scan every occurrence and take the first block
  // that actually declares one.
  for (let start = 0; start < lines.length; start++) {
    const s = lines[start].trim();
    if (s !== `- name: ${name}` && s !== `name: ${name}`) continue;
    for (let i = start + 1; i < lines.length; i++) {
      const t = lines[i].trim();
      // Next list item ends this block.
      if (t.startsWith('- ')) break;
      if (t.startsWith('plan:')) return t.slice('plan:'.length).trim();
    }
  }
  return null;
}

/** Render API reports plans with underscores (basic_4gb); yaml uses hyphens. */
const normalize = (plan: string): string => plan.toLowerCase().replace(/[_-]/g, '-');

async function livePlan(kind: string, id: string, apiKey: string): Promise<string> {
  const res = await fetch(
    `https://api.render.com/v1/${kind === 'service' ? 'services' : kind}/${id}`,
    {
      headers: { Authorization: `Bearer ${apiKey}` },
    },
  );
  if (!res.ok) throw new Error(`Render API ${res.status} for ${kind}/${id}`);
  const body = (await res.json()) as { plan?: string; serviceDetails?: { plan?: string } };
  const plan = body.plan ?? body.serviceDetails?.plan;
  if (!plan) throw new Error(`no plan field for ${kind}/${id}`);
  return plan;
}

async function main(): Promise<void> {
  const apiKey = process.env.RENDER_API_KEY;
  if (!apiKey) {
    console.error('RENDER_API_KEY is required');
    process.exit(1);
  }
  const yaml = readFileSync('render.yaml', 'utf8');
  let drift = 0;
  for (const r of RESOURCES) {
    const declared = declaredPlan(yaml, r.name);
    const live = await livePlan(r.kind, r.id, apiKey);
    const match = declared !== null && normalize(declared) === normalize(live);
    if (!match) drift++;
    console.log(
      `${match ? 'OK   ' : 'DRIFT'} ${r.name.padEnd(20)} yaml=${declared ?? '(missing)'} live=${live}`,
    );
  }
  if (drift > 0) {
    console.error(
      `\n${drift} resource(s) drifted. Reconcile NOW: a Blueprint sync will enforce the yaml value (this silently downgraded prod Postgres on 2026-08-17).`,
    );
    process.exit(1);
  }
  console.log('\nrender.yaml matches live Render state.');
}

main().catch((err) => {
  console.error('validate:infra failed:', err);
  process.exit(1);
});
