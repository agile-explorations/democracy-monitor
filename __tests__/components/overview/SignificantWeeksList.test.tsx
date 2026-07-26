import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { SignificantWeeksList } from '@/components/overview/SignificantWeeksList';

describe('SignificantWeeksList', () => {
  it("shows each week's Concern Score so significance is anchored to the chart", () => {
    render(
      <SignificantWeeksList
        weeks={[
          {
            weekOf: '2025-04-28',
            reasons: [{ type: 'peak_concern', detail: 'Peak concern: 12 of 14 categories' }],
            headline: null,
            rank: 1,
            concernScore: 26,
          },
        ]}
      />,
    );
    expect(screen.getByText(/Concern Score 26/)).toBeDefined();
  });

  it('omits the score when unavailable', () => {
    render(
      <SignificantWeeksList
        weeks={[
          {
            weekOf: '2025-04-28',
            reasons: [{ type: 'peak_concern', detail: 'Peak' }],
            headline: null,
            rank: 1,
            concernScore: null,
          },
        ]}
      />,
    );
    expect(screen.queryByText(/Concern Score/)).toBeNull();
  });
});
