import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  formatPendingRow,
  formatSelectableRow,
  parseModerateArgs,
  parseSelection,
  readMultilineReply,
  runModerate,
} from '@/lib/cron/feedback-moderate';

/** A fake async line iterator that yields all lines up front — models a paste. */
function lineIteratorOf(lines: string[]): AsyncIterator<string> {
  let i = 0;
  return {
    next: async () =>
      i < lines.length
        ? { value: lines[i++], done: false }
        : { value: undefined as unknown as string, done: true },
  };
}

const { state } = vi.hoisted(() => ({
  state: {
    feedbackRow: undefined as { email: string | null; message: string } | undefined,
    inserted: undefined as { feedbackId: number; message: string } | undefined,
    approvedId: undefined as number | undefined,
    emailed: undefined as { to: string; original: string; reply: string } | undefined,
  },
}));

vi.mock('@/lib/services/feedback-notify', () => ({
  notifySubmitterOfResponse: async (to: string, original: string, reply: string) => {
    state.emailed = { to, original, reply };
  },
}));

vi.mock('@/lib/db', () => ({
  isDbAvailable: () => true,
  getDb: () => ({
    select: () => ({
      from: () => ({
        where: () => ({ limit: async () => (state.feedbackRow ? [state.feedbackRow] : []) }),
      }),
    }),
    insert: () => ({
      values: async (v: { feedbackId: number; message: string }) => {
        state.inserted = v;
      },
    }),
    update: () => ({
      set: () => ({
        where: async () => {
          state.approvedId = 1;
        },
      }),
    }),
  }),
}));

describe('parseModerateArgs', () => {
  it('defaults to list when no args', () => {
    expect(parseModerateArgs([])).toEqual({ list: false });
  });

  it('parses --list / --pending', () => {
    expect(parseModerateArgs(['--list']).list).toBe(true);
    expect(parseModerateArgs(['--pending']).list).toBe(true);
  });

  it('parses --approve <id> and --reject <id>', () => {
    expect(parseModerateArgs(['--approve', '42']).approveId).toBe(42);
    expect(parseModerateArgs(['--reject', '7']).rejectId).toBe(7);
  });

  it('parses --respond <id> <message>', () => {
    expect(parseModerateArgs(['--respond', '5', 'here is the answer'])).toMatchObject({
      respondId: 5,
      respondMessage: 'here is the answer',
    });
  });

  it('treats a bare --respond as interactive (no id consumed)', () => {
    const args = parseModerateArgs(['--respond']);
    expect(args.respondInteractive).toBe(true);
    expect(args.respondId).toBeUndefined();
  });

  it('treats --respond followed by a non-numeric token as interactive', () => {
    expect(parseModerateArgs(['--respond', '--list']).respondInteractive).toBe(true);
  });
});

describe('parseSelection', () => {
  it('returns the 1-based number for an in-range choice', () => {
    expect(parseSelection('3', 5)).toBe(3);
    expect(parseSelection(' 1 ', 5)).toBe(1);
  });

  it('returns quit for blank, q, or quit', () => {
    expect(parseSelection('', 5)).toBe('quit');
    expect(parseSelection('q', 5)).toBe('quit');
    expect(parseSelection('QUIT', 5)).toBe('quit');
  });

  it('returns null for out-of-range or non-numeric input', () => {
    expect(parseSelection('0', 5)).toBeNull();
    expect(parseSelection('6', 5)).toBeNull();
    expect(parseSelection('abc', 5)).toBeNull();
  });
});

