import { render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { COMMON_QUESTIONS } from '@/lib/data/why-this-matters';
import QuestionsPage from '@/pages/questions';

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

/** The FAQ on its own page (R-CHARTER-2, #821): every question keeps its
 *  stable anchor id, and the dated era percentages (guidance §1.1) survive. */
describe('/questions — the FAQ, findable (#821)', () => {
  it('renders every common question under its stable anchor id', () => {
    const { container } = render(<QuestionsPage />);
    const t = container.textContent ?? '';
    for (const q of COMMON_QUESTIONS) {
      expect(t).toContain(q.question);
      expect(container.querySelector(`#${q.id}`)).not.toBeNull();
    }
  });

  it('keeps the dated era rates in the every-president and trust answers', () => {
    const t = render(<QuestionsPage />).container.textContent ?? '';
    expect(t).toContain('69%');
    expect(t).toContain('87%');
    expect(t).toContain('30%');
    expect(t).toContain('as of August 2026');
  });

  it('links the charter, the norms, and the feedback ask', () => {
    const { container } = render(<QuestionsPage />);
    const hrefs = [...container.querySelectorAll('a')].map((a) => a.getAttribute('href'));
    expect(hrefs).toContain('/charter');
    expect(hrefs).toContain('/norms');
    expect(hrefs).toContain('/feedback?type=question');
  });
});
