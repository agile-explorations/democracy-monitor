import { describe, expect, it } from 'vitest';
import { evidenceLabels } from '@/pages/system/reversals';

const GH = 'https://github.com/agile-explorations/democracy-monitor';

describe('evidenceLabels (#814 ledger evidence rendering)', () => {
  it('labels plain issues with a # prefix', () => {
    expect(evidenceLabels([`${GH}/issues/832`])).toEqual(['#832']);
  });

  it('labels a lone comment with its issue number and no ordinal', () => {
    expect(evidenceLabels([`${GH}/issues/833#issuecomment-5502611594`])).toEqual(['#833 comment']);
  });

  it('adds per-issue ordinals only when one issue carries several comments', () => {
    expect(
      evidenceLabels([
        `${GH}/issues/832`,
        `${GH}/issues/835#issuecomment-1`,
        `${GH}/issues/835#issuecomment-2`,
        `${GH}/issues/711#issuecomment-9`,
      ]),
    ).toEqual(['#832', '#835 comment 1', '#835 comment 2', '#711 comment']);
  });

  it('labels non-issue GitHub links by filename', () => {
    expect(evidenceLabels([`${GH}/blob/main/docs/DECISIONS.md`])).toEqual(['DECISIONS.md']);
  });
});
