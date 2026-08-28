import { useEffect, useState } from 'react';
import type { VerdictRatesReport } from '@/lib/services/verdict-rates';

/**
 * Era-sliced AI-verdict rates (#772): the same two-pass review applied to
 * every analysis period, side by side. Client-fetched (the methodology page
 * is otherwise static); a fetch failure renders a one-line note rather than
 * an empty table so the section never silently loses its numbers.
 */

const pct = (x: number) => `${(x * 100).toFixed(1)}%`;

export function VerdictRatesTable() {
  const [report, setReport] = useState<VerdictRatesReport | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const res = await fetch('/api/methodology/verdict-rates');
        if (!res.ok) throw new Error(`${res.status}`);
        const data = (await res.json()) as VerdictRatesReport;
        if (!cancelled) setReport(data);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'failed');
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  if (error) {
    return (
      <p className="text-xs text-dm-muted">
        Era rates are temporarily unavailable ({error}); the figures are served by{' '}
        <code>/api/methodology/verdict-rates</code>.
      </p>
    );
  }
  if (!report) return <p className="text-xs text-dm-muted">Loading era rates…</p>;

  return (
    <div className="overflow-x-auto my-3">
      <table className="w-full text-sm border-collapse">
        <thead>
          <tr>
            {[
              'Era',
              'Documents',
              'Pass 1 flagged',
              'Pass 2 reviews',
              'Departure (possible + clear)',
              'Clear departure',
              'Audit-sample miss rate',
            ].map((h) => (
              <th
                key={h}
                className="text-left px-3 py-2 border-b border-dm-border text-dm-text-primary font-semibold"
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {report.eras.map((e) => (
            <tr key={e.era} className="border-b border-dm-border/50">
              <td className="px-3 py-2 text-dm-text-primary">{e.label}</td>
              <td className="px-3 py-2">{e.documents.toLocaleString()}</td>
              <td className="px-3 py-2">{pct(e.pass1FlagRate)}</td>
              <td className="px-3 py-2">{e.pass2Reviews.toLocaleString()}</td>
              <td className="px-3 py-2">{pct(e.pass2DepartureRate)}</td>
              <td className="px-3 py-2">{pct(e.pass2ClearDepartureRate)}</td>
              <td className="px-3 py-2">
                {e.auditSamples > 0 ? `${pct(e.auditMissRate)} (n=${e.auditSamples})` : '—'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="text-xs text-dm-muted mt-1">
        Computed {report.computedAt.slice(0, 10)} from the stored assessments; refreshed daily.
      </p>
    </div>
  );
}
