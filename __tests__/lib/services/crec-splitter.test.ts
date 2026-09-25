import { describe, expect, it } from 'vitest';
import {
  MIN_UNIT_CHARS,
  isMultiUnitGranule,
  qualifiesComposite,
  splitComposite,
  splitStructuredGranule,
  splitUnitBySpeaker,
} from '@/lib/services/crec-splitter';
import {
  ELECTIONS_MEMBERS,
  ELECTIONS_STRUCTURED,
  GRASSLEY_STRUCTURED,
  SINGLE_MEMBER,
  TWO_TOPIC_MEMBERS,
  TWO_TOPIC_STRUCTURED,
} from '../../fixtures/crec-elections-granule';

describe('CREC topic splitter (#704) — regression on the real granule shape', () => {
  it('reads ALL-CAPS heading lines of two or more words — and so drops a one-word heading and everything before the first real one', () => {
    const units = splitStructuredGranule(TWO_TOPIC_STRUCTURED);
    // "ELECTIONS" is one word: not a heading line. The whole debate before the
    // nomination heading is invisible to the topic splitter (the #929 finding).
    expect(units.map((u) => u.heading)).toEqual(['NOMINATION OF JOHN DOE']);
    expect(units[0].text.startsWith('NOMINATION OF JOHN DOE\nMr. GRASSLEY.')).toBe(true);
    expect(isMultiUnitGranule(units)).toBe(false);
    expect(splitStructuredGranule(ELECTIONS_STRUCTURED)).toEqual([]);
  });

  it('returns no units for text without a heading line — the composite split falls back to one', () => {
    expect(splitStructuredGranule('Mr. PADILLA. Madam President, a short remark.')).toEqual([]);
  });
});

