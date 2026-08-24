import { describe, expect, it } from 'vitest';
import { caseNameMatchesPerson, isCriminalDocketCandidate } from '@/lib/services/docket-discovery';

describe('isCriminalDocketCandidate (#761)', () => {
  it('accepts current-term criminal docket numbers', () => {
    expect(
      isCriminalDocketCandidate({ docketNumber: '1:25-cr-00272', dateFiled: '2025-09-25' }),
    ).toBe(true);
    expect(
      isCriminalDocketCandidate({ docketNumber: '2:25-CR-00466', dateFiled: '2025-06-10' }),
    ).toBe(true);
  });

  it('rejects civil dockets even when recent', () => {
    expect(
      isCriminalDocketCandidate({ docketNumber: '1:25-cv-01234', dateFiled: '2025-09-25' }),
    ).toBe(false);
    expect(isCriminalDocketCandidate({ docketNumber: '25-1234', dateFiled: '2025-09-25' })).toBe(
      false,
    );
  });

  it('rejects pre-inauguration filings (prior-term prosecutions)', () => {
    expect(
      isCriminalDocketCandidate({ docketNumber: '1:23-cr-00257', dateFiled: '2023-08-01' }),
    ).toBe(false);
  });

  it('rejects missing fields', () => {
    expect(isCriminalDocketCandidate({ docketNumber: null, dateFiled: '2025-09-25' })).toBe(false);
    expect(isCriminalDocketCandidate({ docketNumber: '1:25-cr-00272', dateFiled: null })).toBe(
      false,
    );
  });
});

describe('caseNameMatchesPerson (#777 discovery guard)', () => {
  it('accepts when the surname appears in the caption', () => {
    expect(caseNameMatchesPerson('United States v. Comey', 'James B. Comey')).toBe(true);
    expect(caseNameMatchesPerson('United States v. Comey', 'Jack Smith')).toBe(false);
  });

  it('rejects the measured junk-entity case', () => {
    expect(caseNameMatchesPerson('United States v. De La Cruz-Lopez', 'Image Jose')).toBe(false);
  });

  it('rejects when no usable name token exists', () => {
    expect(caseNameMatchesPerson('United States v. Doe', 'A B')).toBe(false);
  });
});
