import { readFileSync } from 'fs';
import path from 'path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  ANALYTICAL_MAX_TOKENS,
  budgetForQuestion,
  classifyQuestionMode,
  ENUMERATION_CONTEXT_DOCS,
  ENUMERATION_MAX_TOKENS,
  RESEARCH_CONTEXT_DOCS_ANALYTICAL,
} from '@/lib/services/question-classifier';

// The kill-switch (#756 incident) defaults enumeration mode OFF; these
// tests exercise the enabled behavior.
beforeAll(() => {
  process.env.ENUMERATION_MODE = 'on';
});
afterAll(() => {
  delete process.env.ENUMERATION_MODE;
});

describe('enumeration kill-switch (#756)', () => {
  it('defaults every question to analytical when the flag is off', () => {
    delete process.env.ENUMERATION_MODE;
    expect(classifyQuestionMode('What executive orders address collective bargaining?')).toBe(
      'analytical',
    );
    process.env.ENUMERATION_MODE = 'on';
  });
});

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

  it('era-comparative questions about cases, investigations and indictments enumerate (owner, 2026-08-28)', () => {
    for (const q of [
      'To what extent has the DOJ brought cases against political opponents of the current administration, and to what extent have those cases appeared to be a weaponization by the administration of the DOJ against those political opponents? Provide a comparison across administrations.',
      'Compare the cases the DOJ has brought against political opponents under the current administration with the previous two.',
      'How did investigations of political opponents compare between the first and second Trump administrations?',
      'Compare indictments of former officials under Biden and the second Trump administration.',
    ]) {
      expect(classifyQuestionMode(q), q).toBe('enumeration');
    }
  });

  it('era-comparative funding/legislation questions enumerate (#801)', () => {
    for (const q of [
      'How has congressional funding legislation for ICE and CBP compared across the last three administrations?',
      'How have appropriations riders on immigration enforcement differed across administrations?',
      'How did inspector general reports on detention compare between the first and second Trump administrations?',
    ]) {
      expect(classifyQuestionMode(q), q).toBe('enumeration');
    }
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
      mode: 'enumeration',
      contextDocs: ENUMERATION_CONTEXT_DOCS,
      maxTokens: ENUMERATION_MAX_TOKENS,
    });
  });

  it('derives analytical budgets', () => {
    const b = budgetForQuestion('Is the impoundment of funds legal?');
    expect(b).toEqual({
      mode: 'analytical',
      contextDocs: RESEARCH_CONTEXT_DOCS_ANALYTICAL,
      maxTokens: ANALYTICAL_MAX_TOKENS,
    });
  });

  it('is deterministic — both endpoints must derive identical budgets', () => {
    const q = 'What government documents address National Guard deployment since January 2025?';
    expect(budgetForQuestion(q)).toEqual(budgetForQuestion(q));
  });
});
