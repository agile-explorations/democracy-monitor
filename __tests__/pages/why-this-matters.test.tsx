import { render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { PASS2_PROMPT_VERSION } from '@/lib/ai/prompts/document-review-pass2';
import { ASSESSMENT_LABELS, EROSION_TYPE_LABELS } from '@/lib/data/assessment-labels';
import { BASELINE_CONFIGS } from '@/lib/data/baselines';
import { CATEGORIES } from '@/lib/data/categories';
import {
  STOPS_CLOSE,
  STOPS_LEAD,
  STOPS_PROOFS,
  VISIBLE_THROUGH_A_LENS,
} from '@/lib/data/charter-copy';
import { MODEL_ROLES } from '@/lib/data/model-roster';
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

  it('lists every category, baseline, reading, mechanism and model the instrument uses', () => {
    const t = text();
    for (const c of CATEGORIES) expect(t).toContain(c.title);
    for (const b of BASELINE_CONFIGS) expect(t).toContain(b.label);
    for (const label of Object.values(ASSESSMENT_LABELS)) expect(t).toContain(label);
    for (const label of Object.values(EROSION_TYPE_LABELS)) expect(t).toContain(label);
    for (const m of MODEL_ROLES) expect(t).toContain(m.id);
    expect(t).toContain('clearly_concerning');
    expect(t).toContain('erosion_type');
    expect(t).toContain(PASS2_PROMPT_VERSION);
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
    expect(hrefs.some((h) => h?.includes('document-review-pass2.ts'))).toBe(true);
  });
});
