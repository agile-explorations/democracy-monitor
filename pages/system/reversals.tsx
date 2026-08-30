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
      <td className="px-3 py-2 text-dm-text-secondary">
        <span className="text-[11px] uppercase tracking-wide text-dm-muted">
          {REVERSAL_KIND_LABELS[e.kind]} · {e.scope}
          {e.count != null ? ` · ${e.count.toLocaleString()}` : ''}
        </span>
        <div className="text-dm-text-primary">{e.what}</div>
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
            {['Date', 'What changed', 'Why', 'Evidence'].map((h) => (
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

export function SummaryContent() {
  const counts = ledgerCounts(REVERSALS_LEDGER);
  return (
    <>
      <Section title="The record of our own changes" id="overview">
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
      <div className="max-w-3xl space-y-2">
        {readingLevel === 'summary' ? <SummaryContent /> : <DetailedContent />}
      </div>
    </>
  );
}
