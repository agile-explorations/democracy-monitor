import { describe, expect, it } from 'vitest';
import { getReporter } from '@/lib/tipwire/roster';
import type { ReporterEntry } from '@/lib/tipwire/roster';
import { parseTipwireArgs } from '../../scripts/tipwire';
import { splitByCadence } from '../../scripts/tipwire-beat';

describe('tipwire CLI args (#854)', () => {
  it('parses each subcommand with its flags and defaults', () => {
    expect(parseTipwireArgs(['probe'])).toMatchObject({ command: 'probe', confirm: false });
    expect(parseTipwireArgs(['probe', '--coverage'])).toMatchObject({
      command: 'probe',
      coverage: true,
    });
    expect(parseTipwireArgs(['dryrun', '--beat', '--weeks', '3', '--out', 'd'])).toMatchObject({
      command: 'dryrun',
      beat: true,
      weeks: 3,
      out: 'd',
    });
    expect(parseTipwireArgs(['coverage', '--max-calls', '10', '--candidate', '3'])).toMatchObject({
      command: 'coverage',
      maxCalls: 10,
      candidate: 3,
    });
    expect(
      parseTipwireArgs([
        'dryrun',
        '--since',
        '2026-08-24',
        '--out',
        'dir',
        '--confirm',
        '--max-calls',
        '80',
      ]),
    ).toMatchObject({
      command: 'dryrun',
      since: '2026-08-24',
      out: 'dir',
      confirm: true,
      maxCalls: 80,
    });
    expect(parseTipwireArgs(['poll', '--email', '--ignore-cadence'])).toMatchObject({
      command: 'poll',
      email: true,
      ignoreCadence: true,
    });
    expect(parseTipwireArgs(['sent', '--candidate', '12', '--replied'])).toMatchObject({
      command: 'sent',
      candidate: 12,
      replied: true,
      dismiss: false,
    });
    expect(
      parseTipwireArgs(['sent', '--candidate', '12', '--reporter', 'katz, natanson', '--replied']),
    ).toMatchObject({ candidate: 12, reporterIds: ['katz', 'natanson'], replied: true });
    expect(
      parseTipwireArgs(['dryrun', '--beat', '--reporter', 'parloff,schwellenbach', '--out', 'd']),
    ).toMatchObject({ beat: true, reporterIds: ['parloff', 'schwellenbach'], out: 'd' });
    expect(parseTipwireArgs(['dryrun', '--beat', '--out', 'd']).reporterIds).toBeUndefined();
    expect(
      parseTipwireArgs(['score', '--decisions', 'd.json', '--packet', 'p.json']),
    ).toMatchObject({
      decisions: 'd.json',
      packet: 'p.json',
    });
  });

  it('rejects unknown subcommands, unknown flags, and contradictory sent flags', () => {
    expect(() => parseTipwireArgs(['nope'])).toThrow(/unknown subcommand/);
    expect(() => parseTipwireArgs(['probe', '--wat'])).toThrow(/unknown flag/);
    expect(() => parseTipwireArgs(['sent', '--candidate', '1', '--replied', '--dismiss'])).toThrow(
      /exclusive/,
    );
  });
});

describe('beat cadence guard per listed reporter (#877)', () => {
  const must = (id: string): ReporterEntry => {
    const r = getReporter(id);
    if (!r) throw new Error(id);
    return r;
  };
  const now = new Date('2026-09-09T12:00:00Z');
  const held = [
    { reporterId: 'wagner', sentAt: new Date('2026-09-01T00:00:00Z'), repliedAt: null },
  ];
  const item = (reporters: ReporterEntry[]) => ({
    category: 'civilService' as const,
    reporters,
    weekOf: '2026-09-07',
    docIds: [1],
  });

  it('drops a held reporter from the listing, skips a check with nobody left, and honours --ignore-cadence', () => {
    const both = splitByCadence([item([must('wagner'), must('natanson')])], held, now, false);
    expect(both.keep[0].reporters.map((r) => r.id)).toEqual(['natanson']);
    expect(both.skipped).toEqual(['wagner']);
    const alone = splitByCadence([item([must('wagner')])], held, now, false);
    expect(alone.keep).toEqual([]);
    expect(alone.skipped).toEqual(['wagner']);
    const ignored = splitByCadence([item([must('wagner')])], held, now, true);
    expect(ignored.keep[0].reporters.map((r) => r.id)).toEqual(['wagner']);
    expect(ignored.skipped).toEqual([]);
  });
});
