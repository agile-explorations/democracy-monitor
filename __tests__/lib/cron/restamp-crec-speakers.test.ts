import { describe, expect, it } from 'vitest';
import { parseRestampArgs, restampReason } from '@/lib/cron/restamp-crec-speakers';
import { T2_INAUGURATION } from '@/lib/data/analysis-periods';
import {
  ELECTIONS_FLATTENED,
  ELECTIONS_MEMBERS,
  GRASSLEY_FLATTENED,
  SINGLE_MEMBER,
} from '../../fixtures/crec-elections-granule';

describe('crec:restamp-speakers (#928)', () => {
  it('names the reason a stored granule is not attributable, or null when it is', () => {
    expect(restampReason(ELECTIONS_FLATTENED, ELECTIONS_MEMBERS)).toBe('several members listed');
    // GovInfo listed one member; the text has several turns
    expect(restampReason(ELECTIONS_FLATTENED, SINGLE_MEMBER)).toBe('several speakers in the text');
    expect(restampReason(GRASSLEY_FLATTENED, SINGLE_MEMBER)).toBeNull();
    expect(restampReason(null, SINGLE_MEMBER)).toBeNull();
    expect(restampReason(null, null)).toBeNull();
  });

  it('defaults to a dry run over the current term and refuses baseline rows without approval', () => {
    expect(parseRestampArgs([])).toEqual({
      confirm: false,
      confirmBaseline: false,
      from: T2_INAUGURATION,
    });
    expect(parseRestampArgs(['--confirm', '--from', '2026-06-01', '--to', '2026-09-01'])).toEqual({
      confirm: true,
      confirmBaseline: false,
      from: '2026-06-01',
      to: '2026-09-01',
    });
    expect(() => parseRestampArgs(['--from', '2022-01-03'])).toThrow(/confirm-baseline/);
    expect(parseRestampArgs(['--from', '2022-01-03', '--confirm-baseline']).from).toBe(
      '2022-01-03',
    );
    expect(() => parseRestampArgs(['--from', 'yesterday'])).toThrow(/bad date/);
  });
});
