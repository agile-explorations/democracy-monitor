import { render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import {
  APPARATUS_LINES,
  STOPS_CLOSE,
  STOPS_LEAD,
  STOPS_PROOFS,
  VISIBLE_THROUGH_A_LENS,
} from '@/lib/data/charter-copy';
import WhyThisMattersPage from '@/pages/why-this-matters';

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

/** The charter's apparatus inventory renders from the instrument's own
 *  constants (#812): if a category, baseline, reading, mechanism or model
 *  changes in code, this page changes with it — and "Nothing more" is gone. */
describe('/why-this-matters — the charter publishes its lens (#812)', () => {
  const text = () => render(<WhyThisMattersPage />).container.textContent ?? '';

  it('no longer claims to bring nothing', () => {
    const t = text();
    expect(t).not.toContain('Nothing more');
    expect(t).toContain(VISIBLE_THROUGH_A_LENS);
  });

  it('names the six things decided first and links the full inventory (owner: six lines, then the link)', () => {
    const { container } = render(<WhyThisMattersPage />);
    const t = container.textContent ?? '';
    for (const l of APPARATUS_LINES) expect(t).toContain(l.lead);
    // The tables (ids, stored names, model lists) live on /system/lens, not here.
    expect(t).not.toContain('claude-sonnet-4-5-20250929');
    expect(t).not.toContain('clearly_concerning');
    const hrefs = [...container.querySelectorAll('a')].map((a) => a.getAttribute('href'));
    expect(hrefs).toContain('/system/lens');
  });

  it('says why it stops at the record and where that claim is checkable', () => {
    const { container } = render(<WhyThisMattersPage />);
    const t = container.textContent ?? '';
    expect(t).toContain(STOPS_LEAD);
    expect(t).toContain(STOPS_CLOSE);
    for (const p of STOPS_PROOFS) expect(t).toContain(p.text);
    expect(t).toContain('is its own page');
    const hrefs = [...container.querySelectorAll('a')].map((a) => a.getAttribute('href'));
    expect(hrefs).toContain('/system/reversals');
    expect(hrefs).toContain('/system/lens');
    expect(hrefs).toContain('/system/methodology#reader-audit');
  });
});
