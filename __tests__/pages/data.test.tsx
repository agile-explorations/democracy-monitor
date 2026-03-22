import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import DataPage from '@/pages/data';

// Mock Next.js modules
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

describe('DataPage', () => {
  it('renders the page heading', () => {
    render(<DataPage />);
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Data');
  });

  it('renders CSV download links', () => {
    render(<DataPage />);
    const links = screen.getAllByText('Download CSV');
    expect(links).toHaveLength(2);
    expect(links[0].closest('a')?.getAttribute('href')).toBe('/api/export/weekly?format=csv');
    expect(links[1].closest('a')?.getAttribute('href')).toBe('/api/export/scores?format=csv');
  });

  it('renders API documentation section', () => {
    render(<DataPage />);
    expect(screen.getByText('API Endpoints')).toBeDefined();
    expect(screen.getByText('/api/export/weekly')).toBeDefined();
    expect(screen.getByText('/api/export/scores')).toBeDefined();
  });

  it('renders CSV column reference section', () => {
    render(<DataPage />);
    expect(screen.getByText('CSV Column Reference')).toBeDefined();
  });

  it('renders full database section', () => {
    render(<DataPage />);
    expect(screen.getByText('Full Database')).toBeDefined();
    expect(screen.getByText('Key tables for researchers')).toBeDefined();
  });
});
