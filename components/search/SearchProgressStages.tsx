import { useEffect, useState } from 'react';

/** Staged progress for the research docs phase (#723): a known wait feels
 *  shorter than an uncertain one (Nielsen), so the single static line becomes
 *  a checklist that advances through the REAL pipeline phases on timers tuned
 *  to their typical durations, plus an elapsed counter. Client-side timers,
 *  not server signals — the stage order and wording mirror the actual
 *  retrieval pipeline (expansion → hybrid search → fusion/rank → selection). */
const STAGES: Array<{ at: number; label: string }> = [
  { at: 0, label: 'Expanding your question into corpus search terms' },
  { at: 3, label: 'Searching the corpus — semantic vectors plus exact keyword matches' },
  { at: 9, label: 'Fusing and ranking candidates (comparisons search each era separately)' },
  { at: 16, label: 'Selecting the most relevant documents and extracting matched passages' },
  { at: 26, label: 'Still working — novel questions bypass every cache and take the longest' },
];

export function SearchProgressStages() {
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    const started = Date.now();
    const timer = setInterval(() => setElapsed((Date.now() - started) / 1000), 500);
    return () => clearInterval(timer);
  }, []);

  const currentIndex = STAGES.reduce((acc, s, i) => (elapsed >= s.at ? i : acc), 0);
  return (
    <div className="text-center py-12" aria-live="polite">
      <ul className="inline-block text-left space-y-1">
        {STAGES.slice(0, currentIndex + 1).map((s, i) => (
          <li key={s.at} className="text-sm text-dm-muted">
            {i < currentIndex ? (
              <span className="text-emerald-500">✓</span>
            ) : (
              <span className="inline-block animate-pulse">●</span>
            )}{' '}
            {s.label}
            {i === currentIndex ? '…' : ''}
          </li>
        ))}
      </ul>
      <p className="mt-2 text-xs text-dm-muted/70">{Math.floor(elapsed)}s elapsed</p>
    </div>
  );
}
