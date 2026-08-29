import Link from 'next/link';
import { READER_AUDITS } from '@/lib/data/reader-audits';
import type { ReaderAuditRecord } from '@/lib/data/reader-audits';

/**
 * Outside-reader audit results (#816), rendered from the committed record
 * beside the era rates. In-progress quarters show one line; scored quarters
 * a small table. Plain numbers, no valence.
 */

const pct = (x: number) => `${(x * 100).toFixed(0)}%`;
const k = (x: number) => x.toFixed(2);

function fmtDate(iso: string): string {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

function ScoredTable({ a }: { a: ReaderAuditRecord }) {
  const r = a.result!;
  const rows = [
    ...r.readers.map((s) => [
      s.reader,
      pct(s.agreeVerdict),
      k(s.kappaVerdict),
      pct(s.agreeDeparture),
      k(s.kappaDeparture),
    ]),
    [
      'Reader vs reader',
      pct(r.interReader.agreeVerdict),
      k(r.interReader.kappaVerdict),
      pct(r.interReader.agreeDeparture),
      k(r.interReader.kappaDeparture),
    ],
  ];
  return (
    <div className="overflow-x-auto my-2">
      <p className="text-sm text-dm-text-secondary mb-1">
        {a.id}: {r.sample} readings, packet issued {fmtDate(a.packetIssued)}, scored{' '}
        {fmtDate(r.scoredAt.slice(0, 10))}. Both readers disagreed with the reviewer on{' '}
        {r.bothDisagree.length} of {r.readers[0].decided}.
      </p>
      <table className="w-full text-sm border-collapse">
        <thead>
          <tr>
            {['Reader', 'Agrees on verdict', 'κ', 'Agrees on departure line', 'κ'].map((h, i) => (
              <th
                key={`${h}-${i}`}
                className="text-left px-3 py-2 border-b border-dm-border text-dm-text-primary font-semibold"
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((cells) => (
            <tr key={cells[0]} className="border-b border-dm-border/50">
              {cells.map((c, i) => (
                <td key={i} className="px-3 py-2">
                  {c}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Prefilled feedback: a question with the reader-audit subject (#816). */
export const READER_INVITE_HREF =
  '/feedback?type=question&prefill=' +
  encodeURIComponent(
    'I would read fifty documents for the reader audit. How I can be reached, and anything about my background you should know:',
  );

export function ReaderAuditPanel() {
  return (
    <div className="my-3 space-y-2">
      {READER_AUDITS.map((a) =>
        a.status === 'scored' && a.result ? (
          <ScoredTable key={a.id} a={a} />
        ) : (
          <div key={a.id} className="space-y-1">
            <p className="text-sm text-dm-text-secondary">
              Outside readers — {a.id}: {a.sample} verdicts, packet issued {fmtDate(a.packetIssued)}
              ; results will appear here.
            </p>
            <p className="text-sm text-dm-text-secondary">
              The {a.id} packet is ready and waiting for its readers. If you would read fifty
              documents and say where the reviewer is wrong,{' '}
              <Link href={READER_INVITE_HREF} className="text-dm-accent hover:underline">
                tell us
              </Link>
              .
            </p>
          </div>
        ),
      )}
      <p className="text-xs text-dm-muted">
        κ (Cohen&apos;s kappa) is agreement corrected for chance: 1 is perfect agreement, 0 is what
        two people guessing would reach. The sample is drawn deterministically from its
        quarter&apos;s seed and the readers are never the site&apos;s builder.
      </p>
    </div>
  );
}
