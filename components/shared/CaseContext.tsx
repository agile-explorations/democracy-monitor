import { useState } from 'react';
import { Chevron } from '@/components/ui/Chevron';
import { DOCKET_EVENT_TIPS, explainDocketLabel } from '@/lib/data/docket-glossary';
import { useCaseTimeline } from '@/lib/hooks/useCaseTimeline';

/**
 * Docket-context disclosure for CourtListener opinions (#688): a one-line
 * case posture (auto-loaded when autoPosture) plus a click-to-expand docket
 * timeline fetched lazily from /api/case/timeline. Renders nothing without a
 * valid cl:<docketId> case id. Timeline data comes live from CourtListener —
 * the "Docket as of" stamp reports the fetch time of the cached payload.
 */

const MAX_DISPLAY_ENTRIES = 15;
const CASE_ID_PATTERN = /^cl:\d+$/;

function formatAsOf(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export function CaseContext({
  caseId,
  autoPosture = false,
}: {
  caseId?: string | null;
  autoPosture?: boolean;
}) {
  const valid = typeof caseId === 'string' && CASE_ID_PATTERN.test(caseId);
  const [open, setOpen] = useState(false);
  const { timeline, status, load } = useCaseTimeline(valid ? caseId : null, {
    auto: autoPosture && valid,
  });

  if (!valid) return null;

  const toggle = () => {
    const next = !open;
    setOpen(next);
    if (next && status === 'idle') load();
  };

  return (
    <div className="mt-1.5 text-xs">
      {autoPosture && timeline?.posture && (
        <p
          className="text-dm-muted italic mb-1 cursor-help"
          title={explainDocketLabel(timeline.posture.line, timeline.posture.eventType)}
        >
          {timeline.posture.line}
        </p>
      )}
      <button
        onClick={toggle}
        className="inline-flex items-center gap-1 text-[11px] text-dm-text-secondary hover:text-dm-text-primary transition-colors"
      >
        <Chevron open={open} className="w-3 h-3" />
        {open ? 'Hide docket timeline' : 'View docket timeline'}
      </button>
      {open && (
        <div className="mt-2 rounded border border-dm-border/50 bg-dm-bg/50 p-2.5">
          {status === 'loading' && <p className="text-dm-muted">Loading docket…</p>}
          {status === 'error' && <p className="text-dm-muted">Docket timeline unavailable</p>}
          {status === 'ready' && timeline && (
            <>
              {timeline.entries.length === 0 ? (
                <p className="text-dm-muted">No docket entries available</p>
              ) : (
                <ul className="space-y-1">
                  {timeline.entries.slice(0, MAX_DISPLAY_ENTRIES).map((entry, i) => (
                    <li
                      key={`${entry.date}-${entry.entryNumber ?? i}`}
                      className="flex gap-2 cursor-help"
                      title={explainDocketLabel(entry.label, entry.eventType)}
                    >
                      <span className="text-dm-muted whitespace-nowrap">{entry.date}</span>
                      {entry.eventType !== 'other' && (
                        <span
                          className="px-1 rounded bg-dm-border/50 text-dm-muted whitespace-nowrap"
                          title={DOCKET_EVENT_TIPS[entry.eventType]}
                        >
                          {entry.eventType}
                        </span>
                      )}
                      <span className="text-dm-text-secondary">{entry.label}</span>
                    </li>
                  ))}
                </ul>
              )}
              {(timeline.truncated || timeline.entries.length > MAX_DISPLAY_ENTRIES) && (
                <p className="text-dm-muted mt-1.5">Earlier entries on CourtListener</p>
              )}
              <p className="text-[10px] text-dm-muted mt-2 pt-1.5 border-t border-dm-border/50">
                Docket as of {formatAsOf(timeline.asOf)} ·{' '}
                <a
                  href={timeline.docketUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-dm-accent hover:underline"
                >
                  Full docket on CourtListener
                </a>
              </p>
            </>
          )}
        </div>
      )}
    </div>
  );
}
