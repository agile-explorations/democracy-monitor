/**
 * R-TIPWIRE operator CLI (#854–#858). One entry point, subcommands:
 *
 *   pnpm tips:probe                      # fetch each active source once; print status + counts
 *   pnpm tips:dryrun --since D --out DIR [--confirm] [--max-calls N]   (#857)
 *   pnpm tips:score  --decisions F --packet F                          (#857)
 *   pnpm tips:poll   [--email] [--max-calls N] [--ignore-cadence]      (#858)
 *   pnpm tips:digest                                                    (#858)
 *   pnpm tips:sent   --candidate <id> [--replied|--dismiss]            (#858)
 *
 * Operator-only: DB credentials are the authorization (no web surface).
 * Never writes `documents`. Exit codes: 0 ok · 1 error · 3 AI-call cap tripped.
 */

import { probeSource } from '@/lib/tipwire/acquire';
import { activeReporters } from '@/lib/tipwire/roster';
import { checkHelp } from '@/lib/utils/cli-help';

export type TipwireCommand = 'probe' | 'dryrun' | 'score' | 'poll' | 'digest' | 'sent';

export interface TipwireArgs {
  command: TipwireCommand;
  since?: string;
  out?: string;
  confirm: boolean;
  maxCalls?: number;
  email: boolean;
  ignoreCadence: boolean;
  candidate?: number;
  replied: boolean;
  dismiss: boolean;
  decisions?: string;
  packet?: string;
}

const COMMANDS: TipwireCommand[] = ['probe', 'dryrun', 'score', 'poll', 'digest', 'sent'];

export function parseTipwireArgs(argv: string[]): TipwireArgs {
  const [first, ...rest] = argv;
  if (!COMMANDS.includes(first as TipwireCommand)) {
    throw new Error(`unknown subcommand "${first ?? ''}" — expected one of ${COMMANDS.join(', ')}`);
  }
  const args: TipwireArgs = {
    command: first as TipwireCommand,
    confirm: false,
    email: false,
    ignoreCadence: false,
    replied: false,
    dismiss: false,
  };
  for (let i = 0; i < rest.length; i++) {
    const a = rest[i];
    const next = () => rest[++i];
    if (a === '--since') args.since = next();
    else if (a === '--out') args.out = next();
    else if (a === '--max-calls') args.maxCalls = Number(next());
    else if (a === '--candidate') args.candidate = Number(next());
    else if (a === '--decisions') args.decisions = next();
    else if (a === '--packet') args.packet = next();
    else if (a === '--confirm') args.confirm = true;
    else if (a === '--email') args.email = true;
    else if (a === '--ignore-cadence') args.ignoreCadence = true;
    else if (a === '--replied') args.replied = true;
    else if (a === '--dismiss') args.dismiss = true;
    else throw new Error(`unknown flag ${a}`);
  }
  if (args.replied && args.dismiss) throw new Error('--replied and --dismiss are exclusive');
  return args;
}

export async function runProbe(): Promise<boolean> {
  let allOk = true;
  for (const r of activeReporters()) {
    const p = await probeSource(r);
    allOk &&= p.ok;
    console.log(`${p.ok ? '✓' : '✗'} ${r.id} [${p.kind}] ${p.detail}`);
  }
  return allOk;
}

async function main(args: TipwireArgs): Promise<number> {
  switch (args.command) {
    case 'probe':
      return (await runProbe()) ? 0 : 1;
    default:
      console.error(`[tipwire] ${args.command} is not implemented yet`);
      return 1;
  }
}

const USAGE =
  'Usage: pnpm tips:<probe|dryrun|score|poll|digest|sent> [flags] — see scripts/tipwire.ts header';

if (require.main === module) {
  const { loadEnvConfig } = require('@next/env');
  loadEnvConfig(process.cwd());
  const argv = process.argv.slice(2);
  checkHelp(argv, USAGE);
  Promise.resolve()
    .then(() => main(parseTipwireArgs(argv)))
    .then((code) => process.exit(code))
    .catch((err) => {
      console.error('[tipwire] Fatal:', err instanceof Error ? err.message : err);
      process.exit(1);
    });
}
