/**
 * Severity-tiered warning blocks (#feedback 2026-07-25/26): 'action' items
 * carry a remediation and render amber; 'limitation' items are documented
 * coverage facts and render muted. Shared by the Ingest Health detail panel
 * and the summary card so the two reading levels can't drift apart.
 */

interface WarningDetail {
  severity: 'action' | 'limitation';
  text: string;
}

export function SeverityWarnings({
  details,
  fallback,
}: {
  details?: WarningDetail[];
  fallback?: string[];
}) {
  const actions = details?.filter((w) => w.severity === 'action').map((w) => w.text) ?? [];
  const limitations = details?.filter((w) => w.severity === 'limitation').map((w) => w.text) ?? [];
  const plain = details?.length ? [] : (fallback ?? []);

  if (actions.length + limitations.length + plain.length === 0) return null;

  return (
    <div className="space-y-2">
      {(actions.length > 0 || plain.length > 0) && (
        <div className="rounded border border-amber-500/30 bg-amber-500/5 p-3">
          <h4 className="text-[10px] font-semibold uppercase tracking-wider text-amber-600 dark:text-amber-400 mb-2">
            Needs attention ({actions.length || plain.length})
          </h4>
          <ul className="text-xs text-dm-text-secondary space-y-1 list-disc list-inside">
            {(actions.length > 0 ? actions : plain).map((w, i) => (
              <li key={i}>{w}</li>
            ))}
          </ul>
        </div>
      )}
      {limitations.length > 0 && (
        <div className="rounded border border-dm-border bg-dm-border/10 p-3">
          <h4 className="text-[10px] font-semibold uppercase tracking-wider text-dm-muted mb-2">
            Known limitations ({limitations.length})
          </h4>
          <ul className="text-xs text-dm-muted space-y-1 list-disc list-inside">
            {limitations.map((w, i) => (
              <li key={i}>{w}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
