import { describe, expect, it } from 'vitest';
import {
  buildCaseTimeline,
  classifyDocketEntry,
  derivePosture,
  entryLabel,
  parseCaseId,
} from '@/lib/services/docket-timeline';
import type { TimelineEntry } from '@/lib/services/docket-timeline';

describe('parseCaseId', () => {
  it('accepts cl:<digits>', () => {
    expect(parseCaseId('cl:123')).toBe(123);
    expect(parseCaseId('cl:63242003')).toBe(63242003);
  });

  it('rejects everything else', () => {
    expect(parseCaseId('cl:')).toBeNull();
    expect(parseCaseId('cl:12a')).toBeNull();
    expect(parseCaseId('usdc:5')).toBeNull();
    expect(parseCaseId('cl:12345678901')).toBeNull();
    expect(parseCaseId('CL:123')).toBeNull();
  });
});

describe('entryLabel', () => {
  it('prefers the entry description', () => {
    expect(
      entryLabel({ date_filed: '2026-01-01', entry_number: 5, description: ' Order  Adopting ' }),
    ).toBe('Order Adopting');
  });

  it('falls back to the attached document description (live-probe case)', () => {
    expect(
      entryLabel({
        date_filed: '2025-06-20',
        entry_number: 76,
        description: '',
        recap_documents: [{ description: 'Judgment - Clerk' }],
      }),
    ).toBe('Judgment - Clerk');
  });

  it('falls back to Entry N', () => {
    expect(entryLabel({ date_filed: '2026-01-01', entry_number: 9, description: null })).toBe(
      'Entry 9',
    );
  });
});

// Fixtures from the 2026-08-09 live probe of CL v4 docket-entries.
describe('classifyDocketEntry', () => {
  it.each([
    ["ORDER ADOPTING MAGISTRATE JUDGE'S FINDINGS AND RECOMMENDATION re 74", 'order'],
    ['FINDINGS AND RECOMMENDATION TO DISMISS COMPLAINT WITH PREJUDICE', 'dismissal'],
    ['Stipulation of Dismissal', 'dismissal'],
    ['Terminate Case - Notice Attorneys', 'termination'],
    ['Judgment - Clerk', 'judgment'],
    ['Order on Motion for Summary Judgment', 'order'],
    ['REPLY BRIEF in Support filed re 30 MOTION for Summary Judgment', 'motion'],
    ['Default Judgment entered against defendant', 'judgment'],
    ['Response to Motion', 'motion'],
    ['Answer to Prisoner Complaint', 'complaint'],
    ['Notice of Hearing', 'hearing'],
    ['Scheduling Conference', 'hearing'],
    ['Notice of Appeal', 'appeal'],
    ['Status Report', 'other'],
  ])('%s → %s', (label, expected) => {
    expect(classifyDocketEntry(label)).toBe(expected);
  });
});

const entry = (over: Partial<TimelineEntry>): TimelineEntry => ({
  date: '2026-07-01',
  entryNumber: 1,
  label: 'Something',
  eventType: 'other',
  ...over,
});

describe('derivePosture', () => {
  it('terminal event wins: termination phrasing', () => {
    const posture = derivePosture([
      entry({ date: '2026-07-20', label: 'Stipulation of Dismissal', eventType: 'dismissal' }),
      entry({ date: '2026-07-02', label: 'Response to Motion', eventType: 'motion' }),
    ]);
    expect(posture?.line).toBe('Case terminated 2026-07-20 — stipulation of dismissal');
    expect(posture?.eventType).toBe('dismissal');
  });

  it('judgment gets its own phrasing', () => {
    const posture = derivePosture([
      entry({ date: '2026-06-20', label: 'Judgment - Clerk', eventType: 'judgment' }),
    ]);
    expect(posture?.line).toBe('Judgment entered 2026-06-20');
  });

  it('latest order + latest-activity suffix when dates differ', () => {
    const posture = derivePosture([
      entry({ date: '2026-07-02', label: 'Status Report', eventType: 'other' }),
      entry({ date: '2026-01-29', label: 'Order on Motion for Leave to File', eventType: 'order' }),
    ]);
    expect(posture?.line).toBe(
      'Order on Motion for Leave to File 2026-01-29; latest activity 2026-07-02',
    );
  });

  it('omits the suffix when the significant event IS the latest activity', () => {
    const posture = derivePosture([
      entry({ date: '2026-07-02', label: 'Order Referring Case', eventType: 'order' }),
      entry({ date: '2026-06-01', label: 'Clarify', eventType: 'other' }),
    ]);
    expect(posture?.line).toBe('Order Referring Case 2026-07-02');
  });

  it('bare latest activity when nothing significant', () => {
    const posture = derivePosture([
      entry({ date: '2026-05-05', label: 'Clarify', eventType: 'other' }),
    ]);
    expect(posture?.line).toBe('Latest docket activity 2026-05-05');
  });

  it('null for empty entries', () => {
    expect(derivePosture([])).toBeNull();
  });
});

describe('buildCaseTimeline', () => {
  it('assembles entries, posture, docket URL, and the truncation flag', () => {
    const timeline = buildCaseTimeline(
      'cl:63242003',
      63242003,
      {
        results: [
          {
            date_filed: '2025-06-20',
            entry_number: 76,
            description: '',
            recap_documents: [{ description: 'Judgment - Clerk' }],
          },
          {
            date_filed: '2025-06-02',
            entry_number: 74,
            description: 'FINDINGS AND RECOMMENDATION TO DISMISS COMPLAINT',
          },
          { date_filed: null, entry_number: 99, description: 'undated noise' },
        ],
        hasMore: true,
      },
      '2026-08-09T21:00:00Z',
    );
    expect(timeline.entries).toHaveLength(2);
    expect(timeline.entries[0]).toMatchObject({
      date: '2025-06-20',
      label: 'Judgment - Clerk',
      eventType: 'judgment',
    });
    expect(timeline.posture?.line).toBe('Judgment entered 2025-06-20');
    expect(timeline.docketUrl).toBe('https://www.courtlistener.com/docket/63242003/');
    expect(timeline.truncated).toBe(true);
    expect(timeline.asOf).toBe('2026-08-09T21:00:00Z');
  });
});

describe('explainDocketLabel (glossary)', () => {
  it('composes event tip + matched term definitions', async () => {
    const { explainDocketLabel } = await import('@/lib/data/docket-glossary');
    const tip = explainDocketLabel('PER CURIAM JUDGMENT entered', 'judgment');
    expect(tip).toContain("The court's final decision");
    expect(tip).toContain('unsigned ruling issued by the court as a whole');
  });

  it('longest phrase wins over contained terms', async () => {
    const { explainDocketLabel } = await import('@/lib/data/docket-glossary');
    const tip = explainDocketLabel('Order on Motion for Summary Judgment', 'order');
    expect(tip).toContain('without trial because the key facts');
    expect(tip).not.toContain('"judgment":');
  });

  it('falls back to the event tip alone when no terms match', async () => {
    const { explainDocketLabel } = await import('@/lib/data/docket-glossary');
    expect(explainDocketLabel('Status Report', 'other')).toBe('A procedural docket event');
  });
});
