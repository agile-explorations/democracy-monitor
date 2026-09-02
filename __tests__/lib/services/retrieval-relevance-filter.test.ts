import { describe, expect, it } from 'vitest';
import IA_HOLDOUT from '@/docs/internal/CONTAMINATION_HOLDOUT_INFOAVAILABILITY.json';
import IA_SAMPLE from '@/docs/internal/CONTAMINATION_SAMPLE_INFOAVAILABILITY.json';
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
const iaSample = IA_SAMPLE as LabeledDoc[];
const iaHoldout = IA_HOLDOUT as LabeledDoc[];

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

/**
 * infoAvailability (#832, R-INFOAVAIL, pattern v2). Gates: the July #548
 * sample (as relabeled by the 2026-09-01 owner class rulings) and the fresh
 * owner-adjudicated holdout. Zero false drops is the standing bar; the two
 * accepted false keeps from the holdout gate are pinned below. Never shrink
 * the should-catch list.
 */
const IA_SHOULD_CATCH = [
  // NEPA implementing-regulation removals (2025 rescission family)
  'Removal of National Environmental Policy Act Implementing Regulations',
  // FOIA core instruments
  'Freedom of Information Act Regulations Update',
  // Public-facing disclosure regimes (owner ruling: public-facing ON)
  'Rescission of Climate-Related Disclosure Rules',
  // Privacy Act implementation/exemption class (owner ruling 2026-09-01)
  'Privacy Act of 1974; Implementation',
  'Privacy Act of 1974: Implementation of Exemptions; Department of Homeland Security (DHS)/U.S. Customs and Border Protection (CBP)-024 CBP Intelligence Records System (CIRS) System of Records',
  // PRA collection discontinuance — the #551 data-suppression signal
  'Agency Information Collection Activities; Proposed Collection; Comment Request; Permanent Discontinuance of the Current Population Survey Supplement',
];

/** Holdout-accepted false keeps (owner adjudication 2026-09-01): kept by the
 *  filter, OFF-labeled — embedded-transparency titles L2 still assesses. */
const IA_ACCEPTED_FALSE_KEEPS = [
  'Health Data, Technology, and Interoperability',
  'Improving Free Inquiry, Transparency',
];

describe('assessRetrievalRelevance — infoAvailability', () => {
  it('is configured for infoAvailability', () => {
    expect(hasRelevanceFilter('infoAvailability')).toBe(true);
  });

  it('keeps every ON document in the #548 labeled sample (zero false drops)', () => {
    const missed = iaSample
      .filter((d) => d.label === 'on')
      .filter((d) => !assessRetrievalRelevance('infoAvailability', { title: d.title }).relevant);
    expect(missed.map((d) => d.title)).toEqual([]);
  });

  it('drops every OFF document in the #548 labeled sample', () => {
    const kept = iaSample
      .filter((d) => d.label === 'off')
      .filter((d) => assessRetrievalRelevance('infoAvailability', { title: d.title }).relevant);
    expect(kept.map((d) => d.title)).toEqual([]);
  });

  it('keeps every ON document in the owner-adjudicated holdout (zero false drops)', () => {
    const missed = iaHoldout
      .filter((d) => d.label === 'on')
      .filter((d) => !assessRetrievalRelevance('infoAvailability', { title: d.title }).relevant);
    expect(missed.map((d) => d.title)).toEqual([]);
  });

  it('drops every OFF holdout document except the two accepted false keeps', () => {
    const kept = iaHoldout
      .filter((d) => d.label === 'off')
      .filter((d) => assessRetrievalRelevance('infoAvailability', { title: d.title }).relevant)
      .filter((d) => !IA_ACCEPTED_FALSE_KEEPS.some((p) => d.title.startsWith(p)));
    expect(kept.map((d) => d.title)).toEqual([]);
  });

  it('catches every title on the should-have-been-caught list', () => {
    const missed = IA_SHOULD_CATCH.filter(
      (title) => !assessRetrievalRelevance('infoAvailability', { title }).relevant,
    );
    expect(missed).toEqual([]);
  });

  it('keeps PRA discontinuances while excluding routine PRA renewals (the #551 pair)', () => {
    expect(
      assessRetrievalRelevance('infoAvailability', {
        title:
          'Agency Information Collection Activities; Proposed Collection; Comment Request; Permanent Discontinuance of the Quarterly Services Survey',
      }).relevant,
    ).toBe(true);
    expect(
      assessRetrievalRelevance('infoAvailability', {
        title:
          'Agency Information Collection Activities; Submission to the Office of Management and Budget (OMB) for Review and Approval; Comment Request; Special Census Program',
      }).relevant,
    ).toBe(false);
    expect(
      assessRetrievalRelevance('infoAvailability', {
        title: 'Proposed Collection; Comment Request for Treaty-Based Return Position Disclosure',
      }).relevant,
    ).toBe(false);
  });

  it('drops SORN notices but keeps Privacy Act implementation/exemption rules', () => {
    expect(
      assessRetrievalRelevance('infoAvailability', {
        title: 'Privacy Act of 1974; System of Records',
      }).relevant,
    ).toBe(false);
    expect(
      assessRetrievalRelevance('infoAvailability', {
        title:
          'Privacy Act of 1974: Implementation of Exemptions; Department of Homeland Security/U.S. Customs and Border Protection-009 Electronic System for Travel Authorization (ESTA) System of Records',
      }).relevant,
    ).toBe(true);
    expect(
      assessRetrievalRelevance('infoAvailability', {
        title: 'Privacy Act of 1974; Matching Program',
      }).relevant,
    ).toBe(false);
  });

  it('drops bilateral disclosure regimes per the owner boundary ruling', () => {
    expect(
      assessRetrievalRelevance('infoAvailability', {
        title: 'Fair Credit Reporting Act Disclosures',
      }).relevant,
    ).toBe(false);
    expect(
      assessRetrievalRelevance('infoAvailability', {
        title:
          'Proposed Removal of a Reporting Requirement for Trusts Whose Charitable Contribution Deductions Are Solely for Contributions Made by Passthrough Entities',
      }).relevant,
    ).toBe(false);
  });

  it('drops project-level NEPA process notices while keeping NEPA rule changes', () => {
    expect(
      assessRetrievalRelevance('infoAvailability', {
        title:
          'Notice of Intent To Prepare an Environmental Impact Statement for the Scoggins Dam Safety Modifications Project',
      }).relevant,
    ).toBe(false);
    expect(
      assessRetrievalRelevance('infoAvailability', {
        title:
          'Recission of Procedures for Implementing the National Environmental Policy Act (NEPA)',
      }).relevant,
    ).toBe(true);
  });
});
