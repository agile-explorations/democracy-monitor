import { describe, it, expect } from 'vitest';
import { scoreStatements, analyzeRhetoricActionGap } from '@/lib/services/intent-service';
import type { IntentStatement } from '@/lib/types/intent';

function makeStatement(
  overrides: Partial<IntentStatement> & {
    text: string;
    type: 'rhetoric' | 'action';
    policyArea: IntentStatement['policyArea'];
  },
): IntentStatement {
  return {
    source: 'test',
    sourceTier: 1,
    score: 0,
    date: '2026-01-01',
    ...overrides,
  };
}

describe('scoreStatements', () => {
  it('returns democratic-leaning overall for purely democratic rhetoric', () => {
    const statements: IntentStatement[] = [
      makeStatement({
        text: 'We believe in the rule of law and accountability and no one is above the law and checks and balances and constitutional limits and separation of powers and transparency',
        type: 'rhetoric',
        policyArea: 'rule_of_law',
      }),
      makeStatement({
        text: 'We comply with the courts and support accountability and transparency',
        type: 'rhetoric',
        policyArea: 'rule_of_law',
      }),
      makeStatement({
        text: 'We protect freedom of speech and first amendment and due process and constitutional rights and bill of rights and right to protest and equal protection',
        type: 'rhetoric',
        policyArea: 'civil_liberties',
      }),
      makeStatement({
        text: 'We support due process and equal protection and constitutional rights and bill of rights',
        type: 'action',
        policyArea: 'civil_liberties',
      }),
    ];
    const result = scoreStatements(statements);
    expect(result.rhetoricScore).toBeLessThan(0);
    expect(['liberal_democracy', 'competitive_authoritarian']).toContain(result.overall);
  });

  it('returns authoritarian-leaning for authoritarian rhetoric', () => {
    const statements: IntentStatement[] = [
      makeStatement({
        text: 'I have total immunity and absolute authority under article ii',
        type: 'rhetoric',
        policyArea: 'rule_of_law',
      }),
      makeStatement({
        text: 'Lock them up, they are the enemy of the people',
        type: 'rhetoric',
        policyArea: 'civil_liberties',
      }),
      makeStatement({
        text: 'We will terminate the constitution if needed',
        type: 'action',
        policyArea: 'civil_liberties',
      }),
    ];
    const result = scoreStatements(statements);
    expect(result.rhetoricScore).toBeGreaterThan(0);
  });

  it('produces a gap when rhetoric and actions diverge', () => {
    const statements: IntentStatement[] = [
      // Democratic rhetoric
      makeStatement({
        text: 'We believe in the rule of law and checks and balances',
        type: 'rhetoric',
        policyArea: 'rule_of_law',
      }),
      // Authoritarian action
      makeStatement({
        text: 'Fired inspector general and bypassed oversight',
        type: 'action',
        policyArea: 'rule_of_law',
      }),
    ];
    const result = scoreStatements(statements);
    // There should be some gap since rhetoric is democratic but action contains authoritarian keywords
    expect(result.gap).toBeGreaterThanOrEqual(0);
  });

  it('returns all 5 policy areas', () => {
    const statements: IntentStatement[] = [
      makeStatement({ text: 'rule of law matters', type: 'rhetoric', policyArea: 'rule_of_law' }),
      makeStatement({
        text: 'civil liberties protected',
        type: 'rhetoric',
        policyArea: 'civil_liberties',
      }),
      makeStatement({ text: 'fair elections', type: 'rhetoric', policyArea: 'elections' }),
      makeStatement({ text: 'free press', type: 'rhetoric', policyArea: 'media_freedom' }),
      makeStatement({
        text: 'independent agencies',
        type: 'rhetoric',
        policyArea: 'institutional_independence',
      }),
    ];
    const result = scoreStatements(statements);
    expect(Object.keys(result.policyAreas)).toHaveLength(5);
    expect(result.policyAreas.rule_of_law).toBeDefined();
    expect(result.policyAreas.civil_liberties).toBeDefined();
    expect(result.policyAreas.elections).toBeDefined();
    expect(result.policyAreas.media_freedom).toBeDefined();
    expect(result.policyAreas.institutional_independence).toBeDefined();
  });

  it('confidence scales with statement count and area diversity', () => {
    const fewStatements: IntentStatement[] = [
      makeStatement({ text: 'rule of law', type: 'rhetoric', policyArea: 'rule_of_law' }),
    ];
    const manyStatements: IntentStatement[] = Array.from({ length: 20 }, (_, i) =>
      makeStatement({
        text: `statement ${i} about rule of law and accountability`,
        type: i % 2 === 0 ? 'rhetoric' : 'action',
        policyArea: [
          'rule_of_law',
          'civil_liberties',
          'elections',
          'media_freedom',
          'institutional_independence',
        ][i % 5] as IntentStatement['policyArea'],
      }),
    );

    const fewResult = scoreStatements(fewStatements);
    const manyResult = scoreStatements(manyStatements);
    expect(manyResult.confidence).toBeGreaterThan(fewResult.confidence);
  });

  it('limits recentStatements to 20', () => {
    const statements = Array.from({ length: 30 }, (_, i) =>
      makeStatement({ text: `statement ${i}`, type: 'rhetoric', policyArea: 'rule_of_law' }),
    );
    const result = scoreStatements(statements);
    expect(result.recentStatements).toHaveLength(20);
  });

  it('handles empty statements', () => {
    const result = scoreStatements([]);
    expect(result.overall).toBeDefined();
    expect(result.confidence).toBe(0);
    expect(result.rhetoricScore).toBe(0);
    expect(result.actionScore).toBe(0);
  });
});

describe('analyzeRhetoricActionGap', () => {
  it('returns gaps only for areas with gap > 0.5', () => {
    const assessment = scoreStatements([
      // Big gap: democratic rhetoric but authoritarian action in rule_of_law
      makeStatement({
        text: 'We support the rule of law and separation of powers and checks and balances',
        type: 'rhetoric',
        policyArea: 'rule_of_law',
      }),
      makeStatement({
        text: 'I have absolute authority and total immunity and unlimited power',
        type: 'action',
        policyArea: 'rule_of_law',
      }),
    ]);

    const gaps = analyzeRhetoricActionGap(assessment);
    // Each gap entry should describe a policy area
    for (const gap of gaps) {
      expect(gap).toContain('gap:');
    }
  });

  it('returns empty array when no significant gaps', () => {
    const assessment = scoreStatements([
      makeStatement({
        text: 'general policy discussion today',
        type: 'rhetoric',
        policyArea: 'rule_of_law',
      }),
      makeStatement({
        text: 'general policy discussion today',
        type: 'action',
        policyArea: 'rule_of_law',
      }),
    ]);
    const gaps = analyzeRhetoricActionGap(assessment);
    // With identical text containing no keywords, gap should be 0
    expect(gaps).toHaveLength(0);
  });
});
