import { describe, expect, it } from 'vitest';
import { heldReporters, pickReporters, pickUnreplied } from '@/lib/tipwire/store-sent';

/** Multi-reporter candidates (R-TIPWIRE-4 #877): the owner names recipients; a
 *  single-reporter candidate keeps the old one-flag workflow. */
describe('tips:sent recipient selection (#877)', () => {
  it('defaults to the only listed reporter, requires --reporter when several are listed, and rejects unlisted ids', () => {
    expect(pickReporters(3, ['wagner'], undefined)).toEqual(['wagner']);
    expect(pickReporters(3, ['wagner'], [])).toEqual(['wagner']);
    expect(() => pickReporters(3, ['wagner', 'natanson'], undefined)).toThrow(
      /lists reporters wagner, natanson — pass --reporter/,
    );
    expect(pickReporters(3, ['wagner', 'natanson'], ['natanson'])).toEqual(['natanson']);
    expect(pickReporters(3, ['wagner', 'natanson'], ['natanson', 'wagner', 'natanson'])).toEqual([
      'natanson',
      'wagner',
    ]);
    expect(() => pickReporters(3, ['wagner', 'natanson'], ['katz'])).toThrow(
      /does not list katz \(listed: wagner, natanson\)/,
    );
  });

  it('marks replies only against real unreplied sends, names the right set in every error, and tolerates duplicate legacy rows', () => {
    expect(pickUnreplied(3, ['wagner'], ['wagner', 'wagner'], undefined)).toEqual(['wagner']);
    expect(pickUnreplied(3, ['wagner', 'natanson'], [], undefined)).toEqual([]);
    expect(() =>
      pickUnreplied(3, ['wagner', 'natanson'], ['wagner', 'natanson'], undefined),
    ).toThrow(/unreplied sends to wagner, natanson — pass --reporter/);
    expect(pickUnreplied(3, ['wagner', 'natanson'], ['natanson'], ['natanson'])).toEqual([
      'natanson',
    ]);
    expect(() => pickUnreplied(3, ['wagner', 'natanson'], ['natanson'], ['wagner'])).toThrow(
      /no unreplied send to wagner \(unreplied: natanson\)/,
    );
    expect(() => pickUnreplied(3, ['wagner', 'natanson'], ['natanson'], ['katz'])).toThrow(
      /does not list katz/,
    );
  });

  it('refuses a send to a reporter still in unreplied cooldown', () => {
    const now = new Date('2026-09-09T12:00:00Z');
    const sent = [
      { reporterId: 'wagner', sentAt: new Date('2026-09-01T00:00:00Z'), repliedAt: null },
      { reporterId: 'katz', sentAt: new Date('2026-09-01T00:00:00Z'), repliedAt: new Date() },
    ];
    expect(heldReporters(['wagner', 'katz', 'natanson'], sent, now)).toEqual(['wagner']);
  });
});
