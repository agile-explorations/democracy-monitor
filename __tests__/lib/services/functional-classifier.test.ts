import { describe, expect, it } from 'vitest';
import { classifyDocumentFunction, classifyBatch } from '@/lib/services/functional-classifier';

describe('classifyDocumentFunction', () => {
  describe('Tier 1 — source_type classification', () => {
    it('classifies Rule as rulemaking', () => {
      expect(classifyDocumentFunction({ sourceType: 'Rule' })).toBe('rulemaking');
    });

    it('classifies final_rule as rulemaking', () => {
      expect(classifyDocumentFunction({ sourceType: 'final_rule' })).toBe('rulemaking');
    });

    it('classifies Proposed Rule as rulemaking', () => {
      expect(classifyDocumentFunction({ sourceType: 'Proposed Rule' })).toBe('rulemaking');
    });

    it('classifies proposed_rule as rulemaking', () => {
      expect(classifyDocumentFunction({ sourceType: 'proposed_rule' })).toBe('rulemaking');
    });

    it('classifies Presidential Document as executive_action', () => {
      expect(classifyDocumentFunction({ sourceType: 'Presidential Document' })).toBe(
        'executive_action',
      );
    });

    it('classifies executive_order as executive_action', () => {
      expect(classifyDocumentFunction({ sourceType: 'executive_order' })).toBe('executive_action');
    });

    it('classifies proclamation as executive_action', () => {
      expect(classifyDocumentFunction({ sourceType: 'proclamation' })).toBe('executive_action');
    });

    it('classifies presidential_memorandum as executive_action', () => {
      expect(classifyDocumentFunction({ sourceType: 'presidential_memorandum' })).toBe(
        'executive_action',
      );
    });

    it('classifies presidential_notice as executive_action', () => {
      expect(classifyDocumentFunction({ sourceType: 'presidential_notice' })).toBe(
        'executive_action',
      );
    });

    it('classifies rhetoric as news_rhetoric', () => {
      expect(classifyDocumentFunction({ sourceType: 'rhetoric' })).toBe('news_rhetoric');
    });
  });

  describe('Tier 2 — title heuristics', () => {
    it('classifies Excepted Service notices as personnel_action', () => {
      expect(
        classifyDocumentFunction({
          sourceType: 'Notice',
          title: 'Excepted Service Appointing Authorities',
        }),
      ).toBe('personnel_action');
    });

    it('classifies Senior Executive Service as personnel_action', () => {
      expect(
        classifyDocumentFunction({
          sourceType: 'Notice',
          title: 'Senior Executive Service Performance Review Board',
        }),
      ).toBe('personnel_action');
    });

    it('classifies Personnel Demonstration as personnel_action', () => {
      expect(
        classifyDocumentFunction({
          sourceType: 'Notice',
          title: 'Personnel Demonstration Project',
        }),
      ).toBe('personnel_action');
    });

    it('classifies Privacy Act notices as administrative_procedure', () => {
      expect(
        classifyDocumentFunction({
          sourceType: 'Notice',
          title: 'Privacy Act of 1974; System of Records',
        }),
      ).toBe('administrative_procedure');
    });

    it('classifies Agency Information Collection as administrative_procedure', () => {
      expect(
        classifyDocumentFunction({
          sourceType: 'Notice',
          title: 'Agency Information Collection Activities; Proposals',
        }),
      ).toBe('administrative_procedure');
    });

    it('classifies Submission for OMB Review as administrative_procedure', () => {
      expect(
        classifyDocumentFunction({
          sourceType: 'Notice',
          title: 'Submission for OMB Review; Comment Request',
        }),
      ).toBe('administrative_procedure');
    });

    it('classifies Self-Regulatory Organizations as financial_regulatory', () => {
      expect(
        classifyDocumentFunction({
          sourceType: 'Notice',
          title: 'Self-Regulatory Organizations; NASDAQ',
        }),
      ).toBe('financial_regulatory');
    });

    it('classifies Statement of Organization as organizational_change', () => {
      expect(
        classifyDocumentFunction({
          sourceType: 'Notice',
          title: 'Statement of Organization, Functions, and Delegations',
        }),
      ).toBe('organizational_change');
    });

    it('classifies cultural determinations as cultural_ceremonial', () => {
      expect(
        classifyDocumentFunction({
          sourceType: 'Notice',
          title: 'Notice of Determinations; Culturally Significant Objects',
        }),
      ).toBe('cultural_ceremonial');
    });
  });

  describe('Tier 3 — action field heuristics', () => {
    it('classifies notice of proposed rulemaking via action', () => {
      expect(
        classifyDocumentFunction({
          sourceType: 'Notice',
          title: 'Some generic notice',
          action: 'Notice of proposed rulemaking',
        }),
      ).toBe('rulemaking');
    });

    it('classifies notice of meeting via action', () => {
      expect(
        classifyDocumentFunction({
          sourceType: 'Notice',
          title: 'Some generic notice',
          action: 'Notice of meeting',
        }),
      ).toBe('administrative_procedure');
    });

    it('classifies reorganization via action', () => {
      expect(
        classifyDocumentFunction({
          sourceType: 'Notice',
          title: 'Some generic notice',
          action: 'Reorganization of functions',
        }),
      ).toBe('organizational_change');
    });

    it('classifies delegation of authority via action', () => {
      expect(
        classifyDocumentFunction({
          sourceType: 'Notice',
          title: 'Some generic notice',
          action: 'Delegation of authority',
        }),
      ).toBe('personnel_action');
    });
  });

  describe('Tier 4 — unclassified', () => {
    it('returns unclassified for generic Notice with no heuristic match', () => {
      expect(
        classifyDocumentFunction({
          sourceType: 'Notice',
          title: 'Generic Notice About Something',
        }),
      ).toBe('unclassified');
    });

    it('returns unclassified for empty document', () => {
      expect(classifyDocumentFunction({})).toBe('unclassified');
    });
  });

  describe('priority ordering', () => {
    it('Tier 1 takes priority over Tier 2', () => {
      // Rule source type should win even if title says Excepted Service
      expect(
        classifyDocumentFunction({
          sourceType: 'Rule',
          title: 'Excepted Service Rule',
        }),
      ).toBe('rulemaking');
    });

    it('Tier 2 takes priority over Tier 3', () => {
      // Title heuristic should win over action field
      expect(
        classifyDocumentFunction({
          sourceType: 'Notice',
          title: 'Excepted Service Appointing Authorities',
          action: 'Reorganization',
        }),
      ).toBe('personnel_action');
    });
  });

  describe('case insensitivity', () => {
    it('handles uppercase source types via case-insensitive matching', () => {
      expect(classifyDocumentFunction({ sourceType: 'RULE' })).toBe('rulemaking');
    });
  });
});

describe('classifyBatch', () => {
  it('returns proportional distribution for a batch', () => {
    const docs = [
      { sourceType: 'Rule' },
      { sourceType: 'Rule' },
      { sourceType: 'Presidential Document' },
      { sourceType: 'rhetoric' },
    ];
    const dist = classifyBatch(docs);
    expect(dist.rulemaking).toBe(0.5);
    expect(dist.executive_action).toBe(0.25);
    expect(dist.news_rhetoric).toBe(0.25);
    expect(dist.unclassified).toBe(0);
  });

  it('returns all zeros for empty batch', () => {
    const dist = classifyBatch([]);
    expect(dist.rulemaking).toBe(0);
    expect(dist.executive_action).toBe(0);
    expect(dist.unclassified).toBe(0);
  });

  it('proportions sum to approximately 1.0', () => {
    const docs = [
      { sourceType: 'Rule' },
      { sourceType: 'Notice', title: 'Privacy Act System' },
      { sourceType: 'rhetoric' },
      { sourceType: 'Notice', title: 'Generic' },
    ];
    const dist = classifyBatch(docs);
    const sum = Object.values(dist).reduce((s, v) => s + v, 0);
    expect(sum).toBeCloseTo(1.0, 10);
  });
});
