import Link from 'next/link';

/**
 * Intro block for the search page: what each mode does, plus pointers to the
 * data-source inventory and the feedback page for requesting new sources.
 */
export function SearchModeIntro() {
  return (
    <div className="mb-6">
      <p className="text-sm text-dm-muted mb-2">
        <span className="font-semibold text-dm-text-secondary">Research</span> answers a question —
        it finds the most relevant documents across the record and writes a sourced summary with
        verified quotes. <span className="font-semibold text-dm-text-secondary">Explore</span> is a
        direct document search — filter by category, source, date, and score, and page through the
        results yourself.
      </p>
      <p className="text-sm text-dm-muted mb-3">
        Every result comes from primary government sources, and we are continually adding new ones.
        Missing a source you rely on? Tell us and we&rsquo;ll look into indexing it.
      </p>
      <div className="flex flex-wrap gap-2">
        <Link
          href="/system/methodology#data-sources"
          className="shrink-0 px-3 py-1.5 rounded-md bg-dm-accent/10 border border-dm-accent/20 text-xs font-medium text-dm-accent hover:bg-dm-accent/20 hover:border-dm-accent/40 transition-colors"
        >
          What sources do we index? &rarr;
        </Link>
        <Link
          href="/feedback"
          className="shrink-0 px-3 py-1.5 rounded-md bg-dm-accent/10 border border-dm-accent/20 text-xs font-medium text-dm-accent hover:bg-dm-accent/20 hover:border-dm-accent/40 transition-colors"
        >
          Suggest a data source &rarr;
        </Link>
      </div>
    </div>
  );
}
