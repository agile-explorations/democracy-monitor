import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SearchProgressStages } from '@/components/search/SearchProgressStages';

describe('SearchProgressStages (#723)', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('starts on the first stage with an elapsed counter', () => {
    render(<SearchProgressStages />);
    expect(screen.getByText(/Expanding your question/)).toBeTruthy();
    expect(screen.getByText(/0s elapsed/)).toBeTruthy();
    expect(screen.queryByText(/semantic vectors/)).toBeNull();
  });

  it('advances through stages as time passes, keeping past stages checked', () => {
    render(<SearchProgressStages />);
    act(() => {
      vi.advanceTimersByTime(10_000);
    });
    // Stages at 0s, 3s, and 9s are all visible; the 9s stage is current.
    expect(screen.getByText(/Expanding your question/)).toBeTruthy();
    expect(screen.getByText(/semantic vectors/)).toBeTruthy();
    expect(screen.getByText(/Fusing and ranking candidates/)).toBeTruthy();
    expect(screen.queryByText(/Still working/)).toBeNull();
    expect(screen.getByText(/10s elapsed/)).toBeTruthy();
  });

  it('reaches the long-wait stage after 26s', () => {
    render(<SearchProgressStages />);
    act(() => {
      vi.advanceTimersByTime(27_000);
    });
    expect(screen.getByText(/Still working/)).toBeTruthy();
  });
});
