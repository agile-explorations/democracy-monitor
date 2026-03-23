import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import ThematicDriftPage from '@/pages/data/thematic';

vi.mock('next/router', () => ({
  useRouter: () => ({ asPath: '/data/thematic', push: vi.fn() }),
}));

vi.mock('@/lib/contexts/ThemeContext', () => ({
  useTheme: () => ({ resolvedMode: 'light' }),
}));

describe('ThematicDriftPage', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ rows: [] }),
      }),
    );
  });

  it('renders page title', () => {
    render(<ThematicDriftPage />);
    expect(screen.getByText('Thematic Drift')).toBeDefined();
  });

  it('renders back-to-data link', () => {
    render(<ThematicDriftPage />);
    const link = screen.getByText(/Back to data/);
    expect(link.closest('a')?.getAttribute('href')).toBe('/data');
  });

  it('renders methodology sections', () => {
    render(<ThematicDriftPage />);
    expect(screen.getByText('What this shows')).toBeDefined();
    expect(screen.getByText('How to read the heatmap')).toBeDefined();
    expect(screen.getByText('Metrics')).toBeDefined();
    expect(screen.getByText('Methodology')).toBeDefined();
  });

  it('shows loading state initially', () => {
    render(<ThematicDriftPage />);
    expect(screen.getByText('Loading thematic data...')).toBeDefined();
  });
});
