import Link from 'next/link';
import { SEOHead } from '@/components/shared/SEOHead';
import { DataTable, Section } from '@/components/system/ContentHelpers';
import { useReadingLevel } from '@/lib/contexts/ReadingLevelContext';
import { GOOD_REPAIR_PHRASE, LEDGER_TAGLINE } from '@/lib/data/charter-copy';
import { ledgerCounts, REVERSAL_KIND_LABELS, REVERSALS_LEDGER } from '@/lib/data/reversals-ledger';
import type { ReversalEntry, ReversalKind } from '@/lib/data/reversals-ledger';

/**
 * /system/reversals (#814): every time the site corrected, reversed, held,
 * or regenerated something it had published. The charter's neutrality is
 * licensed by this page — updated with every release.
 */

const KINDS: ReversalKind[] = ['correction', 'flip', 'hold', 'regeneration', 'audit', 'policy'];

function formatDate(iso: string): string {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });
}

function Intro() {
  return (
    <p>
      This page lists every time the site corrected, reversed, held, or regenerated something it had
      published — with the date, the reason, and the record where each change is documented. It is
      updated with every release. It exists because{' '}
      <Link href="/why-this-matters#charter" className="text-dm-accent hover:underline">
        what this site claims
      </Link>{' '}
      is licensed by conduct: the record changes when it is wrong.
    </p>
  );
}

function EvidenceLinks({ urls }: { urls: string[] }) {
  return (
    <span className="space-x-2">
      {urls.map((u, i) => (
        <a
          key={u}
          href={u}
          target="_blank"
          rel="noopener noreferrer"
          className="text-dm-accent hover:underline whitespace-nowrap"
        >
          {u.includes('#issuecomment-') ? `comment ${i + 1}` : u.replace(/^.*\//, '')}
        </a>
      ))}
    </span>
  );
}

function LedgerRow({ e }: { e: ReversalEntry }) {
  return (
    <tr className="border-b border-dm-border/50 align-top">
      <td className="px-3 py-2 whitespace-nowrap text-dm-text-secondary">{formatDate(e.date)}</td>
      <td className="px-3 py-2 text-dm-text-secondary whitespace-nowrap">
        <span className="text-[11px] uppercase tracking-wide text-dm-muted">
          {REVERSAL_KIND_LABELS[e.kind]}
        </span>
        <div className="text-[11px] text-dm-muted">{e.scope}</div>
      </td>
      <td className="px-3 py-2 text-dm-text-primary">{e.what}</td>
      <td className="px-3 py-2 text-dm-text-secondary whitespace-nowrap">
        {e.count != null ? e.count.toLocaleString() : '—'}
      </td>
      <td className="px-3 py-2 text-dm-text-secondary">{e.why}</td>
      <td className="px-3 py-2 text-dm-text-secondary">
        <EvidenceLinks urls={e.evidence} />
        {e.release && <div className="text-[11px] text-dm-muted">{e.release}</div>}
      </td>
    </tr>
  );
}

function LedgerTable({ entries }: { entries: ReversalEntry[] }) {
  return (
    <div className="overflow-x-auto my-3">
      <table className="w-full text-sm border-collapse">
        <thead>
          <tr>
            {['Date', 'Kind', 'What changed', 'Scale', 'Why', 'Evidence'].map((h) => (
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
          {entries.map((e) => (
            <LedgerRow key={`${e.date}-${e.scope}-${e.what.slice(0, 24)}`} e={e} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** The trust payload is a number (editorial guidance, 2026-08-30): lead the
 *  summary with the totals, computed from the ledger so they cannot go stale. */
function countsLead(counts: Record<ReversalKind, number>): string {
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  const earliest = REVERSALS_LEDGER[REVERSALS_LEDGER.length - 1]?.date ?? '';
  const since = earliest
    ? new Date(earliest + 'T00:00:00Z').toLocaleDateString('en-US', {
        month: 'long',
        year: 'numeric',
        timeZone: 'UTC',
      })
    : '';
  const parts = KINDS.filter((k) => counts[k] > 0).map(
    (k) => `${counts[k]} ${REVERSAL_KIND_LABELS[k].toLowerCase()}${counts[k] === 1 ? '' : 's'}`,
  );
  return `${total} entries since ${since}: ${parts.join(', ')}. Newest first.`;
}

export function SummaryContent() {
  const counts = ledgerCounts(REVERSALS_LEDGER);
  return (
    <>
      <Section title="The record of our own changes" id="overview">
        <p className="text-dm-text-primary">{countsLead(counts)}</p>
        <Intro />
        <DataTable
          headers={['Kind', 'Entries']}
          rows={KINDS.map((k) => [REVERSAL_KIND_LABELS[k], String(counts[k])])}
        />
      </Section>
      <Section title="Most recent" id="recent">
        <LedgerTable entries={REVERSALS_LEDGER.slice(0, 5)} />
        <p className="text-xs text-dm-muted">
          Switch to the detailed reading level for the full ledger.
        </p>
      </Section>
    </>
  );
}

export function DetailedContent() {
  return (
    <>
      <Section title="The record of our own changes" id="overview">
        <Intro />
        <p>
          Kinds: <strong>Correction</strong> — something published was wrong and was changed;{' '}
          <strong>Status changed after repair</strong> — a weekly status moved because the record
          beneath it changed; <strong>Publication held</strong> — the site declined to publish until
          it could count; <strong>Regenerated</strong> — model-written prose was replaced;{' '}
          <strong>Audit</strong> — the instrument was tested and the result published;{' '}
          <strong>Policy</strong> — a decision about how the record is kept.
        </p>
      </Section>
      <Section title="Ledger" id="ledger">
        <LedgerTable entries={REVERSALS_LEDGER} />
      </Section>
    </>
  );
}

export default function ReversalsPage() {
  const { readingLevel } = useReadingLevel();
  return (
    <>
      <SEOHead
        title="Reversals"
        description="Every time Democracy Monitor corrected, reversed, held, or regenerated something it had published — with dates, reasons, and evidence."
        canonicalPath="/system/reversals"
      />
      <Link href="/" className="text-xs text-dm-accent hover:underline">
        &larr; Back to overview
      </Link>
      <h1 className="text-xl font-bold text-dm-text-primary mt-4 mb-1">Reversals</h1>
      <p className="text-sm text-dm-text-secondary mb-6">
        <span className="text-dm-text-primary font-medium">{GOOD_REPAIR_PHRASE}</span>{' '}
        {LEDGER_TAGLINE}
      </p>
      <p className="text-sm text-dm-text-secondary mb-2 max-w-3xl">
        Nothing here is quietly edited. A release that corrects, reverses, holds, or regenerates
        anything adds an entry before it ships.
      </p>
      <p className="text-sm text-dm-text-secondary mb-6 max-w-3xl">
        If you think a reading of a specific document is wrong, dispute it on that document — every
        reviewed document carries the link. Disputes are published once reviewed, and when one
        changes a reading, the change appears here with your objection attached.
      </p>
      <div className="max-w-3xl space-y-2">
        {readingLevel === 'summary' ? <SummaryContent /> : <DetailedContent />}
      </div>
    </>
  );
}
