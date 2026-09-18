import { describe, expect, it } from 'vitest';
import {
  admitsBlindNominee,
  BLIND_CHANNEL_DFT_CAP,
  corroboratedPhrases,
  gateChannelRows,
  isBlindChannel,
  isCorroboratedRow,
  capForRow,
  NO_DROPS,
  resolveBlindDftCaps,
  uncorroboratedArms,
} from '@/lib/services/hot-entity-corroboration';
import type {
  EntityRow,
  NominationChannel,
  PoolEntityRow,
} from '@/lib/services/hot-entity-ranking';

const row = (
  phrase: string,
  channel: NominationChannel | undefined,
  docFreqTerm: number,
): EntityRow => ({
  phrase,
  entityClass: 'eo',
  categories: ['fiscal', 'military', 'executiveActions', 'rulemaking', 'immigrationEnforcement'],
  ftsMatches: 100,
  docFreqTerm,
  docFreqBaseline: 0,
  ...(channel ? { channel } : {}),
});

const poolRow = (phrase: string, poolMentions: number): PoolEntityRow => ({
  ...row(phrase, 'pool', 50),
  poolMentions,
});

describe('corroboratedPhrases', () => {
  it('collects pool phrases at or above the mention floor and every question row it is given', () => {
    const set = corroboratedPhrases(
      [poolRow('Discussed Twice', 2), poolRow('Incidental', 1)],
      [row('Question Match', 'question', 12)],
      2,
    );
    expect(set).toEqual(new Set(['discussed twice', 'question match']));
  });
});

describe('admitsBlindNominee / gateChannelRows (#911)', () => {
  const giant = row('Executive Order 14192', undefined, 513);
  const categoryGiant = row('Public Law 119-21', undefined, 152);
  const canon = row('J.G.G. v. Trump', undefined, 12);

  it('drops an uncorroborated giant before the channel ranks and slices', () => {
    const out = gateChannelRows([giant, categoryGiant, canon], new Set(), 30);
    expect(out.kept.map((r) => r.phrase)).toEqual(['J.G.G. v. Trump']);
    expect(out.dropped).toBe(2);
  });

  it('keeps a giant the pool or the question also nominated', () => {
    const out = gateChannelRows([giant, categoryGiant], new Set(['public law 119-21']), 30);
    expect(out.kept.map((r) => r.phrase)).toEqual(['Public Law 119-21']);
    expect(out.dropped).toBe(1);
  });

  it('keeps a specific (low doc-frequency) nominee without corroboration', () => {
    expect(admitsBlindNominee(canon, new Set(), 30)).toBe(true);
    expect(admitsBlindNominee(giant, new Set(), 30)).toBe(false);
  });

  it('strictly under the cap admits; at the cap does not', () => {
    expect(admitsBlindNominee(row('Under', undefined, 29), new Set(), 30)).toBe(true);
    expect(admitsBlindNominee(row('At', undefined, 30), new Set(), 30)).toBe(false);
  });

  it('caps each era separately, applies the absolute override to every era, and gives era-less rows the strictest cap', () => {
    const caps = resolveBlindDftCaps({ trump_t2: 17, trump_t1: 45 }, 0);
    expect(caps).toEqual({ trump_t2: 17, trump_t1: 45 });
    expect(resolveBlindDftCaps({ trump_t2: 17, trump_t1: 45 }, 30)).toEqual({
      trump_t2: 30,
      trump_t1: 30,
    });
    const t2 = { ...row('Current Giant', undefined, 30), era: 'trump_t2' as const };
    const t1 = { ...row('Old Canon', undefined, 30), era: 'trump_t1' as const };
    const noEra = row('Legacy', undefined, 30);
    expect(capForRow(t2, caps)).toBe(17);
    expect(capForRow(t1, caps)).toBe(45);
    expect(capForRow(noEra, caps)).toBe(17);
    expect(gateChannelRows([t2, t1, noEra], new Set(), caps).kept.map((r) => r.phrase)).toEqual([
      'Old Canon',
    ]);
    expect(BLIND_CHANNEL_DFT_CAP).toBeGreaterThanOrEqual(0);
  });

  it('exports a zero drop record', () => {
    expect(NO_DROPS).toEqual({ category: 0, global: 0 });
  });
});

describe('channel predicates', () => {
  it('names the two question-blind channels and treats untagged rows as corroborated', () => {
    expect(isBlindChannel('category')).toBe(true);
    expect(isBlindChannel('global')).toBe(true);
    expect(isBlindChannel('pool')).toBe(false);
    expect(isBlindChannel('question')).toBe(false);
    expect(isBlindChannel(undefined)).toBe(false);
    expect(isCorroboratedRow(row('c', undefined, 1))).toBe(true);
    expect(isCorroboratedRow(row('d', 'category', 1))).toBe(false);
  });
});

describe('uncorroboratedArms (#913)', () => {
  it('names the arms that earned their seat only by specificity', () => {
    const shortlist = [
      row('Pool Pick', 'pool', 50),
      row('Specific Global', 'global', 12),
      row('Corroborated Category', 'category', 80),
    ];
    const arms = shortlist.map((r) => ({ phrase: r.phrase }));
    expect(uncorroboratedArms(arms, shortlist, new Set(['corroborated category']))).toEqual([
      'Specific Global',
    ]);
  });

  it('ignores arms that are not shortlist rows (expansion, mined)', () => {
    expect(
      uncorroboratedArms([{ phrase: 'Title IX' }], [row('x', 'global', 5)], new Set()),
    ).toEqual([]);
  });
});
