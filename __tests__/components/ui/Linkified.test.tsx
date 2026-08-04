import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Linkified } from '@/components/ui/Linkified';

describe('Linkified', () => {
  it('renders an http(s) URL as an anchor opening in a new tab with noopener', () => {
    const { container } = render(<Linkified text="see https://example.com now" />);
    const a = container.querySelector('a');
    expect(a?.getAttribute('href')).toBe('https://example.com');
    expect(a?.getAttribute('target')).toBe('_blank');
    expect(a?.getAttribute('rel')).toBe('noopener noreferrer');
    expect(container.textContent).toBe('see https://example.com now');
  });

  it('renders multiple links', () => {
    const { container } = render(<Linkified text="https://one.com and https://two.com" />);
    expect(container.querySelectorAll('a')).toHaveLength(2);
  });

  // Security: an unsafe scheme is never turned into a link, and no markup is injected.
  it('does not create an anchor for a javascript: scheme', () => {
    const { container } = render(<Linkified text="javascript:alert(1)" />);
    expect(container.querySelector('a')).toBeNull();
    expect(container.textContent).toBe('javascript:alert(1)');
  });

  it('renders raw HTML in the text as inert text, not markup', () => {
    const { container } = render(<Linkified text="<img src=x onerror=alert(1)>" />);
    expect(container.querySelector('img')).toBeNull();
    expect(container.textContent).toBe('<img src=x onerror=alert(1)>');
  });
});
