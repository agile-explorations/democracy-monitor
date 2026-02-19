import { render } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { StatusPill } from '@/components/ui/StatusPill';
import type { StatusLevel } from '@/lib/types';

const LEVELS: StatusLevel[] = ['Stable', 'Warning', 'Drift', 'Capture'];

describe('StatusPill', () => {
  it.each(LEVELS)('renders %s level with text label', (level) => {
    const { getByRole } = render(<StatusPill level={level} />);
    const pill = getByRole('status');
    expect(pill.textContent).toContain(level);
  });

  it.each(LEVELS)('renders %s level with aria-label', (level) => {
    const { getByRole } = render(<StatusPill level={level} />);
    const pill = getByRole('status');
    expect(pill.getAttribute('aria-label')).toContain(level);
  });

  it.each(LEVELS)('renders %s level with tooltip', (level) => {
    const { getByRole } = render(<StatusPill level={level} />);
    const pill = getByRole('status');
    expect(pill.getAttribute('title')).toBeTruthy();
  });

  it.each([
    ['Stable', '\u2014'],
    ['Warning', '\u25B3'],
    ['Drift', '\u25B2'],
    ['Capture', '\u25C6'],
  ] as const)('renders correct icon for %s', (level, icon) => {
    const { getByRole } = render(<StatusPill level={level} />);
    const pill = getByRole('status');
    expect(pill.textContent).toContain(icon);
  });
});
