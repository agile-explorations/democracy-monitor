import { render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import {
  APPARATUS_LINES,
  CATCH_BULLETS,
  STOPS_KEEPING,
  STOPS_WHY,
  VISIBLE_THROUGH_A_LENS,
} from '@/lib/data/charter-copy';
import { READER_INVITE_HREF } from '@/lib/data/reader-audits';
import CharterPage from '@/pages/charter';

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

/** The charter on its own page (R-CHARTER-2, #820): the apparatus inventory
 *  renders from the instrument's own constants (#812) and the conduct list
 *  points at the pages where each claim is checkable. */
describe('/charter — the quotable page (#820)', () => {
  it('publishes the lens and does not claim to bring nothing', () => {
    const t = render(<CharterPage />).container.textContent ?? '';
    expect(t).not.toContain('Nothing more');
    expect(t).toContain(VISIBLE_THROUGH_A_LENS);
  });

  it('names the six things decided first and links the norms and the full inventory', () => {
    const { container } = render(<CharterPage />);
    const t = container.textContent ?? '';
    for (const l of APPARATUS_LINES) expect(t).toContain(l.lead);
    // The tables (ids, stored names, model lists) live on /system/lens, not here.
    expect(t).not.toContain('claude-sonnet-4-5-20250929');
    expect(t).not.toContain('clearly_concerning');
    const hrefs = [...container.querySelectorAll('a')].map((a) => a.getAttribute('href'));
    expect(hrefs).toContain('/system/lens');
    expect(hrefs).toContain('/norms');
  });

  it('says why it stops at the record and where that claim is checkable', () => {
    const { container } = render(<CharterPage />);
    const t = container.textContent ?? '';
    expect(t).toContain(STOPS_WHY);
    expect(t).toContain(STOPS_KEEPING);
    for (const b of CATCH_BULLETS) expect(t).toContain(b.text);
    expect(t).toContain('is its own page');
    expect(t).not.toContain('One commitment above the rest');
    expect(t).not.toContain('two-party baseline');
    expect(t).not.toContain('What erosion looks like');
    const hrefs = [...container.querySelectorAll('a')].map((a) => a.getAttribute('href'));
    expect(hrefs).toContain('/system/reversals');
    expect(hrefs).toContain('/system/self-tests#swap-audit');
    expect(hrefs).toContain('/system/self-tests#era-rates');
    expect(hrefs).toContain('/system/methodology#limitations');
    expect(hrefs).toContain(READER_INVITE_HREF);
  });
});
