import { useCallback, useEffect, useState } from 'react';
import { DataTable } from '@/components/system/ContentHelpers';
import { SeverityWarnings } from '@/components/system/SeverityWarnings';

function SummaryCard({
  title,
  children,
  error,
}: {
  title: string;
  children: React.ReactNode;
  error?: string | null;
}) {
  return (
    <div className="rounded-lg border border-dm-border bg-dm-card p-4">
      <h3 className="text-xs font-semibold uppercase tracking-wider text-dm-text-secondary mb-3">
        {title}
      </h3>
      {error ? <p className="text-sm text-red-500">Failed to load: {error}</p> : children}
    </div>
  );
}

function WarningsList({ warnings }: { warnings: string[] }) {
  if (!warnings?.length) return null;
  return (
    <div className="mt-3 rounded border border-amber-500/30 bg-amber-500/5 p-3">
      <h4 className="text-[10px] font-semibold uppercase tracking-wider text-amber-600 dark:text-amber-400 mb-1">
        Warnings ({warnings.length})
      </h4>
      <ul className="text-xs text-dm-text-secondary space-y-0.5 list-disc list-inside">
        {warnings.map((w: string, i: number) => (
          <li key={i}>{w}</li>
        ))}
      </ul>
    </div>
  );
}

function LoadingSkeleton() {
  return (
    <div className="animate-pulse space-y-2">
      <div className="h-3 w-full bg-dm-border/40 rounded" />
      <div className="h-3 w-5/6 bg-dm-border/40 rounded" />
      <div className="h-3 w-4/6 bg-dm-border/40 rounded" />
    </div>
  );
}

function IngestSummary({ data }: { data: any }) {
  return (
    <>
      <div className="mb-3">
        <SeverityWarnings details={data.warningDetails} fallback={data.warnings} />
      </div>
      {data.fetchErrors?.length > 0 && (
        <DataTable
          headers={['Source', 'Categories', 'Incomplete', 'Errors']}
          rows={data.fetchErrors.map((r: any) => [
            r.sourceOrigin,
            String(r.categories ?? 0),
            String(r.totalIncomplete ?? 0),
            String(r.totalErrors ?? 0),
          ])}
        />
      )}
      {(!data.fetchErrors || data.fetchErrors.length === 0) && (
        <p className="text-xs text-dm-muted">No fetch errors.</p>
      )}
    </>
  );
}

function DataSummary({ data }: { data: any }) {
  if (data.pending) {
    return <p className="text-xs text-dm-muted">Report pending — stored by the weekly snapshot.</p>;
  }
  const sc = data.stageCompleteness;
  return (
    <>
      {sc && (
        <DataTable
          headers={['Stage', 'Total', 'Missing']}
          rows={[
            ['Scores', String(sc.totalDocuments - sc.missingScores), String(sc.missingScores)],
            [
              'Embeddings',
              String(sc.totalDocuments - sc.missingEmbeddings),
              String(sc.missingEmbeddings),
            ],
            [
              'Aggregates',
              String(sc.totalWeeks - sc.missingAggregates),
              String(sc.missingAggregates),
            ],
          ]}
        />
      )}
      {data.dataIntegrity?.some((c: any) => !c.pass) && (
        <div className="mt-2">
          <DataTable
            headers={['Check', 'Count', 'Result']}
            rows={data.dataIntegrity
              .filter((r: any) => !r.pass)
              .map((r: any) => [r.name, String(r.count ?? 0), 'FAIL'])}
          />
        </div>
      )}
      <WarningsList warnings={data.warnings} />
    </>
  );
}

