import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { SearchHistoryDropdown } from '@/components/search/SearchHistory';

const noop = () => {};

describe('SearchHistoryDropdown filtering (#search-dropdown-blocks-controls)', () => {
  const history = ['inspector general firings', 'federal workforce reduction'];

  it('shows all history when the query is empty', () => {
    render(
      <SearchHistoryDropdown
        history={history}
        onSelect={noop}
        onClear={noop}
        onClose={noop}
        showCurated={false}
        filter=""
      />,
    );
    expect(screen.getByText('inspector general firings')).toBeDefined();
    expect(screen.getByText('federal workforce reduction')).toBeDefined();
  });

  it('narrows to matching entries as the user types', () => {
    render(
      <SearchHistoryDropdown
        history={history}
        onSelect={noop}
        onClear={noop}
        onClose={noop}
        showCurated={false}
        filter="workforce"
      />,
    );
    expect(screen.queryByText('inspector general firings')).toBeNull();
    expect(screen.getByText('federal workforce reduction')).toBeDefined();
  });

  it('renders nothing for a novel query, freeing the controls underneath', () => {
    const { container } = render(
      <SearchHistoryDropdown
        history={history}
        onSelect={noop}
        onClear={noop}
        onClose={noop}
        showCurated
        filter="a question nobody has asked before xyzzy"
      />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('filters curated suggestions by the same query', () => {
    render(
      <SearchHistoryDropdown
        history={[]}
        onSelect={vi.fn()}
        onClear={noop}
        onClose={noop}
        showCurated
        filter="immigration"
      />,
    );
    expect(screen.getByText(/immigration enforcement/)).toBeDefined();
    expect(screen.queryByText(/executive orders has the administration issued/)).toBeNull();
  });
});
