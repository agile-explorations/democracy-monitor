import { describe, it, expect } from 'vitest';
import { CLASS_MULTIPLIERS } from '@/lib/methodology/scoring-config';
import { classifyDocument } from '@/lib/services/document-classifier';
import type { ContentItem } from '@/lib/types';

describe('classifyDocument', () => {
  describe('Federal Register type mapping', () => {
    it('classifies Rule as final_rule', () => {
      const item: ContentItem = { type: 'Rule', title: 'Final Rule on XYZ' };
      expect(classifyDocument(item)).toBe('final_rule');
    });

    it('classifies Proposed Rule as proposed_rule', () => {
      const item: ContentItem = { type: 'Proposed Rule', title: 'Proposed changes' };
      expect(classifyDocument(item)).toBe('proposed_rule');
    });

    it('classifies Notice as notice', () => {
      const item: ContentItem = { type: 'Notice', title: 'Public notice' };
      expect(classifyDocument(item)).toBe('notice');
    });
  });

  describe('Presidential Document subtype mapping', () => {
    it('classifies Executive Order subtype as executive_order', () => {
      const item: ContentItem = {
        type: 'Presidential Document',
        subtype: 'Executive Order',
        title: 'EO 14000',
      };
      expect(classifyDocument(item)).toBe('executive_order');
    });

    it('classifies Presidential Memorandum subtype as presidential_memorandum', () => {
      const item: ContentItem = {
        type: 'Presidential Document',
        subtype: 'Presidential Memorandum',
        title: 'Memo on Security',
      };
      expect(classifyDocument(item)).toBe('presidential_memorandum');
    });

    it('classifies Proclamation subtype as proclamation', () => {
      const item: ContentItem = {
        type: 'Presidential Document',
        subtype: 'Proclamation',
        title: 'National Day',
      };
      expect(classifyDocument(item)).toBe('proclamation');
    });

    it('classifies Presidential Notice subtype as presidential_notice', () => {
      const item: ContentItem = {
        type: 'Presidential Document',
        subtype: 'Presidential Notice',
        title: 'Notice on Sanctions',
      };
      expect(classifyDocument(item)).toBe('presidential_notice');
    });

    it('falls back to executive_order for unknown presidential subtype', () => {
      const item: ContentItem = {
        type: 'Presidential Document',
        subtype: 'Unknown Subtype',
        title: 'Some Document',
      };
      expect(classifyDocument(item)).toBe('executive_order');
    });

    it('falls back to executive_order when presidential document has no subtype', () => {
      const item: ContentItem = { type: 'Presidential Document', title: 'EO 14000' };
      expect(classifyDocument(item)).toBe('executive_order');
    });
  });

  describe('title heuristics', () => {
    it('classifies title containing "executive order" as executive_order', () => {
      const item: ContentItem = { title: 'Executive Order on Immigration' };
      expect(classifyDocument(item)).toBe('executive_order');
    });

    it('classifies title containing "presidential memorandum" as presidential_memorandum', () => {
      const item: ContentItem = { title: 'Presidential Memorandum on National Security' };
      expect(classifyDocument(item)).toBe('presidential_memorandum');
    });

    it('classifies title containing "proclamation" as proclamation', () => {
      const item: ContentItem = { title: 'Proclamation on National Day of Prayer' };
      expect(classifyDocument(item)).toBe('proclamation');
    });

    it('prefers FR type over title heuristic', () => {
      const item: ContentItem = { type: 'Notice', title: 'Executive Order Discussion' };
      expect(classifyDocument(item)).toBe('notice');
    });
  });

  describe('agency/source patterns', () => {
    it('classifies Supreme Court source as court_opinion', () => {
      const item: ContentItem = { title: 'Ruling', agency: 'Supreme Court of the United States' };
      expect(classifyDocument(item)).toBe('court_opinion');
    });

    it('classifies SCOTUS link as court_opinion', () => {
      const item: ContentItem = { title: 'Ruling', link: 'https://www.scotus.gov/opinion' };
      expect(classifyDocument(item)).toBe('court_opinion');
    });

    it('classifies GAO agency as report', () => {
      const item: ContentItem = { title: 'Analysis', agency: 'GAO' };
      expect(classifyDocument(item)).toBe('report');
    });

    it('classifies Government Accountability Office as report', () => {
      const item: ContentItem = { title: 'Review', agency: 'Government Accountability Office' };
      expect(classifyDocument(item)).toBe('report');
    });

    it('classifies Inspector General as report', () => {
      const item: ContentItem = { title: 'IG Findings', agency: 'Office of Inspector General' };
      expect(classifyDocument(item)).toBe('report');
    });

    it('classifies CBO as report', () => {
      const item: ContentItem = { title: 'Budget Analysis', agency: 'CBO' };
      expect(classifyDocument(item)).toBe('report');
    });

    it('classifies Congressional Research as report', () => {
      const item: ContentItem = { title: 'CRS Report', agency: 'Congressional Research Service' };
      expect(classifyDocument(item)).toBe('report');
    });

    it('classifies Department of Defense as press_release', () => {
      const item: ContentItem = { title: 'Statement', agency: 'Department of Defense' };
      expect(classifyDocument(item)).toBe('press_release');
    });

    it('classifies DOD link as press_release', () => {
      const item: ContentItem = { title: 'Release', link: 'https://www.dod.mil/release' };
      expect(classifyDocument(item)).toBe('press_release');
    });

    it('classifies White House as press_release', () => {
      const item: ContentItem = { title: 'Briefing', agency: 'White House' };
      expect(classifyDocument(item)).toBe('press_release');
    });
  });

  describe('direct type mappings', () => {
    it('classifies judicial_opinion as court_opinion', () => {
      const item: ContentItem = { type: 'judicial_opinion', title: 'Opinion text' };
      expect(classifyDocument(item)).toBe('court_opinion');
    });

    it('classifies court_opinion as court_opinion', () => {
      const item: ContentItem = { type: 'court_opinion', title: 'Docket entry' };
      expect(classifyDocument(item)).toBe('court_opinion');
    });
  });

  describe('fallback', () => {
    it('returns unknown when no heuristic matches', () => {
      const item: ContentItem = { title: 'Some generic document' };
      expect(classifyDocument(item)).toBe('unknown');
    });

    it('returns unknown for empty item', () => {
      const item: ContentItem = {};
      expect(classifyDocument(item)).toBe('unknown');
    });
  });
});

describe('hearing_transcript class (#609)', () => {
  it('classifies hearing transcripts as hearing with a damped multiplier', () => {
    const cls = classifyDocument({ type: 'hearing_transcript', title: 'Oversight Hearing' });
    expect(cls).toBe('hearing');
    expect(CLASS_MULTIPLIERS[cls]).toBeLessThan(CLASS_MULTIPLIERS.press_release);
  });
});
