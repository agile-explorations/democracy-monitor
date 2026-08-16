import Link from 'next/link';
import type { SearchMode } from '@/components/search/types';

/** Collapsible usage tips under the search box, specific to the active mode:
 *  Research tips teach question patterns its retrieval rewards; Explore tips
 *  teach keyword phrasing and the filter controls. */
export function SearchTips({ mode }: { mode: SearchMode }) {
  return mode === 'research' ? <ResearchTips /> : <ExploreTips />;
}

function TipsDisclosure({ summary, children }: { summary: string; children: React.ReactNode }) {
  return (
    <details className="mb-4 -mt-2">
      <summary className="text-xs text-dm-muted cursor-pointer hover:text-dm-text-secondary">
        {summary}
      </summary>
      {children}
    </details>
  );
}

function ResearchTips() {
  return (
    <TipsDisclosure summary="Tips for questions that get good results">
      <ul className="mt-1.5 ml-4 space-y-0.5 text-xs text-dm-text-secondary list-disc">
        <li>
          Ask for documents, not abstractions: name the kind and a subject — &ldquo;court opinions
          on removal power&rdquo; beats &ldquo;documents about judicial review&rdquo;. For floor
          speeches and hearings, also click Commentary &amp; debate — naming the kind in the
          question is a hint, the filter is a guarantee.
        </li>
        <li>
          Name the administrations you want compared (&ldquo;under Biden vs the second Trump
          administration&rdquo;) — results are then retrieved evenly from each era.
        </li>
        <li>
          &ldquo;Since January 2025&rdquo; and similar phrases set the date range automatically — or
          use the Period control for exact dates.
        </li>
        <li>
          Looking only for official actions, or only for reactions? Use the filters above —
          Government actions (orders, rules, opinions, bills) or Commentary &amp; debate (floor
          speeches, hearings, debate).
        </li>
      </ul>
      <p className="mt-2 ml-1 text-xs font-medium text-dm-text-secondary">
        What you&apos;ll see in results:
      </p>
      <ul className="mt-1 ml-4 space-y-0.5 text-xs text-dm-text-secondary list-disc">
        <li>
          <strong>&ldquo;Also searched&rdquo; chips</strong> — the search expands your wording into
          the record&apos;s own terms (order numbers, statutory phrases, era renamings), keeping
          only terms verified to appear in the corpus. The chips disclose exactly what was searched.
        </li>
        <li>
          <strong>Matched passages</strong> — verbatim excerpts showing where a document matched,
          even when the match sits deep inside a long record.
        </li>
        <li>
          <strong>Quote verification</strong> — after each answer, every quoted passage is
          machine-checked verbatim against the stored document text; a caution appears if any quote
          could not be matched. Details on the{' '}
          <Link
            href="/system/methodology#research-answers"
            className="text-dm-accent hover:underline"
          >
            methodology page
          </Link>
          .
        </li>
      </ul>
    </TipsDisclosure>
  );
}

function ExploreTips() {
  return (
    <TipsDisclosure summary="Tips for exploring the document library">
      <ul className="mt-1.5 ml-4 space-y-0.5 text-xs text-dm-text-secondary list-disc">
        <li>
          Short phrases work best — &ldquo;Schedule F&rdquo;, &ldquo;inspector general
          removal&rdquo;, &ldquo;detention standards&rdquo;. The search matches meaning as well as
          exact words, so plain language finds related wording too.
        </li>
        <li>
          Narrow with the filters below: one of the 14 categories, a single source (Federal
          Register, court dockets, DOJ, inspectors general, congressional records, and more), or
          both.
        </li>
        <li>
          Sort by <strong>Relevance</strong> for the best matches, <strong>Date</strong> for the
          newest documents, or <strong>Score</strong> to surface the documents our assessment
          weighted most heavily.
        </li>
        <li>Use the Period control to limit results to an exact date range.</li>
      </ul>
      <p className="mt-2 ml-1 text-xs font-medium text-dm-text-secondary">
        What you&apos;ll see in results:
      </p>
      <ul className="mt-1 ml-4 space-y-0.5 text-xs text-dm-text-secondary list-disc">
        <li>
          <strong>&ldquo;Also searched&rdquo; chips</strong> — your wording is expanded into the
          record&apos;s own terms (order numbers, statutory phrases, era renamings), keeping only
          terms verified to appear in the corpus.
        </li>
        <li>
          <strong>Matched passages</strong> — verbatim excerpts showing where a document matched,
          even deep inside a long record.
        </li>
        <li>
          <strong>Relevance and scores</strong> — each document shows its match strength plus the
          category scores and AI review notes from our{' '}
          <Link href="/system/methodology" className="text-dm-accent hover:underline">
            weekly assessment
          </Link>
          .
        </li>
      </ul>
    </TipsDisclosure>
  );
}