describe('readMultilineReply', () => {
  it('joins every line up to the "." terminator (no lines dropped on paste)', async () => {
    // The whole reply arrives at once, as with a clipboard paste (#674).
    const reply = await readMultilineReply(
      lineIteratorOf(['Line ONE', 'https://example.com/methodology', 'Line THREE', '.', 'ignored']),
    );
    expect(reply).toBe('Line ONE\nhttps://example.com/methodology\nLine THREE');
  });

  it('stops at the terminator and ignores anything after it', async () => {
    expect(await readMultilineReply(lineIteratorOf(['only line', '.']))).toBe('only line');
  });

  it('returns an empty string when the reply is just the terminator', async () => {
    expect(await readMultilineReply(lineIteratorOf(['.']))).toBe('');
  });

  it('stops cleanly if the input ends without a terminator', async () => {
    expect(await readMultilineReply(lineIteratorOf(['a', 'b']))).toBe('a\nb');
  });
});

describe('formatSelectableRow', () => {
  const base = {
    id: 12,
    type: 'question',
    category: null as string | null,
    email: 'a@b.com',
    message: 'A question',
    createdAt: new Date('2026-08-03T14:30:00Z'),
  };

  it('prefixes an index and a public/pending status tag', () => {
    expect(formatSelectableRow(1, { ...base, approved: false })).toContain('[1] pending');
    expect(formatSelectableRow(2, { ...base, approved: true })).toContain('[2] public');
  });

  it('includes the underlying row summary', () => {
    expect(formatSelectableRow(1, { ...base, approved: true })).toContain('#12');
  });
});

describe('formatPendingRow', () => {
  const base = {
    id: 12,
    type: 'suggestion',
    category: null as string | null,
    email: null as string | null,
    message: 'A short suggestion',
    createdAt: new Date('2026-08-03T14:30:00Z'),
  };

  it('formats id, timestamp, type and a preview', () => {
    const out = formatPendingRow(base);
    expect(out).toContain('#12');
    expect(out).toContain('2026-08-03 14:30');
    expect(out).toContain('suggestion');
    expect(out).toContain('A short suggestion');
  });

  it('includes email and category when present', () => {
    expect(formatPendingRow({ ...base, email: 'a@b.com', category: 'elections' })).toContain(
      'suggestion/elections <a@b.com>',
    );
  });

  it('truncates a long message with an ellipsis and collapses whitespace', () => {
    const out = formatPendingRow({ ...base, message: 'x'.repeat(200) });
    expect(out).toContain('…');
    expect(out).not.toContain('x'.repeat(150));
  });
});

describe('runModerate --respond', () => {
  beforeEach(() => {
    state.feedbackRow = undefined;
    state.inserted = undefined;
    state.approvedId = undefined;
    state.emailed = undefined;
  });

  it('stores the reply, publishes the item, and emails a submitter who left an address', async () => {
    state.feedbackRow = { email: 'user@example.com', message: 'Is X real?' };
    await runModerate({ list: false, respondId: 5, respondMessage: 'Yes, here is why.' });

    expect(state.inserted).toEqual({ feedbackId: 5, message: 'Yes, here is why.' });
    expect(state.approvedId).toBe(1);
    expect(state.emailed).toEqual({
      to: 'user@example.com',
      original: 'Is X real?',
      reply: 'Yes, here is why.',
    });
  });

  it('stores and publishes but does not email when no address is on file', async () => {
    state.feedbackRow = { email: null, message: 'anonymous note' };
    await runModerate({ list: false, respondId: 8, respondMessage: 'Thanks for the note.' });

    expect(state.inserted).toEqual({ feedbackId: 8, message: 'Thanks for the note.' });
    expect(state.approvedId).toBe(1);
    expect(state.emailed).toBeUndefined();
  });

  it('does nothing when the feedback id is not found', async () => {
    state.feedbackRow = undefined;
    await runModerate({ list: false, respondId: 999, respondMessage: 'reply' });

    expect(state.inserted).toBeUndefined();
    expect(state.approvedId).toBeUndefined();
    expect(state.emailed).toBeUndefined();
  });

  it('rejects an empty response message', async () => {
    await expect(runModerate({ list: false, respondId: 5, respondMessage: '   ' })).rejects.toThrow(
      /requires a message/,
    );
  });
});
