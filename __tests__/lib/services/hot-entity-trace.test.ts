import { describe, expect, it } from 'vitest';
import { pickChannelTally } from '@/lib/services/hot-entity-trace';

describe('pickChannelTally (#910)', () => {
  it('attributes each arm to the channel that nominated it', () => {
    const shortlist = [
      { phrase: 'Newsom v. Trump', channel: 'pool' },
      { phrase: 'Insurrection Act', channel: 'question' },
      { phrase: 'J.G.G. v. Trump', channel: 'category' },
      { phrase: 'Public Law 119-21', channel: 'global' },
    ];
    const arms = [...shortlist.map((r) => ({ phrase: r.phrase })), { phrase: 'Title IX' }];
    expect(pickChannelTally(shortlist, arms)).toBe('pool:1,q:1,cat:1,global:1,untagged:1');
  });

  it('prints zeros for channels with no arms and omits the untagged suffix when clean', () => {
    expect(pickChannelTally([{ phrase: 'a', channel: 'pool' }], [{ phrase: 'A' }])).toBe(
      'pool:1,q:0,cat:0,global:0',
    );
  });
});
