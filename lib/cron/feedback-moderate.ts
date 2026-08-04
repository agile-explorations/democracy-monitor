/**
 * CLI: pnpm feedback:moderate -- [--list | --approve <id> | --reject <id> | --respond [<id> <message>]]
 *
 * Feedback moderation (#671). Runs locally or from a Render shell against the
 * production database — DB credentials are the authorization, so the website
 * needs no auth surface. `--approve` reveals a submission on the public
 * feedback page; `--reject` deletes it; `--respond <id> <message>` posts a
 * public reply, auto-publishes the item, and emails the submitter if they left
 * an address (#672). `--respond` with no id opens an interactive numbered menu
 * of every post (pending + public) and prompts for a multi-line reply (#672).
 */

import { createInterface } from 'node:readline/promises';
import { desc, eq } from 'drizzle-orm';
import { getDb, isDbAvailable } from '@/lib/db';
import { feedback, feedbackResponses } from '@/lib/db/schema';
import { notifySubmitterOfResponse } from '@/lib/services/feedback-notify';
import { checkHelp } from '@/lib/utils/cli-help';

interface ModerateArgs {
  list: boolean;
  approveId?: number;
  rejectId?: number;
  respondId?: number;
  respondMessage?: string;
  respondInteractive?: boolean;
}

export function parseModerateArgs(argv: string[]): ModerateArgs {
  const args: ModerateArgs = { list: false };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--list' || argv[i] === '--pending') args.list = true;
    else if (argv[i] === '--approve') args.approveId = Number(argv[++i]);
    else if (argv[i] === '--reject') args.rejectId = Number(argv[++i]);
    else if (argv[i] === '--respond') {
      // `--respond <id> <message>` when an integer id follows; otherwise
      // `--respond` alone selects the interactive menu.
      const next = argv[i + 1];
      if (next !== undefined && /^\d+$/.test(next)) {
        args.respondId = Number(argv[++i]);
        args.respondMessage = argv[++i];
      } else {
        args.respondInteractive = true;
      }
    }
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

/** A numbered, status-tagged menu row for the interactive `--respond` picker. */
export function formatSelectableRow(
  index: number,
  row: Parameters<typeof formatPendingRow>[0] & { approved: boolean },
): string {
  const status = row.approved ? 'public ' : 'pending';
  return `[${index}] ${status} ${formatPendingRow(row)}`;
}

/**
 * Resolve a menu choice against a list of `count` items. Returns the 1-based
 * selection, `'quit'` for q/quit/blank, or `null` for anything out of range.
 */
export function parseSelection(input: string, count: number): number | 'quit' | null {
  const trimmed = input.trim().toLowerCase();
  if (trimmed === '' || trimmed === 'q' || trimmed === 'quit') return 'quit';
  if (!/^\d+$/.test(trimmed)) return null;
  const n = Number(trimmed);
  return n >= 1 && n <= count ? n : null;
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

/**
 * Post a public reply to a feedback item: store the response, auto-publish the
 * item so the reply is visible, and email the submitter if they left an
 * address. The email is best-effort — the reply is already stored and public.
 */
async function respond(id: number, message: string): Promise<void> {
  const db = getDb();
  const [row] = await db
    .select({ email: feedback.email, message: feedback.message })
    .from(feedback)
    .where(eq(feedback.id, id))
    .limit(1);
  if (!row) {
    console.error(`[feedback] no feedback #${id} — nothing to respond to.`);
    return;
  }

  await db.insert(feedbackResponses).values({ feedbackId: id, message });
  await db.update(feedback).set({ approved: true }).where(eq(feedback.id, id));

  if (row.email) {
    await notifySubmitterOfResponse(row.email, row.message, message);
    console.log(`[feedback] responded to #${id}, published, emailed <${row.email}>.`);
  } else {
    console.log(`[feedback] responded to #${id}, published (no email on file).`);
  }
}

/**
 * Read reply lines from a line iterator until a line containing only `.`,
 * joined and trimmed. Takes an async line iterator (not repeated
 * `rl.question()` calls) so that pasted multi-line input is never dropped —
 * the question-per-line loop discards lines that arrive between prompts (#674).
 */
export async function readMultilineReply(lines: AsyncIterator<string>): Promise<string> {
  const collected: string[] = [];
  for (;;) {
    const { value, done } = await lines.next();
    if (done || value.trim() === '.') break;
    collected.push(value);
  }
  return collected.join('\n').trim();
}

/**
 * Interactive `--respond`: list every post (pending + public) as a numbered
 * menu, let the moderator pick one, then collect a multi-line reply and hand it
 * to `respond`. Requires a terminal; the scriptable form is `--respond <id>`.
 *
 * Reads both the selection and the reply from a single async line iterator so
 * no pasted line is dropped (a repeated `rl.question()` loop loses buffered
 * lines — see #674).
 */
async function promptInteractiveRespond(): Promise<void> {
  if (!process.stdin.isTTY) {
    throw new Error(
      'Interactive --respond needs a terminal. Use: --respond <id> "your reply" instead.',
    );
  }
  const rows = await getDb().select().from(feedback).orderBy(desc(feedback.createdAt));
  if (rows.length === 0) {
    console.log('[feedback] No feedback to respond to.');
    return;
  }
  console.log(`[feedback] ${rows.length} post(s):\n`);
  rows.forEach((row, i) => console.log(formatSelectableRow(i + 1, row)));

  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    const lineIter = rl[Symbol.asyncIterator]();
    process.stdout.write('\nSelect a post number (q to quit): ');
    const selection = await lineIter.next();
    const choice = parseSelection(selection.done ? '' : selection.value, rows.length);
    if (choice !== 'quit' && choice !== null) {
      const selected = rows[choice - 1];
      console.log(`\nResponding to #${selected.id} (${selected.approved ? 'public' : 'pending'}).`);
      console.log('Enter your reply. Finish with a single "." on its own line:');
      const message = await readMultilineReply(lineIter);
      if (message) await respond(selected.id, message);
      else console.log('[feedback] Empty reply — aborted.');
    } else {
      console.log(
        choice === null ? '[feedback] Not a valid selection — aborted.' : '[feedback] Aborted.',
      );
    }
  } finally {
    rl.close();
  }
}

export async function runModerate(args: ModerateArgs): Promise<void> {
  if (!isDbAvailable()) throw new Error('DATABASE_URL not configured');
  if (args.respondInteractive) {
    await promptInteractiveRespond();
  } else if (args.respondId !== undefined) {
    if (!Number.isInteger(args.respondId)) throw new Error('--respond requires an integer id');
    if (!args.respondMessage || !args.respondMessage.trim())
      throw new Error('--respond requires a message: --respond <id> "your reply"');
    await respond(args.respondId, args.respondMessage);
  } else if (args.approveId !== undefined) {
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
  --list, --pending      List feedback awaiting approval (default)
  --approve <id>         Approve a submission (reveals it on the public page)
  --reject <id>          Delete a submission
  --respond <id> <msg>   Post a public reply, publish the item, email the submitter
  --respond              Interactive: pick a post from a numbered menu, then type a reply`,
  );
  runModerate(parseModerateArgs(argv))
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('[feedback] moderation failed:', err);
      process.exit(1);
    });
}