describe('composite topic × speaker split (#929)', () => {
  it('cuts a one-topic, six-senator granule into speaker children with stable suffixes', () => {
    const leaves = splitComposite(ELECTIONS_STRUCTURED, ELECTIONS_MEMBERS, 'ELECTIONS');
    expect(qualifiesComposite(leaves)).toBe(true);
    expect(leaves.map((l) => l.suffix)).toEqual([
      '#frag-1-s1',
      '#frag-1-s2',
      '#frag-1-s3',
      '#frag-1-s4',
    ]);
    expect(leaves.every((l) => l.splitBySpeaker && l.topicIndex === 1)).toBe(true);
    expect(leaves.every((l) => l.topicHeading === 'ELECTIONS')).toBe(true);
    // Schumer opens the granule with no marker and GovInfo never listed him:
    // the opening stays honest — no speaker, the bare topic heading.
    expect(leaves[0].speaker).toBeNull();
    expect(leaves[0].speakerSurname).toBeUndefined();
    expect(leaves[0].heading).toBe('ELECTIONS');
    expect(leaves[0].text).toContain('Senator Padilla and I are revealing');
    // Padilla's two turns (a quorum motion, then the speech) are one unit.
    expect(leaves[1]).toMatchObject({
      heading: 'ELECTIONS — Padilla',
      speakerSurname: 'PADILLA',
      speaker: expect.objectContaining({ memberName: 'Padilla, Alex', state: 'CA' }),
    });
    expect(leaves[1].text).toContain('quorum call be rescinded');
    expect(leaves[1].text).toContain('Unlawful Voter Initiative');
    expect(leaves[1].text).toContain('The PRESIDING OFFICER. Without objection');
    expect(leaves[2].heading).toBe('ELECTIONS — Murphy');
    expect(leaves[3].heading).toBe('ELECTIONS — Cantwell');
    // Tuberville's short procedural request merges into the previous speech
    expect(leaves[3].text).toContain('Mr. TUBERVILLE.');
    expect(leaves.every((l) => l.text.length >= MIN_UNIT_CHARS)).toBe(true);
  });

  it('recovers the text before the first heading as unit 0, keeps a single-speaker topic as a plain #frag-N, and numbers headings the V1 way', () => {
    const leaves = splitComposite(TWO_TOPIC_STRUCTURED, TWO_TOPIC_MEMBERS, 'ELECTIONS');
    expect(leaves.map((l) => l.suffix)).toEqual([
      '#frag-0-s1',
      '#frag-0-s2',
      '#frag-0-s3',
      '#frag-0-s4',
      '#frag-1',
    ]);
    expect(leaves[0].topicHeading).toBe('ELECTIONS');
    expect(leaves[1].heading).toBe('ELECTIONS — Padilla');
    // the heading unit keeps the number V1 gave it, so a stored '#frag-1' still matches
    const nomination = leaves[4];
    expect(nomination).toMatchObject({
      heading: 'NOMINATION OF JOHN DOE',
      topicIndex: 1,
      splitBySpeaker: false,
    });
    expect(nomination.speaker).toBeUndefined();
    expect(nomination.speakerIndex).toBeUndefined();
    expect(Object.keys(nomination)).not.toContain('index');
  });

  it('leaves a one-topic, one-speaker granule alone — a single leaf never qualifies', () => {
    const leaves = splitComposite(GRASSLEY_STRUCTURED, SINGLE_MEMBER, 'NOMINATION OF JOHN DOE');
    expect(leaves).toHaveLength(1);
    expect(leaves[0]).toMatchObject({ suffix: '#frag-1', splitBySpeaker: false });
    expect(qualifiesComposite(leaves)).toBe(false);
  });

  it('attributes the opening segment to the one listed member no marker claims', () => {
    const text = [
      'THE BUDGET',
      `Mr. President, I rise to open the debate on the budget resolution. ${'The chair recognizes the seriousness of the matter. '.repeat(10)}`,
      `Mr. MURPHY. Mr. President, I thank the chairman for yielding. ${'The budget before us does three things that deserve scrutiny. '.repeat(9)}`,
    ].join('\n');
    const members = [
      { memberName: 'Graham, Lindsey', party: 'R', state: 'SC' },
      { memberName: 'Murphy, Christopher', party: 'D', state: 'CT' },
    ];
    const leaves = splitComposite(text, members, 'THE BUDGET');
    expect(leaves).toHaveLength(2);
    expect(leaves[0]).toMatchObject({
      heading: 'THE BUDGET — Graham',
      speaker: expect.objectContaining({ memberName: 'Graham, Lindsey' }),
    });
    expect(leaves[1].heading).toBe('THE BUDGET — Murphy');
  });

  it('uses the fallback heading when the granule has no heading line, and does not split one speaker', () => {
    const [unit] = splitComposite(
      'Mr. PADILLA. Madam President, a remark. '.repeat(30),
      ELECTIONS_MEMBERS.slice(0, 1),
      'Whistleblower Disclosure (Executive Session)',
    );
    expect(unit.heading).toBe('Whistleblower Disclosure (Executive Session)');
    expect(unit.suffix).toBe('#frag-1');
    expect(splitUnitBySpeaker(unit, ELECTIONS_MEMBERS)).toHaveLength(1);
  });

  it('marks a member the Record names but GovInfo omitted as unresolved, keeping the surname', () => {
    const text = [
      'ELECTIONS',
      `Mr. SCHUMER. Madam President, on the whistleblower. ${'This is a serious allegation and the Senate must act. '.repeat(10)}`,
      `Mr. PADILLA. Madam President, I concur. ${'I received the disclosure last week and reviewed it carefully. '.repeat(9)}`,
    ].join('\n');
    const leaves = splitComposite(text, ELECTIONS_MEMBERS.slice(0, 1), 'ELECTIONS');
    expect(leaves.map((l) => l.heading)).toEqual(['ELECTIONS — Schumer', 'ELECTIONS — Padilla']);
    expect(leaves[0]).toMatchObject({ speakerSurname: 'SCHUMER', speaker: null });
    expect(leaves[1].speaker?.memberName).toBe('Padilla, Alex');
  });
});
