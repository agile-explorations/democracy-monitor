import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CaseContext } from '@/components/shared/CaseContext';
import { resetCaseTimelineCache } from '@/lib/hooks/useCaseTimeline';

const timeline = {
  caseId: 'cl:123',
  docketUrl: 'https://www.courtlistener.com/docket/123/',
  asOf: '2026-08-09T12:00:00Z',
  entries: [
    {
      date: '2026-07-20',
      entryNumber: 54,
      label: 'Stipulation of Dismissal',
      eventType: 'dismissal',
    },
    { date: '2026-07-02', entryNumber: 53, label: 'Response to Motion', eventType: 'motion' },
  ],
  posture: {
    line: 'Case terminated 2026-07-20 — stipulation of dismissal',
    eventType: 'dismissal',
    date: '2026-07-20',
  },
  truncated: true,
};

describe('CaseContext', () => {
  beforeEach(() => {
    resetCaseTimelineCache();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => timeline }));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('renders nothing without a valid cl: caseId', () => {
    const { container: none } = render(<CaseContext caseId={null} />);
    expect(none.innerHTML).toBe('');
    const { container: bad } = render(<CaseContext caseId="usdc:5" />);
    expect(bad.innerHTML).toBe('');
  });

  it('expands to loading then entries with the as-of stamp and truncation note', async () => {
    render(<CaseContext caseId="cl:123" />);
    fireEvent.click(screen.getByText('View docket timeline'));
    await waitFor(() => expect(screen.getByText('Stipulation of Dismissal')).toBeTruthy());
    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(screen.getByText(/Docket as of/)).toBeTruthy();
    expect(screen.getByText('Earlier entries on CourtListener')).toBeTruthy();
    expect(screen.getByText('Full docket on CourtListener').getAttribute('href')).toBe(
      'https://www.courtlistener.com/docket/123/',
    );
  });

  it('shows the unavailable state on API failure', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false }));
    render(<CaseContext caseId="cl:123" />);
    fireEvent.click(screen.getByText('View docket timeline'));
    await waitFor(() => expect(screen.getByText('Docket timeline unavailable')).toBeTruthy());
  });

  it('autoPosture renders the posture sentence without interaction', async () => {
    render(<CaseContext caseId="cl:123" autoPosture />);
    await waitFor(() =>
      expect(
        screen.getByText('Case terminated 2026-07-20 — stipulation of dismissal'),
      ).toBeTruthy(),
    );
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });
});
