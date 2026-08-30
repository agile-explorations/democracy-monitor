import { render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { PASS1_PROMPT_VERSION } from '@/lib/ai/prompts/document-review-pass1';
import { PASS2_PROMPT_VERSION } from '@/lib/ai/prompts/document-review-pass2';
import { ASSESSMENT_LABELS, EROSION_TYPE_LABELS } from '@/lib/data/assessment-labels';
import { BASELINE_CONFIGS } from '@/lib/data/baselines';
import { CATEGORIES } from '@/lib/data/categories';
import { CONCERN_LEVEL_LABELS } from '@/lib/data/concern-level-explanations';
import { MODEL_ROLES } from '@/lib/data/model-roster';
import LensPage from '@/pages/system/lens';

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

describe('/system/lens — the full apparatus inventory (#812)', () => {
  it('renders every category, baseline, reading, mechanism, status, model and prompt version from code', () => {
    const t = render(<LensPage />).container.textContent ?? '';
    for (const c of CATEGORIES) expect(t).toContain(c.title);
    for (const b of BASELINE_CONFIGS) {
      expect(t).toContain(b.label);
      expect(t).toContain(b.id);
    }
    for (const [stored, shown] of Object.entries(ASSESSMENT_LABELS)) {
      expect(t).toContain(shown);
      expect(t).toContain(stored);
    }
    for (const [stored, shown] of Object.entries(EROSION_TYPE_LABELS)) {
      expect(t).toContain(shown);
      expect(t).toContain(stored);
    }
    for (const [stored, shown] of Object.entries(CONCERN_LEVEL_LABELS)) {
      expect(t).toContain(shown);
      expect(t).toContain(stored);
    }
    for (const m of MODEL_ROLES) expect(t).toContain(m.id);
    expect(t).toContain(PASS1_PROMPT_VERSION);
    expect(t).toContain(PASS2_PROMPT_VERSION);
  });
});
