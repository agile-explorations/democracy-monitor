import { describe, expect, it } from 'vitest';
import LABELED_SAMPLE from '@/docs/internal/MEDIAFREEDOM_LABELED_SAMPLE.json';
import {
  assessRetrievalRelevance,
  hasRelevanceFilter,
  partitionByRetrievalRelevance,
} from '@/lib/services/retrieval-relevance-filter';

interface LabeledDoc {
  url: string;
  title: string;
  label: string;
}

const sample = LABELED_SAMPLE as LabeledDoc[];

/**
 * Standing "should have been caught" list (#524 design record): titles of
 * genuine press-freedom FR instruments, drawn from external reporting, that a
 * naive allowlist could miss. Grows over time; never shrink it.
 */
const SHOULD_CATCH = [
  // 28 CFR 50.10 — DOJ media-subpoena policy (2021-22 revisions)
  'Policy Regarding Obtaining Information From, or Records of, Members of the News Media',
  // Prepublication review regimes (ODNI/CIA/DoD)
  'Prepublication Review Procedures',
  'Amendments to Prepublication Review of Certain Materials Prepared by Present and Former Employees',
  // FOIA core instruments
  'Freedom of Information Act Regulations',
  'Revision of Regulations Governing Freedom of Information Act Requests and Appeals',
];

describe('assessRetrievalRelevance — mediaFreedom', () => {
  it('is configured for mediaFreedom and passes through unconfigured categories', () => {
    expect(hasRelevanceFilter('mediaFreedom')).toBe(true);
    expect(hasRelevanceFilter('fiscal')).toBe(false);
    expect(assessRetrievalRelevance('fiscal', { title: 'Airworthiness Directives' })).toEqual({
      relevant: true,
      reason: 'no-filter-for-category',
    });
  });

  it('keeps every on-topic document in the labeled sample (100% recall)', () => {
    const missed = sample
      .filter((d) => d.label === 'on')
      .filter((d) => !assessRetrievalRelevance('mediaFreedom', { title: d.title }).relevant);
    expect(missed.map((d) => d.title)).toEqual([]);
  });

  it('drops every off-topic document in the labeled sample', () => {
    const kept = sample
      .filter((d) => d.label === 'off')
      .filter((d) => assessRetrievalRelevance('mediaFreedom', { title: d.title }).relevant);
    expect(kept.map((d) => d.title)).toEqual([]);
  });

  it('catches every title on the should-have-been-caught list', () => {
    const missed = SHOULD_CATCH.filter(
      (title) => !assessRetrievalRelevance('mediaFreedom', { title }).relevant,
    );
    expect(missed).toEqual([]);
  });

  it('recovers euphemistic titles through the abstract', () => {
    const result = assessRetrievalRelevance('mediaFreedom', {
      title: 'Revision of Departmental Procedures',
      abstract:
        'This rule revises procedures governing the issuance of press credentials to journalists covering the Department.',
    });
    expect(result).toEqual({ relevant: true, reason: 'allow-match' });
  });

  it('documents the accepted residual risk: security-framed press actions with silent abstracts evade the filter', () => {
    // Accepted in the #524 design record: events like this also generate floor
    // speeches and litigation, which carry the category's real signal; the
    // drop ledger + LLM audit (#545) are the backstop.
    const result = assessRetrievalRelevance('mediaFreedom', {
      title: 'Revision of Access Control Procedures for the White House Complex',
      abstract: 'Updates physical access control requirements for non-employee personnel.',
    });
    expect(result.relevant).toBe(false);
  });

  it('partitions fetched items and passes unconfigured categories through untouched', () => {
    const items = [
      { title: 'Freedom of Information Act Regulations Update', link: 'https://x/1' },
      { title: 'Airworthiness Directives; Boeing', link: 'https://x/2' },
    ];
    const { kept, dropped } = partitionByRetrievalRelevance('mediaFreedom', items);
    expect(kept.map((i) => i.link)).toEqual(['https://x/1']);
    expect(dropped).toEqual([{ item: items[1], reason: 'no-allow-match' }]);

    const passthrough = partitionByRetrievalRelevance('fiscal', items);
    expect(passthrough.kept).toHaveLength(2);
    expect(passthrough.dropped).toHaveLength(0);
  });

  it('excludes routine FOIA committee meetings and paperwork notices by title only', () => {
    expect(
      assessRetrievalRelevance('mediaFreedom', {
        title: 'Freedom of Information Act (FOIA) Advisory Committee Meetings',
      }).reason,
    ).toBe('excluded');
    // ...but an exclusion word in the ABSTRACT must not kill a real FOIA rule.
    expect(
      assessRetrievalRelevance('mediaFreedom', {
        title: 'Freedom of Information Act Regulations Update',
        abstract: 'Discussed at the quarterly public meeting of the agency.',
      }).relevant,
    ).toBe(true);
  });
});
