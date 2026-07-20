import { describe, expect, it } from 'vitest';
import { routeBulkOpinionCluster } from '@/lib/services/cl-bulk-staging';

const NO_MATCH = { baseMatch: false, courtQueries: new Set<string>() };

const scotus = (keys: string[] = ['scotus-all']) => ({
  baseMatch: false,
  courtQueries: new Set(keys),
});

const plainDocket = { natureOfSuit: '', caseName: 'Doe v. Roe', cause: '' };

describe('routeBulkOpinionCluster (#555)', () => {
  it('routes base NOS matches via docket routing, ignoring court routing', () => {
    const { baseCategories, courtCategories } = routeBulkOpinionCluster(
      { baseMatch: true, courtQueries: new Set() },
      { natureOfSuit: '440 Civil Rights: Other', caseName: 'Doe v. City', cause: '42:1983' },
      'Some opinion text without notable phrases.',
    );
    expect(baseCategories).toEqual(['lawEnforcement', 'civilLiberties']);
    expect(courtCategories).toEqual([]);
  });

  it('falls back to civilLiberties for base matches routed only by opinion text', () => {
    const { baseCategories } = routeBulkOpinionCluster(
      { baseMatch: true, courtQueries: new Set() },
      plainDocket,
      'The First Amendment claim was dismissed.',
    );
    expect(baseCategories).toEqual(['civilLiberties']);
  });

  it('content-routes court-scoped matches via classifyOpinionToCategories', () => {
    const { baseCategories, courtCategories } = routeBulkOpinionCluster(
      scotus(),
      { natureOfSuit: '', caseName: 'Seila Law LLC v. CFPB', cause: '' },
      'The removal power of the President over principal officers, and whether ' +
        'the separation of powers permits an independent agency headed by a single director.',
    );
    expect(baseCategories).toEqual([]);
    expect(courtCategories.length).toBeGreaterThan(0);
  });

  it('gates unrouted court-only matches: classifies to nothing → not stored', () => {
    const { baseCategories, courtCategories } = routeBulkOpinionCluster(
      scotus(),
      { natureOfSuit: '', caseName: 'Smith v. Jones', cause: '' },
      'A routine contract dispute over the delivery of widgets and invoice terms.',
    );
    expect(baseCategories).toEqual([]);
    expect(courtCategories).toEqual([]);
  });

  it('deduplicates: court categories exclude those already base-routed', () => {
    const { baseCategories, courtCategories } = routeBulkOpinionCluster(
      { baseMatch: true, courtQueries: new Set(['circuits-exec']) },
      { natureOfSuit: '440 Civil Rights: Other', caseName: 'Doe v. City', cause: '' },
      'The First Amendment retaliation claim involves free speech restrictions by police.',
    );
    for (const cat of courtCategories) {
      expect(baseCategories).not.toContain(cat);
    }
  });

  it('returns nothing for unmatched clusters', () => {
    const result = routeBulkOpinionCluster(NO_MATCH, plainDocket, 'First Amendment text.');
    expect(result).toEqual({ baseCategories: [], courtCategories: [] });
  });
});
