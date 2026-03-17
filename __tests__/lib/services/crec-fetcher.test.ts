import { describe, it, expect } from 'vitest';
import type { CrecGranuleSummary } from '@/lib/services/crec-fetcher';
import {
  parseCrecParams,
  isProceduralGranule,
  classifyCrecContentType,
  extractSpeakers,
  primarySpeakerName,
  toContentItem,
} from '@/lib/services/crec-fetcher';

describe('parseCrecParams', () => {
  it('parses default chambers', () => {
    const result = parseCrecParams('crec://floor');
    expect(result.chambers).toEqual(['SENATE', 'HOUSE']);
  });

  it('parses explicit chamber parameter', () => {
    const result = parseCrecParams('crec://floor?chamber=senate');
    expect(result.chambers).toEqual(['SENATE']);
  });

  it('parses multiple chambers', () => {
    const result = parseCrecParams('crec://floor?chamber=senate,house');
    expect(result.chambers).toEqual(['SENATE', 'HOUSE']);
  });
});

describe('isProceduralGranule', () => {
  it('filters FrontMatter entries', () => {
    expect(
      isProceduralGranule(
        'CONGRESSIONAL RECORD',
        undefined,
        'CREC-2025-01-21-pt1-PgS-FrontMatter-37',
      ),
    ).toBe(true);
  });

  it('filters PRAYER subGranuleClass', () => {
    expect(isProceduralGranule('PRAYER', 'PRAYER')).toBe(true);
  });

  it('filters PLEDGE subGranuleClass', () => {
    expect(isProceduralGranule('PLEDGE OF ALLEGIANCE', 'PLEDGE')).toBe(true);
  });

  it('filters by title pattern', () => {
    expect(isProceduralGranule('ADJOURNMENT')).toBe(true);
    expect(isProceduralGranule('MORNING BUSINESS')).toBe(true);
    expect(isProceduralGranule('RESERVATION OF LEADER TIME')).toBe(true);
    expect(isProceduralGranule('RECOGNITION OF THE MAJORITY LEADER')).toBe(true);
    expect(isProceduralGranule('Senate')).toBe(true);
    expect(isProceduralGranule('House of Representatives')).toBe(true);
  });

  it('allows substantive entries through', () => {
    expect(isProceduralGranule('Government Funding')).toBe(false);
    expect(isProceduralGranule("DELIVERING ON PRESIDENT TRUMP'S PROMISES")).toBe(false);
    expect(isProceduralGranule('Filibuster (Executive Session)')).toBe(false);
    expect(isProceduralGranule('BORN-ALIVE ABORTION SURVIVORS PROTECTION ACT')).toBe(false);
  });

  it('filters ORDERS FOR next session', () => {
    expect(isProceduralGranule('ORDERS FOR WEDNESDAY, JANUARY 22, 2025')).toBe(true);
  });

  it('filters CONCLUSION OF MORNING BUSINESS', () => {
    expect(isProceduralGranule('CONCLUSION OF MORNING BUSINESS')).toBe(true);
  });
});

describe('classifyCrecContentType', () => {
  it('classifies nominations', () => {
    expect(classifyCrecContentType('NOMINATION', 'SNOMINATIONS')).toBe('nomination');
    expect(classifyCrecContentType('Vote on Chavez-DeRemer Nomination')).toBe('nomination');
  });

  it('classifies legislative actions', () => {
    expect(classifyCrecContentType('INTRODUCTION OF BILLS AND JOINT RESOLUTIONS')).toBe(
      'legislative_action',
    );
    expect(classifyCrecContentType('REPORTS OF COMMITTEES ON PUBLIC BILLS')).toBe(
      'legislative_action',
    );
    expect(classifyCrecContentType('ADDITIONAL COSPONSORS')).toBe('legislative_action');
    expect(classifyCrecContentType('SENATE RESOLUTION 29')).toBe('legislative_action');
    expect(classifyCrecContentType('Cloture Motion (Executive Session)')).toBe(
      'legislative_action',
    );
    expect(classifyCrecContentType('Constitutional Authority Statement')).toBe(
      'legislative_action',
    );
  });

  it('classifies floor speeches as default', () => {
    expect(classifyCrecContentType('Government Funding')).toBe('floor_speech');
    expect(classifyCrecContentType('Filibuster (Executive Session)')).toBe('floor_speech');
    expect(classifyCrecContentType("DELIVERING ON PRESIDENT TRUMP'S PROMISES")).toBe(
      'floor_speech',
    );
    expect(classifyCrecContentType('HALT ALL LETHAL TRAFFICKING OF FENTANYL ACT')).toBe(
      'floor_speech',
    );
  });
});