function DetectionSummary({ data }: { data: any }) {
  const s = data.summary;
  return (
    <>
      {s && (
        <div className="flex flex-wrap gap-4 text-sm text-dm-text-secondary mb-3">
          <span>
            Events: {s.eventsDetected}/{s.totalEvents} detected
            {s.eventsMissed > 0 && `, ${s.eventsMissed} missed`}
          </span>
          <span>
            Controls: {s.controlsPassed}/{s.controlsPassed + s.controlsFailed} passed
          </span>
        </div>
      )}
      {data.negativeControls?.length > 0 && (
        <DataTable
          headers={['ID', 'Description', 'Actual', 'Threshold', 'Result']}
          rows={data.negativeControls.map((c: any) => [
            c.id,
            c.description,
            c.actual,
            c.threshold,
            c.pass ? 'PASS' : 'FAIL',
          ])}
        />
      )}
      {data.eventDetection?.some((e: any) => !e.detected) && (
        <div className="mt-2">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-dm-text-secondary mb-1">
            Missed Events
          </p>
          <DataTable
            headers={['Event', 'Date', 'Category', 'Status', 'L1', 'L2', 'L3']}
            rows={data.eventDetection
              .filter((e: any) => !e.detected)
              .map((e: any) => [
                e.eventId,
                e.eventDate ?? '—',
                e.category,
                e.convergenceStatus ?? '—',
                e.l1Fired ? 'Y' : 'N',
                e.l2Fired ? 'Y' : 'N',
                e.l3Fired ? 'Y' : 'N',
              ])}
          />
        </div>
      )}
      <WarningsList warnings={data.warnings} />
    </>
  );
}

function GraphSummary({ data }: { data: any }) {
  if (data.pending) {
    return (
      <p className="text-xs text-dm-muted">
        Report pending — stored by the weekly snapshot after each Monday run.
      </p>
    );
  }
  const results = (data.results ?? []) as Array<{
    id: string;
    pass: boolean;
    severity: string;
    violations: number;
  }>;
  const failed = results.filter((r) => !r.pass && r.severity === 'error');
  const warned = results.filter((r) => !r.pass && r.severity === 'warn');
  return (
    <p className="text-xs text-dm-text-secondary">
      {failed.length === 0
        ? `All ${results.filter((r) => r.severity === 'error').length} error-severity invariants hold.`
        : `${failed.length} invariant(s) violated: ${failed.map((r) => `${r.id} (${r.violations})`).join(', ')}`}
      {warned.length > 0 &&
        ` ${warned.length} informational warning(s): ${warned.map((r) => r.id).join(', ')}.`}
    </p>
  );
}

interface HealthData {
  ingest: { data: any; error: string | null };
  dataReport: { data: any; error: string | null };
  detection: { data: any; error: string | null };
  graph: { data: any; error: string | null };
}

export function HealthSummary() {
  const [health, setHealth] = useState<HealthData>({
    ingest: { data: null, error: null },
    dataReport: { data: null, error: null },
    detection: { data: null, error: null },
    graph: { data: null, error: null },
  });
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const endpoints = [
      { key: 'ingest' as const, url: '/api/health/validate-ingest' },
      { key: 'dataReport' as const, url: '/api/health/validate-data' },
      { key: 'detection' as const, url: '/api/health/validate-detection' },
      { key: 'graph' as const, url: '/api/health/validate-graph' },
    ];

    const results = await Promise.allSettled(
      endpoints.map(async (ep) => {
        const res = await fetch(ep.url);
        if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
        return { key: ep.key, data: await res.json() };
      }),
    );

    const next: HealthData = {
      ingest: { data: null, error: null },
      dataReport: { data: null, error: null },
      detection: { data: null, error: null },
      graph: { data: null, error: null },
    };

    for (const r of results) {
      if (r.status === 'fulfilled') {
        next[r.value.key] = { data: r.value.data, error: null };
      } else {
        const key = endpoints[results.indexOf(r)]!.key;
        next[key] = { data: null, error: r.reason?.message ?? 'Unknown error' };
      }
    }

    setHealth(next);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) {
    return (
      <div className="space-y-4">
        <LoadingSkeleton />
        <LoadingSkeleton />
        <LoadingSkeleton />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <SummaryCard title="Ingest Health" error={health.ingest.error}>
        {health.ingest.data && <IngestSummary data={health.ingest.data} />}
      </SummaryCard>

      <SummaryCard title="Data Readiness" error={health.dataReport.error}>
        {health.dataReport.data && <DataSummary data={health.dataReport.data} />}
      </SummaryCard>

      <SummaryCard title="Detection Correctness" error={health.detection.error}>
        {health.detection.data && <DetectionSummary data={health.detection.data} />}
      </SummaryCard>

      <SummaryCard title="Derivation Graph" error={health.graph.error}>
        {health.graph.data && <GraphSummary data={health.graph.data} />}
      </SummaryCard>
    </div>
  );
}
