import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { MatchSnippet, phraseRegex } from '@/components/search/MatchSnippet';

function markedText(container: HTMLElement): string[] {
  return Array.from(container.querySelectorAll('mark')).map((m) => m.textContent ?? '');
}

describe('MatchSnippet phrase highlighting (#728)', () => {
  it('highlights only full phrase occurrences, not word-level marker debris', () => {
    // ts_headline marks every stem-match ("schedules", bare "F", "Schedule" A/B)
    const snippet =
      '[[F]], which [[schedules]] shall constitute parts, as follows: [[Schedule]] A. ' +
      'petition the Director to place in [[Schedule]] [[F]] any such service, [[Schedule]] B';
    const { container } = render(<MatchSnippet snippet={snippet} alias="Schedule F" />);
    expect(markedText(container)).toEqual(['Schedule F']);
    expect(screen.getByText(/which schedules shall/)).toBeTruthy(); // debris unmarked but present
  });

  it('tolerates flexible gaps and case inside the phrase', () => {
    const { container } = render(
      <MatchSnippet
        snippet="placed in SCHEDULE  F and also schedule-f status"
        alias="Schedule F"
      />,
    );
    expect(markedText(container)).toEqual(['SCHEDULE  F', 'schedule-f']);
  });

  it('escapes regex metacharacters in aliases like 287(g)', () => {
    const { container } = render(
      <MatchSnippet snippet="under the 287(g) program" alias="287(g)" />,
    );
    expect(markedText(container)).toEqual(['287(g)']);
  });

  it('falls back to marker-level rendering when no phrase is known', () => {
    const { container } = render(<MatchSnippet snippet="a [[word]] match" />);
    expect(markedText(container)).toEqual(['word']);
  });
});

describe('phraseRegex', () => {
  it('does not match a partial phrase', () => {
    expect('Schedule A positions'.match(phraseRegex('Schedule F'))).toBeNull();
  });
});
