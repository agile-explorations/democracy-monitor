import { Card } from '@/components/ui/Card';
import { StatusPill } from '@/components/ui/StatusPill';

export function StatusLegend() {
  return (
    <Card>
      <h2 className="text-sm font-semibold text-slate-900 mb-3">What Do The Colors Mean?</h2>
      <div className="grid grid-cols-1 md:grid-cols-4 gap-3 text-xs">
        <div className="flex items-start gap-2">
          <StatusPill level="Stable" />
          <span className="text-slate-600">
            Everything is working normally - courts and watchdogs are doing their jobs
          </span>
        </div>
        <div className="flex items-start gap-2">
          <StatusPill level="Warning" />
          <span className="text-slate-600">
            Some problems detected, but institutions are still pushing back
          </span>
        </div>
        <div className="flex items-start gap-2">
          <StatusPill level="Drift" />
          <span className="text-slate-600">
            Multiple warning signs - power is becoming more centralized
          </span>
        </div>
        <div className="flex items-start gap-2">
          <StatusPill level="Capture" />
          <span className="text-slate-600">
            Serious violations found - the President is ignoring laws or court orders
          </span>
        </div>
      </div>
      <p className="text-[10px] text-slate-400 mt-3">
        These statuses describe individual category health. The aggregate &ldquo;System
        Health&rdquo; label (Healthy/Caution/Concerning/Serious/Critical) is derived from how many
        categories are at each level. Data source Up/Down indicates whether government websites are
        reachable.
      </p>
    </Card>
  );
}
