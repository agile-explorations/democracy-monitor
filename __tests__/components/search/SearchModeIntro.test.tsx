import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { SearchModeIntro } from '@/components/search/SearchModeIntro';

describe('SearchModeIntro', () => {
  it('explains the difference between Research and Explore', () => {
    render(<SearchModeIntro />);
    expect(screen.getByText('Research')).toBeTruthy();
    expect(screen.getByText('Explore')).toBeTruthy();
    expect(screen.getByText(/sourced summary with verified quotes/)).toBeTruthy();
    expect(screen.getByText(/direct document search/)).toBeTruthy();
  });

  it('links to the data-source inventory and the feedback page', () => {
    render(<SearchModeIntro />);
    const sources = screen.getByRole('link', { name: /What sources do we index/ });
    expect(sources.getAttribute('href')).toBe('/system/methodology#data-sources');
    const suggest = screen.getByRole('link', { name: /Suggest a data source/ });
    expect(suggest.getAttribute('href')).toBe('/feedback');
  });

  it('mentions that new sources are continually added', () => {
    render(<SearchModeIntro />);
    expect(screen.getByText(/continually adding new ones/)).toBeTruthy();
  });
});
