import { describe, expect, it } from 'vitest';
import { detectSilenceAlerts } from '@/lib/services/coverage-health';
import type { SourceCoverageStatus } from '@/lib/services/coverage-health';

function makeStatus(overrides: Partial<SourceCoverageStatus> = {}): SourceCoverageStatus {
  return {
    sourceOrigin: 'federal_register',
    category: 'civilService',
    docCountThisWeek: 10,
    lastDocumentAt: new Date().toISOString(),
    daysSinceLastDoc: 0,
    expectedCadenceDays: 1,
    isSilent: false,
    ...overrides,
  };
}

describe('detectSilenceAlerts', () => {
  it('flags sources exceeding 2x expected cadence', () => {
    const coverage: SourceCoverageStatus[] = [
      makeStatus({ sourceOrigin: 'federal_register', daysSinceLastDoc: 3, isSilent: true }),
      makeStatus({ sourceOrigin: 'courtlistener', daysSinceLastDoc: 1, isSilent: false }),
    ];

    const alerts = detectSilenceAlerts(coverage);
    expect(alerts).toHaveLength(1);
    expect(alerts[0].sourceOrigin).toBe('federal_register');
  });

  it('returns empty when all sources are active', () => {
    const coverage: SourceCoverageStatus[] = [
      makeStatus({ isSilent: false }),
      makeStatus({ sourceOrigin: 'doj', isSilent: false }),
    ];

    expect(detectSilenceAlerts(coverage)).toHaveLength(0);
  });

  it('flags sources with null lastDocumentAt as silent', () => {
    const coverage: SourceCoverageStatus[] = [
      makeStatus({
        sourceOrigin: 'courtlistener',
        lastDocumentAt: null,
        daysSinceLastDoc: Infinity,
        isSilent: true,
      }),
    ];

    const alerts = detectSilenceAlerts(coverage);
    expect(alerts).toHaveLength(1);
  });

  it('returns all silent sources when multiple are silent', () => {
    const coverage: SourceCoverageStatus[] = [
      makeStatus({ sourceOrigin: 'federal_register', isSilent: true }),
      makeStatus({ sourceOrigin: 'doj', isSilent: true }),
      makeStatus({ sourceOrigin: 'courtlistener', isSilent: false }),
    ];

    const alerts = detectSilenceAlerts(coverage);
    expect(alerts).toHaveLength(2);
  });

  it('returns empty for empty input', () => {
    expect(detectSilenceAlerts([])).toHaveLength(0);
  });

  it('preserves category and expectedCadenceDays in output', () => {
    const coverage: SourceCoverageStatus[] = [
      makeStatus({
        sourceOrigin: 'gdelt',
        category: 'military',
        expectedCadenceDays: 1,
        daysSinceLastDoc: 5,
        isSilent: true,
      }),
    ];

    const alerts = detectSilenceAlerts(coverage);
    expect(alerts[0].category).toBe('military');
    expect(alerts[0].expectedCadenceDays).toBe(1);
  });
});
