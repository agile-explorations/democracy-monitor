import type { ResearchResult } from './types';

/** Deterministic quote-check result (#707): quotes matched against stored
 *  source content — a green line when all verify; the amber caution lists
 *  the exact unverified quotes with citation links (#713). */
export function QuoteVerificationBadge({
  verification,
}: {
  verification?: ResearchResult['quoteVerification'];
}) {
  if (!verification || verification.totalQuotes === 0) return null;
  if (verification.unverified.length === 0) {
    return (
      <p
        className="mt-3 text-[11px] text-emerald-500"
        title="Every quoted passage in the answer was string-matched against the full stored text of its cited document."
      >
        ✓ All {verification.totalQuotes} quoted passage
        {verification.totalQuotes !== 1 ? 's' : ''} verified verbatim against the source documents.
      </p>
    );
  }
  return (
    <div className="mt-3">
      <p
        className="text-[11px] text-amber-500"
        title="Quoted passages are string-matched against the full stored text of their cited documents; at least one could not be found verbatim."
      >
        ⚠ {verification.unverified.length} of {verification.totalQuotes} quoted passage
        {verification.totalQuotes !== 1 ? 's' : ''} could not be verified verbatim against the
        source documents — treat quoted wording with caution:
      </p>
      <ul className="mt-1 space-y-1 pl-4">
        {verification.unverified.map((u, i) => (
          <li key={i} className="text-[11px] text-amber-500/90 list-disc">
            <span className="text-dm-muted">Answer quotes:</span> &ldquo;
            {u.quote.length > 120 ? `${u.quote.slice(0, 120)}…` : u.quote}&rdquo;
            {u.citations.map((n) => (
              <a
                key={n}
                href={`#cite-${n}`}
                className="ml-1 text-dm-accent hover:underline font-medium"
              >
                [{n}]
              </a>
            ))}
            {u.foundIn != null && (
              <span className="block text-dm-text-secondary/90">
                <span className="text-dm-muted">
                  This quote is verbatim from a different source — the citation points to the wrong
                  document; see
                </span>{' '}
                <a href={`#cite-${u.foundIn}`} className="text-dm-accent hover:underline">
                  [{u.foundIn}]
                </a>
                .
              </span>
            )}
            {u.nearest && (
              <span className="block text-dm-text-secondary/90">
                <span className="text-dm-muted">Document reads:</span> &ldquo;…
                {u.nearest.text.length > 180 ? `${u.nearest.text.slice(0, 180)}…` : u.nearest.text}
                …&rdquo;{' '}
                <a href={`#cite-${u.nearest.citation}`} className="text-dm-accent hover:underline">
                  see [{u.nearest.citation}]
                </a>
              </span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
