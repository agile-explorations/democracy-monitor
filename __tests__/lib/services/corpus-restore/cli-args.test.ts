import { describe, expect, it } from 'vitest';
import { parseRestoreArgs } from '@/lib/services/corpus-restore/cli-args';

const TODAY = '2026-09-15';

describe('parseRestoreArgs', () => {
  it('defaults to a dry run with no cap', () => {
    const args = parseRestoreArgs(['--source', 'fr'], TODAY);
    expect(args).toMatchObject({ source: 'fr', confirm: false, maxDocs: undefined });
  });

  it('applies per-source default ranges ending today', () => {
    expect(parseRestoreArgs(['--source', 'cpd'], TODAY)).toMatchObject({
      from: '2017-01-20',
      to: TODAY,
    });
    expect(parseRestoreArgs(['--source', 'doj'], TODAY)).toMatchObject({
      from: '2017-01-20',
      to: TODAY,
    });
    expect(parseRestoreArgs(['--source', 'crec'], TODAY)).toMatchObject({
      from: '2025-01-20',
      to: TODAY,
    });
  });

  it('honours explicit flags', () => {
    const args = parseRestoreArgs(
      [
        '--source',
        'crec',
        '--confirm',
        '--max-docs',
        '25',
        '--from',
        '2025-03-01',
        '--to',
        '2025-03-31',
      ],
      TODAY,
    );
    expect(args).toEqual({
      source: 'crec',
      confirm: true,
      maxDocs: 25,
      from: '2025-03-01',
      to: '2025-03-31',
      baselines: false,
    });
  });

  it('requires --baselines to write a ranged source before 2025-01-20 (dry-run exempt)', () => {
    const pre = ['--source', 'cpd', '--from', '2019-01-01', '--to', '2019-12-31'];
    expect(() => parseRestoreArgs([...pre, '--confirm'], TODAY)).toThrow(/--baselines/);
    expect(parseRestoreArgs([...pre, '--confirm', '--baselines'], TODAY).baselines).toBe(true);
    expect(parseRestoreArgs(pre, TODAY).confirm).toBe(false);
  });

  it('rejects a missing or unknown source', () => {
    expect(() => parseRestoreArgs([], TODAY)).toThrow(/--source is required/);
    expect(() => parseRestoreArgs(['--source', 'gao'], TODAY)).toThrow(/--source is required/);
  });

  it('rejects --dry-run together with --confirm', () => {
    expect(() => parseRestoreArgs(['--source', 'fr', '--dry-run', '--confirm'], TODAY)).toThrow(
      /mutually exclusive/,
    );
  });

  it('rejects malformed values and inverted ranges', () => {
    expect(() => parseRestoreArgs(['--source', 'fr', '--max-docs', '0'], TODAY)).toThrow(
      /positive integer/,
    );
    expect(() => parseRestoreArgs(['--source', 'fr', '--from', '2025/01/01'], TODAY)).toThrow(
      /YYYY-MM-DD/,
    );
    expect(() =>
      parseRestoreArgs(['--source', 'doj', '--from', '2026-01-01', '--to', '2025-01-01'], TODAY),
    ).toThrow(/after/);
    expect(() => parseRestoreArgs(['--source', 'fr', '--bogus'], TODAY)).toThrow(
      /Unknown argument/,
    );
  });
});
