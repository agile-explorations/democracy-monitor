import { describe, expect, it } from 'vitest';
import {
  distinctSpeakers,
  isMultiSpeaker,
  memberSurname,
  resolveGranuleSpeaker,
  resolveMember,
  speakerTurns,
} from '@/lib/services/crec-speakers';
import {
  ELECTIONS_FLATTENED,
  ELECTIONS_MEMBERS,
  ELECTIONS_STRUCTURED,
  GRASSLEY_FLATTENED,
  GRASSLEY_STRUCTURED,
  SINGLE_MEMBER,
} from '../../fixtures/crec-elections-granule';

describe('Record speaker turns (#927)', () => {
  it('finds every member and procedural turn in reading order, structured or flattened', () => {
    for (const text of [ELECTIONS_STRUCTURED, ELECTIONS_FLATTENED]) {
      const turns = speakerTurns(text);
      expect(turns.map((t) => t.marker)).toEqual([
        'The PRESIDING OFFICER.',
        'Mr. PADILLA.',
        'The PRESIDING OFFICER.',
        'Mr. PADILLA.',
        'Mr. MURPHY.',
        'Ms. CANTWELL.',
        'Mr. TUBERVILLE.',
      ]);
      expect(turns.map((t) => t.procedural)).toEqual([
        true,
        false,
        true,
        false,
        false,
        false,
        false,
      ]);
      expect(turns.every((t, i) => i === 0 || t.at > turns[i - 1].at)).toBe(true);
      expect(text.slice(turns[1].at, turns[1].at + 12)).toBe('Mr. PADILLA.');
    }
  });

  it('never reads "Mr. President." or "Madam President" as a turn, and handles two-word surnames and state disambiguators', () => {
    expect(speakerTurns('Mr. President, I rise today. Madam President, I yield.')).toEqual([]);
    const text =
      'Mr. VAN HOLLEN. Mr. President, I object. Ms. CORTEZ MASTO. I agree. Mr. BROWN of Ohio. So do I. The ACTING PRESIDENT pro tempore. The Senator will suspend.';
    expect(speakerTurns(text).map((t) => t.surname)).toEqual([
      'VAN HOLLEN',
      'CORTEZ MASTO',
      'BROWN',
      null,
    ]);
    expect(distinctSpeakers(text)).toEqual(['VAN HOLLEN', 'CORTEZ MASTO', 'BROWN']);
  });

  it('lists distinct members once, in first-appearance order', () => {
    expect(distinctSpeakers(ELECTIONS_FLATTENED)).toEqual([
      'PADILLA',
      'MURPHY',
      'CANTWELL',
      'TUBERVILLE',
    ]);
    expect(distinctSpeakers(GRASSLEY_FLATTENED)).toEqual(['GRASSLEY']);
    expect(distinctSpeakers('')).toEqual([]);
  });

  it('resolves a marker to the listed member by surname, or null when GovInfo omitted them', () => {
    expect(memberSurname('Durbin, Richard J.')).toBe('DURBIN');
    expect(memberSurname('Van Hollen, Chris')).toBe('VAN HOLLEN');
    expect(resolveMember('PADILLA', ELECTIONS_MEMBERS)?.memberName).toBe('Padilla, Alex');
    expect(resolveMember('cantwell', ELECTIONS_MEMBERS)?.state).toBe('WA');
    // Schumer opened the granule; GovInfo never listed him.
    expect(resolveMember('SCHUMER', ELECTIONS_MEMBERS)).toBeNull();
  });

  it('calls a granule multi-speaker on several listed members OR several markers in the text', () => {
    expect(isMultiSpeaker(ELECTIONS_FLATTENED, ELECTIONS_MEMBERS)).toBe(true);
    // GovInfo listed one member but two spoke
    expect(isMultiSpeaker(ELECTIONS_FLATTENED, SINGLE_MEMBER)).toBe(true);
    expect(isMultiSpeaker(GRASSLEY_STRUCTURED, SINGLE_MEMBER)).toBe(false);
    expect(isMultiSpeaker(GRASSLEY_FLATTENED, [])).toBe(false);
    // members alone decide when the text is missing
    expect(isMultiSpeaker('', ELECTIONS_MEMBERS)).toBe(true);
  });

  it('attributes a granule only to a lone speaker', () => {
    expect(resolveGranuleSpeaker(GRASSLEY_FLATTENED, SINGLE_MEMBER)).toEqual({
      speaker: 'Grassley, Chuck',
      ambiguous: false,
    });
    expect(resolveGranuleSpeaker(ELECTIONS_FLATTENED, ELECTIONS_MEMBERS)).toEqual({
      speaker: null,
      ambiguous: true,
    });
    expect(resolveGranuleSpeaker(null, [])).toEqual({ speaker: null, ambiguous: false });
    expect(resolveGranuleSpeaker(null, ELECTIONS_MEMBERS)).toEqual({
      speaker: null,
      ambiguous: true,
    });
  });
});