describe('extractSpeakers', () => {
  const makeSummary = (members: CrecGranuleSummary['members']): CrecGranuleSummary => ({
    title: 'Test',
    granuleId: 'CREC-2025-01-21-pt1-PgS1619-7',
    dateIssued: '2025-01-21',
    granuleClass: 'SENATE',
    members,
  });

  it('extracts speaker from members array', () => {
    const summary = makeSummary([
      {
        role: 'SPEAKING',
        chamber: 'S',
        bioGuideId: 'G000386',
        memberName: 'Grassley, Chuck',
        state: 'IA',
        party: 'R',
      },
    ]);
    const speakers = extractSpeakers(summary);
    expect(speakers).toHaveLength(1);
    expect(speakers[0]).toEqual({
      memberName: 'Grassley, Chuck',
      bioGuideId: 'G000386',
      party: 'R',
      state: 'IA',
      chamber: 'S',
    });
  });

  it('extracts multiple speakers', () => {
    const summary = makeSummary([
      { memberName: 'Thune, John', party: 'R', state: 'SD' },
      { memberName: 'Cornyn, John', party: 'R', state: 'TX' },
    ]);
    expect(extractSpeakers(summary)).toHaveLength(2);
  });

  it('returns empty array when no members', () => {
    expect(extractSpeakers(makeSummary(undefined))).toEqual([]);
    expect(extractSpeakers(makeSummary([]))).toEqual([]);
  });

  it('skips members without memberName', () => {
    const summary = makeSummary([
      { role: 'SPEAKING', chamber: 'S' },
      { memberName: 'Grassley, Chuck', party: 'R', state: 'IA' },
    ]);
    expect(extractSpeakers(summary)).toHaveLength(1);
  });
});

describe('primarySpeakerName', () => {
  it('returns first speaker name', () => {
    const summary: CrecGranuleSummary = {
      title: 'Test',
      granuleId: 'test',
      dateIssued: '2025-01-21',
      granuleClass: 'SENATE',
      members: [{ memberName: 'Grassley, Chuck' }],
    };
    expect(primarySpeakerName(summary)).toBe('Grassley, Chuck');
  });

  it('returns null when no members', () => {
    const summary: CrecGranuleSummary = {
      title: 'Test',
      granuleId: 'test',
      dateIssued: '2025-01-21',
      granuleClass: 'SENATE',
    };
    expect(primarySpeakerName(summary)).toBeNull();
  });
});

describe('toContentItem', () => {
  const summary: CrecGranuleSummary = {
    title: 'Government Funding (Executive Session)',
    granuleId: 'CREC-2025-03-10-pt1-PgS1619-7',
    dateIssued: '2025-03-10',
    granuleClass: 'SENATE',
    subGranuleClass: 'SEXECSESSION',
    members: [
      {
        role: 'SPEAKING',
        chamber: 'S',
        bioGuideId: 'G000386',
        memberName: 'Grassley, Chuck',
        state: 'IA',
        party: 'R',
      },
    ],
    detailsLink:
      'https://www.govinfo.gov/app/details/CREC-2025-03-10/CREC-2025-03-10-pt1-PgS1619-7',
    pagePrefix: 'S',
  };

  it('converts granule summary to ContentItem', () => {
    const item = toContentItem(summary, 'Mr. GRASSLEY. Mr. President...');
    expect(item.title).toBe('Government Funding (Executive Session)');
    expect(item.pubDate).toBe('2025-03-10');
    expect(item.agency).toBe('Grassley, Chuck (R-IA)');
    expect(item.sourceOrigin).toBe('crec');
    expect(item.type).toBe('floor_speech');
    expect(item.link).toBe(
      'https://www.govinfo.gov/app/details/CREC-2025-03-10/CREC-2025-03-10-pt1-PgS1619-7',
    );
  });

  it('includes speaker metadata', () => {
    const item = toContentItem(summary, null);
    const meta = item.metadata as Record<string, unknown>;
    expect(meta.chamber).toBe('senate');
    expect(meta.crecContentType).toBe('floor_speech');
    expect(meta.granuleId).toBe('CREC-2025-03-10-pt1-PgS1619-7');
    expect(meta.subGranuleClass).toBe('SEXECSESSION');
    const speakers = meta.speakers as Array<{ memberName: string }>;
    expect(speakers[0].memberName).toBe('Grassley, Chuck');
  });

  it('truncates summary to 800 chars', () => {
    const longText = 'x'.repeat(1000);
    const item = toContentItem(summary, longText);
    expect(item.summary!.length).toBe(800);
  });

  it('handles null text', () => {
    const item = toContentItem(summary, null);
    expect(item.summary).toBeUndefined();
  });

  it('handles missing speaker', () => {
    const noSpeaker: CrecGranuleSummary = {
      ...summary,
      members: undefined,
    };
    const item = toContentItem(noSpeaker, null);
    expect(item.agency).toBe('Congressional Record');
  });

  it('generates fallback URL when detailsLink missing', () => {
    const noDetails: CrecGranuleSummary = {
      ...summary,
      detailsLink: undefined,
    };
    const item = toContentItem(noDetails, null);
    expect(item.link).toContain('CREC-2025-03-10');
    expect(item.link).toContain(summary.granuleId);
  });

  it('classifies nominations correctly', () => {
    const nomination: CrecGranuleSummary = {
      ...summary,
      title: 'Vote on Chavez-DeRemer Nomination',
      subGranuleClass: 'SNOMINATIONS',
    };
    const item = toContentItem(nomination, null);
    expect(item.type).toBe('nomination');
    expect((item.metadata as Record<string, unknown>).crecContentType).toBe('nomination');
  });
});
