import { describe, expect, it } from 'vitest';
import { parseTipwireArgs } from '../../scripts/tipwire';

describe('tipwire CLI args (#854)', () => {
  it('parses each subcommand with its flags and defaults', () => {
    expect(parseTipwireArgs(['probe'])).toMatchObject({ command: 'probe', confirm: false });
    expect(parseTipwireArgs(['probe', '--coverage'])).toMatchObject({
      command: 'probe',
      coverage: true,
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
