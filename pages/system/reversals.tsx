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
      <Link href="/charter" className="text-dm-accent hover:underline">
        what this site claims
      </Link>{' '}
      is licensed by conduct: the record changes when it is wrong.
    </p>
  );
}

/** Label each evidence link the way GitHub does: issues as "#832", comments
 *  as "#833 comment" with a per-issue ordinal when one issue carries several.
 *  Non-issue links (the DECISIONS files, also on GitHub) keep their filename. */
export function evidenceLabels(urls: string[]): string[] {
  const commentOrdinals = new Map<string, number>();
  return urls.map((u) => {
    const issue = u.match(/\/issues\/(\d+)/)?.[1];
    if (!issue) return u.replace(/^.*\//, '');
    if (!u.includes('#issuecomment-')) return `#${issue}`;
    const ordinal = (commentOrdinals.get(issue) ?? 0) + 1;
    commentOrdinals.set(issue, ordinal);
    const several = urls.filter((o) => o.includes(`/issues/${issue}#issuecomment-`)).length > 1;
    return several ? `#${issue} comment ${ordinal}` : `#${issue} comment`;
  });
}

function EvidenceLinks({ urls }: { urls: string[] }) {
  const labels = evidenceLabels(urls);
  // Rendered as flex items so the row can wrap BETWEEN links — adjacent
  // inline links with margin spacing have no whitespace to break at and
  // overflow narrow viewports as one unbreakable run.
  // Separator rides inside the preceding link's nowrap group, so wrapped
  // lines end with a separator instead of starting with an orphaned one.
  return (
    <>
      {urls.map((u, i) => (
        <span key={u} className="whitespace-nowrap">
          <a
            href={u}
            target="_blank"
            rel="noopener noreferrer"
            className="text-dm-accent hover:underline"
          >
            {labels[i]}
          </a>
          {i < urls.length - 1 && <span className="text-dm-muted ml-2">·</span>}
        </span>
      ))}
    </>
  );
}

/** Small uppercase label used above each prose block and inline chips. */
function FieldLabel({ children }: { children: string }) {
  return <span className="text-[11px] uppercase tracking-wide text-dm-muted">{children}</span>;
}

/** One ledger entry as a block: header line, then What/Why side by side on
 *  wider screens and stacked on narrow ones, evidence links beneath. A
 *  six-column table cannot fit two prose paragraphs inside the page's
 *  max-w-3xl at any tuning — the entry-block layout never overflows and
 *  never needs a horizontal scroll. */
function LedgerEntry({ e }: { e: ReversalEntry }) {
  return (
    <article className="border-b border-dm-border/50 py-4">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
        <span className="text-sm text-dm-text-primary font-medium whitespace-nowrap">
          {formatDate(e.date)}
        </span>
        <FieldLabel>{REVERSAL_KIND_LABELS[e.kind]}</FieldLabel>
        <span className="text-[11px] text-dm-muted">{e.scope}</span>
        {e.count != null && (
          <span className="text-[11px] text-dm-muted whitespace-nowrap">
            scale {e.count.toLocaleString()}
          </span>
        )}
        {e.release && <span className="text-[11px] text-dm-muted">{e.release}</span>}
      </div>
      <div className="mt-2 grid gap-x-8 gap-y-3 sm:grid-cols-2">
        <div>
          <div className="mb-1">
            <FieldLabel>What changed</FieldLabel>
          </div>
          <p className="text-sm text-dm-text-primary">{e.what}</p>
        </div>
        <div>
          <div className="mb-1">
            <FieldLabel>Why</FieldLabel>
          </div>
          <p className="text-sm text-dm-text-secondary">{e.why}</p>
        </div>
      </div>
      <div className="mt-2 flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
        <FieldLabel>Evidence (in GitHub issues)</FieldLabel>
        <EvidenceLinks urls={e.evidence} />
      </div>
    </article>
  );
}

function LedgerList({ entries }: { entries: ReversalEntry[] }) {
  return (
    <div className="my-3">
      {entries.map((e) => (
        <LedgerEntry key={`${e.date}-${e.scope}-${e.what.slice(0, 24)}`} e={e} />
      ))}
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
        <Intro />
        <DataTable
          headers={['Kind', 'Entries']}
          rows={KINDS.map((k) => [REVERSAL_KIND_LABELS[k], String(counts[k])])}
        />
      </Section>
      <Section title="Most recent" id="recent">
        <LedgerList entries={REVERSALS_LEDGER.slice(0, 5)} />
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
        <LedgerList entries={REVERSALS_LEDGER} />
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
      <p className="text-sm text-dm-text-primary mb-2 max-w-3xl">
        {countsLead(ledgerCounts(REVERSALS_LEDGER))}
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
