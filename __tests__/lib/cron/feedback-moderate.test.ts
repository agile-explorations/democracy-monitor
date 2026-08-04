import { describe, expect, it } from 'vitest';
import { formatPendingRow, parseModerateArgs } from '@/lib/cron/feedback-moderate';

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
