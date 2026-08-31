import { render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { VISIBLE_THROUGH_A_LENS } from '@/lib/data/charter-copy';
import { COMMON_QUESTIONS, WHY_PILLARS } from '@/lib/data/why-this-matters';
import NormsPage from '@/pages/norms';

/** The router mock records navigations as output state, so the forwarder is
 *  tested by what it produces (a navigation list), not how it was called. */
const { navigations } = vi.hoisted(() => ({ navigations: [] as string[] }));

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
vi.mock('next/router', () => ({
  useRouter: () => ({ replace: (url: string) => navigations.push(url) }),
}));

/** The pillars keep the page (R-CHARTER-2, #820): the charter and FAQ moved
 *  out; the hash forwarder finishes trips that the 301 from
 *  /why-this-matters started, because fragments never reach the server. */
describe('/norms — the six pillars and their history (#820)', () => {
  afterEach(() => {
    navigations.length = 0;
    window.location.hash = '';
  });

  it('renders every pillar with a labeled precedent paragraph and links the charter', () => {
    const { container } = render(<NormsPage />);
    const t = container.textContent ?? '';
    for (const p of WHY_PILLARS) expect(t).toContain(p.question);
    expect((t.match(/Precedent: /g) ?? []).length).toBe(WHY_PILLARS.length);
    const hrefs = [...container.querySelectorAll('a')].map((a) => a.getAttribute('href'));
    expect(hrefs).toContain('/charter');
    expect(hrefs).toContain('/questions');
    expect(hrefs).toContain('/system/self-tests#era-rates');
  });

  it('no longer carries the charter or the FAQ', () => {
    const t = render(<NormsPage />).container.textContent ?? '';
    expect(t).not.toContain(VISIBLE_THROUGH_A_LENS);
    expect(t).not.toContain(COMMON_QUESTIONS[0].question);
  });

  it('forwards pre-split charter and FAQ anchors, and keeps pillar anchors', () => {
    window.location.hash = '#charter';
    render(<NormsPage />);
    expect(navigations).toEqual(['/charter#charter']);

    navigations.length = 0;
    window.location.hash = '#efficiency';
    render(<NormsPage />);
    expect(navigations).toEqual(['/questions#efficiency']);

    navigations.length = 0;
    window.location.hash = '#watchers';
    render(<NormsPage />);
    expect(navigations).toEqual([]);
  });
});
