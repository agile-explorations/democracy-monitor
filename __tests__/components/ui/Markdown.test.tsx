import { render } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { Markdown } from '@/components/ui/Markdown';

describe('Markdown', () => {
  it('renders links with target="_blank" and noopener noreferrer', () => {
    const { container } = render(<Markdown>{'[Example](https://example.com)'}</Markdown>);
    const link = container.querySelector('a');
    expect(link).not.toBeNull();
    expect(link!.getAttribute('href')).toBe('https://example.com');
    expect(link!.getAttribute('target')).toBe('_blank');
    expect(link!.getAttribute('rel')).toBe('noopener noreferrer');
    expect(link!.textContent).toBe('Example');
  });

  it('applies dm-accent styling to links', () => {
    const { container } = render(<Markdown>{'[Styled link](https://example.com)'}</Markdown>);
    const link = container.querySelector('a');
    expect(link!.className).toContain('text-dm-accent');
    expect(link!.className).toContain('hover:underline');
  });
});
