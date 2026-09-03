import { describe, expect, it } from 'vitest';
import { crecActionSubtype, tierForDocument } from '@/lib/data/document-tiers';

describe('crecActionSubtype (#841)', () => {
  it('identifies resolution text', () => {
    expect(crecActionSubtype('SENATE RESOLUTION 663--HONORING THE SERVICE AND SACRIFICE')).toBe(
      'resolution_text',
    );
    expect(crecActionSubtype('HOUSE JOINT RESOLUTION 12--PROPOSING AN AMENDMENT')).toBe(
      'resolution_text',
    );
  });

  it('identifies appropriations and explanatory text', () => {
    expect(crecActionSubtype('DEPARTMENT OF HOMELAND SECURITY APPROPRIATIONS ACT, 2026')).toBe(
      'appropriations_text',
    );
    expect(crecActionSubtype('TITLE II--ADMINISTRATIVE PROVISIONS')).toBe('appropriations_text');
    expect(
      crecActionSubtype('EXPLANATORY STATEMENT SUBMITTED BY MR. COLE, CHAIR OF THE HOUSE'),
    ).toBe('explanatory_statement');
  });

  it('identifies presidential messages read into the record', () => {
    expect(
      crecActionSubtype(
        'REPORT OF THE CONTINUATION OF THE NATIONAL EMERGENCIES ORIGINALLY DECLARED IN PROCLAMATION 10886',
      ),
    ).toBe('presidential_message');
    expect(
      crecActionSubtype(
        'DESIGNATION OF CHRISTIAN SCHRANK AS ACTING INSPECTOR GENERAL OF THE FEDERAL HOUSING FINANCE AGENCY--MESSAGE FROM THE PRESIDENT OF THE UNITED STATES',
      ),
    ).toBe('presidential_message');
    expect(crecActionSubtype('REPORT TO ADVISE THAT HE IS EXERCISING HIS AUTHORITY--PM 30')).toBe(
      'presidential_message',
    );
  });

  it('identifies committee-report text', () => {
    expect(crecActionSubtype('REPORT ON RESOLUTION PROVIDING FOR CONSIDERATION OF H.R. 2500')).toBe(
      'committee_report_text',
    );
    expect(
      crecActionSubtype('CONFERENCE REPORT AND EXPLANATORY MATERIAL STATEMENT ON S. 1790'),
    ).toBe('committee_report_text');
  });

  it('NEVER promotes speeches — including ones whose speaker extraction failed', () => {
    expect(crecActionSubtype("ICE'S TERRORIZATION ACROSS AMERICA")).toBeNull();
    expect(crecActionSubtype('DENOUNCING THE ACTIONS OF ICE')).toBeNull();
    expect(crecActionSubtype('HOLDING ICE ACCOUNTABLE')).toBeNull();
    expect(
      crecActionSubtype('Immigration and Customs Enforcement (Executive Calendar)'),
    ).toBeNull();
  });

  it('leaves procedural record chrome unpromoted', () => {
    expect(crecActionSubtype('EXECUTIVE AND OTHER COMMUNICATIONS')).toBeNull();
    expect(crecActionSubtype('REPORTS OF COMMITTEES ON PUBLIC BILLS AND RESOLUTIONS')).toBeNull();
    expect(crecActionSubtype('MESSAGE FROM THE HOUSE')).toBeNull();
  });
});

describe('tierForDocument (#841 override)', () => {
  it('override wins in both directions; NULL derives from source_type', () => {
    expect(tierForDocument({ sourceType: 'floor_speech', evidenceTier: 'action' })).toBe('action');
    expect(tierForDocument({ sourceType: 'executive_order', evidenceTier: 'discussion' })).toBe(
      'discussion',
    );
    expect(tierForDocument({ sourceType: 'floor_speech', evidenceTier: null })).toBe('discussion');
    expect(tierForDocument({ sourceType: 'executive_order' })).toBe('action');
  });
});
