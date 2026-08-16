import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { SearchTips } from '@/components/search/SearchTips';

describe('SearchTips', () => {
  it('shows question-writing tips in research mode', () => {
    render(<SearchTips mode="research" />);
    expect(screen.getByText('Tips for questions that get good results')).toBeTruthy();
    expect(screen.getByText(/administrations you want compared/)).toBeTruthy();
    expect(screen.getByText(/Quote verification/)).toBeTruthy();
  });

  it('shows keyword-and-filter tips in explore mode', () => {
    render(<SearchTips mode="explore" />);
    expect(screen.getByText('Tips for exploring the document library')).toBeTruthy();
    expect(screen.getByText(/Short phrases work best/)).toBeTruthy();
    expect(screen.getByText(/Narrow with the filters below/)).toBeTruthy();
  });

  it('omits research-only features from explore tips', () => {
    render(<SearchTips mode="explore" />);
    expect(screen.queryByText(/Quote verification/)).toBeNull();
    expect(screen.queryByText(/administrations you want compared/)).toBeNull();
    expect(screen.queryByText(/set the date range automatically/)).toBeNull();
  });
});
