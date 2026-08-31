import { render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { SELF_TESTS_HEADING, SELF_TESTS_INTRO } from '@/lib/data/charter-copy';
import SelfTestsPage from '@/pages/system/self-tests';

vi.mock('next/head', () => ({
  default: ({ children }: { children: React.ReactNode }) => children,
}));
vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

/** The self-tests on their own page (R-CHARTER-2, #822): era rates, swap
 *  audit, reader audit — with the anchors the charter's conduct list uses. */
describe('/system/self-tests — what happens when we test ourselves (#822)', () => {
  it('opens with the owner-verbatim heading and intro', () => {
    const t = render(<SelfTestsPage />).container.textContent ?? '';
    expect(t).toContain(SELF_TESTS_HEADING);
    expect(t).toContain(SELF_TESTS_INTRO);
  });

  it('keeps the swap-audit numbers and the three linkable sections', () => {
    const { container } = render(<SelfTestsPage />);
    const t = container.textContent ?? '';
    expect(t).toContain('11.6%');
    expect(t).toContain('4.2%');
    expect(t).toContain('Read by people who are not us');
    for (const id of ['era-rates', 'swap-audit', 'reader-audit']) {
      expect(container.querySelector(`#${id}`)).not.toBeNull();
    }
  });
});
