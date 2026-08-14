import { useCallback } from 'react';

/** Everything a ?debug=1 search run captured (#718): the docsOnly payload
 *  with its trace, the synthesis prompt from the stream, and the final
 *  client-side result state. Assembled by pages/search.tsx. */
export interface SearchDebugCapture {
  question: string;
  requestedAt: string;
  docsPayload: Record<string, unknown> | null;
  synthesisPrompt: string | null;
  answer: { expert: string; public: string } | null;
  quoteVerification: unknown;
  relatedQuestions: string[];
}

/** Download button for the captured search log — rendered only when the
 *  page was loaded with ?debug=1 and a research search has run. */
export function SearchDebugLog({ capture }: { capture: SearchDebugCapture | null }) {
  const download = useCallback(() => {
    if (!capture) return;
    const blob = new Blob([JSON.stringify(capture, null, 1)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `search-log-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, [capture]);

  if (!capture) return null;
  return (
    <div className="rounded border border-dashed border-dm-border bg-dm-card/50 p-2 flex items-center justify-between">
      <span className="text-[11px] text-dm-muted">
        Debug capture active — expansion diagnostics, pre-rerank candidates, and the synthesis
        prompt are being recorded for this search.
      </span>
      <button
        onClick={download}
        className="text-xs text-dm-accent hover:underline font-medium shrink-0 ml-3"
      >
        Download search log
      </button>
    </div>
  );
}
