import { describe, it, expect } from 'vitest';
import { buildPass1Prompt, PASS1_SYSTEM_PROMPT } from '@/lib/ai/prompts/document-review-pass1';

describe('PASS1_SYSTEM_PROMPT', () => {
  it('instructs conservative flagging', () => {
    expect(PASS1_SYSTEM_PROMPT).toContain('not routine administrative activity');
  });
});

describe('buildPass1Prompt', () => {
  const base = {
    title: 'Notice of Proposed Rulemaking',
    summary: 'Agency proposes changes to enforcement procedures',
    docType: 'Rule',
    agency: 'Department of Justice',
    pubDate: '2026-01-15',
    categoryDescription: 'Tracks federal law enforcement politicization',
  };

  it('includes erosion type framework definitions', () => {
    const prompt = buildPass1Prompt(
      base.title,
      base.summary,
      base.docType,
      base.agency,
      base.pubDate,
      base.categoryDescription,
    );

    expect(prompt).toContain('Erosion type framework:');
    expect(prompt).toContain(
      'formal_override: explicit legal/policy changes that remove protections',
    );
    expect(prompt).toContain('operational_hollowing: staffing cuts, budget reductions');
    expect(prompt).toContain('noncompliance_refusal: ignoring court orders');
    expect(prompt).toContain('routine: normal administrative activity with no erosion signal');
    expect(prompt).toContain('unclear: insufficient information to classify');
  });

  it('includes category description', () => {
    const prompt = buildPass1Prompt(
      base.title,
      base.summary,
      base.docType,
      base.agency,
      base.pubDate,
      base.categoryDescription,
    );

    expect(prompt).toContain(`Category concern: ${base.categoryDescription}`);
  });

  it('includes all provided document metadata', () => {
    const prompt = buildPass1Prompt(
      base.title,
      base.summary,
      base.docType,
      base.agency,
      base.pubDate,
      base.categoryDescription,
    );

    expect(prompt).toContain(`Title: ${base.title}`);
    expect(prompt).toContain(`Type: ${base.docType}`);
    expect(prompt).toContain(`Agency: ${base.agency}`);
    expect(prompt).toContain(`Published: ${base.pubDate}`);
    expect(prompt).toContain(base.summary);
  });

  it('omits optional fields when undefined', () => {
    const prompt = buildPass1Prompt(
      base.title,
      undefined,
      '',
      undefined,
      undefined,
      base.categoryDescription,
    );

    expect(prompt).toContain(`Title: ${base.title}`);
    expect(prompt).not.toContain('Type:');
    expect(prompt).not.toContain('Agency:');
    expect(prompt).not.toContain('Published:');
    expect(prompt).not.toContain('Summary:');
  });

  it('truncates summary to 1000 characters', () => {
    const longSummary = 'x'.repeat(2000);
    const prompt = buildPass1Prompt(
      base.title,
      longSummary,
      base.docType,
      base.agency,
      base.pubDate,
      base.categoryDescription,
    );

    // The summary in the prompt should be at most 1000 chars of the original
    expect(prompt).toContain('x'.repeat(1000));
    expect(prompt).not.toContain('x'.repeat(1001));
  });

  it('includes JSON response schema with erosionType enum', () => {
    const prompt = buildPass1Prompt(
      base.title,
      base.summary,
      base.docType,
      base.agency,
      base.pubDate,
      base.categoryDescription,
    );

    expect(prompt).toContain('"relevant": boolean');
    expect(prompt).toContain('"confidence": number');
    expect(prompt).toContain('"signals": string[]');
    expect(prompt).toContain('"erosionType"');
  });
});
