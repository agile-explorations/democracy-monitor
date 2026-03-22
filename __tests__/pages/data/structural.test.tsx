import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import StructuralDimensionsPage from '@/pages/data/structural';

vi.mock('next/head', () => ({
  default: function MockHead({ children }: { children: React.ReactNode }) {
    return <div>{children}</div>;
  },
}));

vi.mock('next/link', () => ({
  default: function MockLink({
    href,
    children,
    ...props
  }: {
    href: string;
    children: React.ReactNode;
  }) {
    return (
      <a href={href} {...props}>
        {children}
      </a>
    );
  },
}));

vi.mock('next/router', () => ({
  useRouter: () => ({ push: vi.fn(), asPath: '/data/structural' }),
}));

vi.mock('@/lib/contexts/ThemeContext', () => ({
  useTheme: () => ({ resolvedMode: 'light' }),
}));

beforeEach(() => {
  vi.spyOn(global, 'fetch').mockResolvedValue({
    ok: true,
    json: async () => ({ rows: [] }),
  } as Response);
});

describe('StructuralDimensionsPage', () => {
  it('renders the page heading', () => {
    render(<StructuralDimensionsPage />);
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Structural Dimensions');
  });

  it('renders back link to data page', () => {
    render(<StructuralDimensionsPage />);
    const backLink = screen.getByText(/Back to data/);
    expect(backLink.closest('a')?.getAttribute('href')).toBe('/data');
  });

  it('renders explanatory sections', () => {
    render(<StructuralDimensionsPage />);
    expect(screen.getByText('What this shows')).toBeDefined();
    expect(screen.getByText('How to read the heatmap')).toBeDefined();
    expect(screen.getByText('Dimensions')).toBeDefined();
    expect(screen.getByText('Baseline')).toBeDefined();
  });
});
