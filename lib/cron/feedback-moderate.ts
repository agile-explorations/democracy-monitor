/**
 * CLI: pnpm feedback:moderate -- [--list | --approve <id> | --reject <id>]
 *
 * Feedback moderation (#671). Runs locally or from a Render shell against the
 * production database — DB credentials are the authorization, so the website
 * needs no auth surface. `--approve` reveals a submission on the public
 * feedback page; `--reject` deletes it.
 */

import { desc, eq } from 'drizzle-orm';
import { getDb, isDbAvailable } from '@/lib/db';
import { feedback } from '@/lib/db/schema';
import { checkHelp } from '@/lib/utils/cli-help';

interface ModerateArgs {
  list: boolean;
  approveId?: number;
  rejectId?: number;
}

export function parseModerateArgs(argv: string[]): ModerateArgs {
  const args: ModerateArgs = { list: false };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--list' || argv[i] === '--pending') args.list = true;
    else if (argv[i] === '--approve') args.approveId = Number(argv[++i]);
    else if (argv[i] === '--reject') args.rejectId = Number(argv[++i]);
  }
  return args;
}

/** One-line summary of a pending feedback row for the CLI listing. */
export function formatPendingRow(row: {
  id: number;
  type: string;
  category: string | null;
  email: string | null;
  message: string;
  createdAt: Date;
}): string {
  const when = row.createdAt.toISOString().slice(0, 16).replace('T', ' ');
  const who = row.email ? ` <${row.email}>` : '';
  const tag = row.category ? `${row.type}/${row.category}` : row.type;
  const preview = row.message.replace(/\s+/g, ' ').slice(0, 100);
  return `#${row.id}  ${when}  ${tag}${who}\n     ${preview}${row.message.length > 100 ? '…' : ''}`;
}

async function listPending(): Promise<void> {
  const db = getDb();
  const rows = await db
    .select()
    .from(feedback)
    .where(eq(feedback.approved, false))
    .orderBy(desc(feedback.createdAt));
  if (rows.length === 0) {
    console.log('[feedback] No pending feedback.');
    return;
  }
  console.log(`[feedback] ${rows.length} pending:\n`);
  for (const row of rows) console.log(formatPendingRow(row));
  console.log(`\nApprove: pnpm feedback:moderate --approve <id>   Reject: --reject <id>`);
}

async function approve(id: number): Promise<void> {
  const res = await getDb().update(feedback).set({ approved: true }).where(eq(feedback.id, id));
  console.log(`[feedback] approved #${id} (${res.rowCount ?? 0} row(s)) — now public.`);
}

async function reject(id: number): Promise<void> {
  const res = await getDb().delete(feedback).where(eq(feedback.id, id));
  console.log(`[feedback] rejected #${id} (${res.rowCount ?? 0} row(s) deleted).`);
}

export async function runModerate(args: ModerateArgs): Promise<void> {
  if (!isDbAvailable()) throw new Error('DATABASE_URL not configured');
  if (args.approveId !== undefined) {
    if (!Number.isInteger(args.approveId)) throw new Error('--approve requires an integer id');
    await approve(args.approveId);
  } else if (args.rejectId !== undefined) {
    if (!Number.isInteger(args.rejectId)) throw new Error('--reject requires an integer id');
    await reject(args.rejectId);
  } else {
    await listPending();
  }
}

if (require.main === module) {
  const { loadEnvConfig } = require('@next/env');
  loadEnvConfig(process.cwd());
  const argv = process.argv.slice(2);
  checkHelp(
    argv,
    `Usage: pnpm feedback:moderate -- [options]

Moderate user feedback. No option lists pending submissions.

Options:
  --list, --pending   List feedback awaiting approval (default)
  --approve <id>      Approve a submission (reveals it on the public page)
  --reject <id>       Delete a submission`,
  );
  runModerate(parseModerateArgs(argv))
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('[feedback] moderation failed:', err);
      process.exit(1);
    });
}
