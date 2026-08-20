import { readFileSync } from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';
import {
  ANALYTICAL_MAX_TOKENS,
  budgetForQuestion,
  classifyQuestionMode,
  ENUMERATION_CONTEXT_DOCS,
  ENUMERATION_MAX_TOKENS,
  RESEARCH_CONTEXT_DOCS_ANALYTICAL,
} from '@/lib/services/question-classifier';

describe('classifyQuestionMode', () => {
  it('classifies every completeness-eval question as enumeration', () => {
    // The eval is the acceptance gate for enumeration mode (#751): a
    // question silently falling to the analytical path gets a 30-doc budget
    // and fails its coverage checklist without any error surfacing.
    const checklist = JSON.parse(
      readFileSync(path.join(process.cwd(), 'scripts/completeness-checklists.json'), 'utf8'),
    ) as { questions: Array<{ id: string; q: string }> };
    for (const q of checklist.questions) {
      expect(classifyQuestionMode(q.q), q.id).toBe('enumeration');
    }
  });

  it('classifies what/which + document species as enumeration', () => {
    expect(classifyQuestionMode('What executive orders address collective bargaining?')).toBe(
      'enumeration',
    );
    expect(classifyQuestionMode('Which court rulings struck down agency actions?')).toBe(
      'enumeration',
    );
  });

  it('classifies coverage verbs as enumeration', () => {
    expect(classifyQuestionMode('Which members of Congress have spoken about Schedule F?')).toBe(
      'enumeration',
    );
  });

  it('classifies era-comparative species questions as enumeration', () => {
    expect(
      classifyQuestionMode(
        'How did congressional responses to Schedule F compare between the first and second Trump administrations?',
      ),
    ).toBe('enumeration');
  });

  it('keeps analytical questions analytical', () => {
    for (const q of [
      'Why did the administration remove inspectors general?',
      'How does Schedule F affect civil service protections?',
      'Is the impoundment of funds legal?',
      'How did the court rule in Trump v. Wilcox?',
      'Tell me about the unitary executive theory',
    ]) {
      expect(classifyQuestionMode(q), q).toBe('analytical');
    }
  });

  it('a non-era "how did X compare" question stays analytical', () => {
    // COMPARATIVE_SPECIES only fires alongside era stratification.
    expect(classifyQuestionMode('How did agency responses compare between DHS and DOJ?')).toBe(
      'analytical',
    );
  });
});

describe('budgetForQuestion', () => {
  it('derives enumeration budgets', () => {
    const b = budgetForQuestion('What executive orders address collective bargaining?');
    expect(b).toEqual({
      contextDocs: ENUMERATION_CONTEXT_DOCS,
      maxTokens: ENUMERATION_MAX_TOKENS,
    });
  });

  it('derives analytical budgets', () => {
    const b = budgetForQuestion('Is the impoundment of funds legal?');
    expect(b).toEqual({
      contextDocs: RESEARCH_CONTEXT_DOCS_ANALYTICAL,
      maxTokens: ANALYTICAL_MAX_TOKENS,
    });
  });

  it('is deterministic — both endpoints must derive identical budgets', () => {
    const q = 'What government documents address National Guard deployment since January 2025?';
    expect(budgetForQuestion(q)).toEqual(budgetForQuestion(q));
  });
});
