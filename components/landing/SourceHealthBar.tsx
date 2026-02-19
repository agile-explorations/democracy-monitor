import Link from 'next/link';

export interface SourceHealthBarProps {
  healthySources: number;
  degradedSources: number;
  unavailableSources: number;
  silentSources: number;
  totalSources: number;
}

export function SourceHealthBar({
  healthySources,
  degradedSources,
  unavailableSources,
  silentSources,
  totalSources,
}: SourceHealthBarProps) {
  if (totalSources === 0) return null;

  const allHealthy = healthySources === totalSources;
  const impaired = degradedSources + silentSources;

  return (
    <div
      className={`flex items-center gap-3 rounded-lg px-4 py-2.5 text-xs mb-4 ${
        allHealthy
          ? 'bg-dm-card border border-dm-border/50'
          : 'bg-slate-50 dark:bg-slate-800/50 border border-dm-border'
      }`}
    >
      <span className="text-dm-text-secondary font-medium">Sources:</span>
      <span
        className="flex gap-0.5"
        aria-label={`${healthySources} healthy, ${impaired} impaired, ${unavailableSources} unavailable`}
      >
        {Array.from({ length: healthySources }, (_, i) => (
          <span key={`h-${i}`} className="text-source-healthy" aria-hidden="true">
            ●
          </span>
        ))}
        {Array.from({ length: impaired }, (_, i) => (
          <span key={`d-${i}`} className="text-source-degraded" aria-hidden="true">
            ◐
          </span>
        ))}
        {Array.from({ length: unavailableSources }, (_, i) => (
          <span key={`u-${i}`} className="text-source-unavailable" aria-hidden="true">
            ○
          </span>
        ))}
      </span>
      <span className="text-dm-text-secondary">
        {allHealthy ? (
          `${totalSources}/${totalSources} healthy`
        ) : (
          <>
            {healthySources} healthy
            {impaired > 0 && <> &middot; {impaired} impaired</>}
            {unavailableSources > 0 && <> &middot; {unavailableSources} unavailable</>}
          </>
        )}
      </span>
      <Link href="/health" className="ml-auto text-dm-accent hover:underline shrink-0">
        Details &rarr;
      </Link>
    </div>
  );
}
