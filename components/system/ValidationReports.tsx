import { DataTable } from '@/components/system/ContentHelpers';
import { SeverityWarnings } from '@/components/system/SeverityWarnings';

function SubsectionHeading({ title, description }: { title: string; description: string }) {
  return (
    <div>
      <h4 className="text-xs font-semibold text-dm-text-secondary uppercase tracking-wider">
        {title}
      </h4>
      <p className="text-xs text-dm-muted mt-0.5">{description}</p>
    </div>
  );
}

function WarningsList({ warnings }: { warnings: string[] }) {
  if (!warnings?.length) return null;
  return (
    <div className="mt-4 rounded border border-amber-500/30 bg-amber-500/5 p-3">
      <h4 className="text-[10px] font-semibold uppercase tracking-wider text-amber-600 dark:text-amber-400 mb-2">
        Warnings
      </h4>
      <ul className="text-xs text-dm-text-secondary space-y-1 list-disc list-inside">
        {warnings.map((w: string, i: number) => (
          <li key={i}>{w}</li>
        ))}
      </ul>
    </div>
  );
}

function PassFail({ pass }: { pass: boolean }) {
  return pass ? (
    <span className="text-green-600 dark:text-green-400 font-medium">PASS</span>
  ) : (
    <span className="text-red-600 dark:text-red-400 font-medium">FAIL</span>
  );
}

/* ── Ingest Health ────────────────────────────────────────────────── */

export function renderIngest(data: any) {
  return (
    <div className="space-y-5 max-h-[600px] overflow-y-auto">
      <SeverityWarnings details={data.warningDetails} fallback={data.warnings} />
      {data.documentCoverage?.length > 0 && (
        <>
          <SubsectionHeading
            title="Document Coverage"
            description="Number of documents ingested per category and source type."
          />
          <DataTable
            headers={['Category', 'Source', 'Documents']}
            rows={data.documentCoverage.map((r: any) => [
              r.category,
              r.sourceOrigin ?? '—',
              String(r.count ?? 0),
            ])}
          />
        </>
      )}
      {data.contentCompleteness?.length > 0 && (
        <>
          <SubsectionHeading
            title="Content Completeness (by type)"
            description="Documents with missing or null content, grouped by source type."
          />
          <DataTable
            headers={['Source Type', 'Total', 'Null Content', 'Rate']}
            rows={data.contentCompleteness.map((r: any) => [
              r.sourceType,
              String(r.total),
              String(r.nullContent),
              `${((r.nullContent / Math.max(r.total, 1)) * 100).toFixed(1)}%`,
            ])}
          />
        </>
      )}
      {data.contentCompletenessByOrigin?.length > 0 && (
        <>
          <SubsectionHeading
            title="Content Completeness (by origin)"
            description="Documents with missing or null content, grouped by source origin."
          />
          <DataTable
            headers={['Source Origin', 'Total', 'Null Content', 'Rate']}
            rows={data.contentCompletenessByOrigin.map((r: any) => [
              r.sourceType,
              String(r.total),
              String(r.nullContent),
              `${((r.nullContent / Math.max(r.total, 1)) * 100).toFixed(1)}%`,
            ])}
          />
        </>
      )}
      {data.paginationFitness?.length > 0 && (
        <>
          <SubsectionHeading
            title="Pagination Fitness"
            description="Peak weekly document counts per source. High counts may indicate pagination limits are being hit."
          />
          <DataTable
            headers={['Category', 'Source', 'Peak Weekly Count']}
            rows={data.paginationFitness.map((r: any) => [
              r.category,
              r.sourceOrigin ?? '—',
              String(r.peakWeeklyCount ?? 0),
            ])}
          />
        </>
      )}
      {data.sourcePeriodCoverage?.length > 0 && (
        <>
          <SubsectionHeading
            title="Source Period Coverage"
            description="Document counts per source across analysis periods, with earliest date seen."
          />
          <DataTable
            headers={['Source', 'Period', 'Count', 'Earliest']}
            rows={data.sourcePeriodCoverage.map((r: any) => [
              r.sourceOrigin,
              r.period,
              String(r.count ?? 0),
              r.earliestDate ?? '—',
            ])}
          />
        </>
      )}
      {data.frPeriodCoverage?.length > 0 && (
        <>
          <SubsectionHeading
            title="Federal Register Period Coverage"
            description="Federal Register document counts per category and analysis period."
          />
          <DataTable
            headers={['Category', 'Source', 'Period', 'Count']}
            rows={data.frPeriodCoverage.map((r: any) => [
              r.category,
              r.sourceOrigin ?? '—',
              r.period,
              String(r.count ?? 0),
            ])}
          />
        </>
      )}
      {data.cpdPeriodCoverage?.length > 0 && (
        <>
          <SubsectionHeading
            title="CPD Period Coverage"
            description="Compilation of Presidential Documents counts per category and analysis period."
          />
          <DataTable
            headers={['Category', 'Source', 'Period', 'Count']}
            rows={data.cpdPeriodCoverage.map((r: any) => [
              r.category,
              r.sourceOrigin ?? '—',
              r.period,
              String(r.count ?? 0),
            ])}
          />
        </>
      )}
      {data.clOpinionCoverage && (
        <>
          <SubsectionHeading
            title="CourtListener Opinion Coverage"
            description="Docket entries, opinion documents, and case-level coverage from CourtListener."
          />
          <DataTable
            headers={['Metric', 'Value']}
            rows={[
              ['Docket entries', String(data.clOpinionCoverage.docketEntries ?? 0)],
              ['Opinion documents', String(data.clOpinionCoverage.opinionDocuments ?? 0)],
              ['Unique cases', String(data.clOpinionCoverage.uniqueCases ?? 0)],
              ['Cases with opinion', String(data.clOpinionCoverage.casesWithOpinion ?? 0)],
              ['Cases without opinion', String(data.clOpinionCoverage.casesWithoutOpinion ?? 0)],
            ]}
          />
        </>
      )}
      {data.signalCoverageGaps?.length > 0 && (
        <>
          <SubsectionHeading
            title="Signal Coverage Gaps"
            description="Categories missing documents from expected source types."
          />
          <DataTable
            headers={['Category', 'Expected Source', 'Origin']}
            rows={data.signalCoverageGaps.map((r: any) => [
              r.category,
              r.expectedSource ?? '—',
              r.origin ?? '—',
            ])}
          />
        </>
      )}
      {data.fetchErrors?.length > 0 && (
        <>
          <SubsectionHeading
            title="Fetch Errors"
            description="Sources with incomplete or failed fetches during ingestion."
          />
          <DataTable
            headers={['Source', 'Categories', 'Incomplete', 'Errors']}
            rows={data.fetchErrors.map((r: any) => [
              r.sourceOrigin,
              String(r.categories ?? 0),
              String(r.totalIncomplete ?? 0),
              String(r.totalErrors ?? 0),
            ])}
          />
        </>
      )}
      {data.metadataOnlyClassification?.length > 0 && (
        <>
          <SubsectionHeading
            title="Metadata-Only Classification"
            description="Whether metadata-only documents (e.g., docket stubs, rhetoric cross-feed) are correctly flagged at ingestion."
          />
          <DataTable
            headers={['Population', 'Filter', 'Total', 'Marked', 'Unmarked', 'Result']}
            rows={data.metadataOnlyClassification.map((r: any) => [
              r.population,
              r.sourceFilter ? `${r.sourceFilter.column}=${r.sourceFilter.value}` : '—',
              String(r.total ?? 0),
              String(r.markedMetadataOnly ?? 0),
              String(r.unmarked ?? 0),
              r.pass ? 'PASS' : 'FAIL',
            ])}
          />
        </>
      )}
    </div>
  );
}

/* ── Data Readiness ───────────────────────────────────────────────── */

export function renderDataReport(data: any) {
  if (data.pending) {
    return (
      <p className="text-xs text-dm-muted">
        No stored report yet — data readiness runs at the end of each weekly snapshot and its
        results appear here after the next Monday run.
      </p>
    );
  }
  const sc = data.stageCompleteness;
  return (
    <div className="space-y-5 max-h-[600px] overflow-y-auto">
      {sc && (
        <>
          <SubsectionHeading
            title="Pipeline Stage Completeness"
            description="How many documents have completed each processing stage (scoring, embedding, aggregation)."
          />
          <DataTable
            headers={['Stage', 'Total', 'Missing']}
            rows={[
              ['Documents', String(sc.totalDocuments), '—'],
              ['Metadata-only', String(sc.metadataOnlyCount ?? 0), '—'],
              ['Scores', String(sc.totalDocuments - sc.missingScores), String(sc.missingScores)],
              [
                'Embeddings',
                String(sc.totalDocuments - sc.missingEmbeddings),
                String(sc.missingEmbeddings),
              ],
              [
                'Embeddings (intent)',
                String(sc.totalDocuments - (sc.missingEmbeddingsIntent ?? sc.missingEmbeddings)),
                String(sc.missingEmbeddingsIntent ?? '—'),
              ],
              [
                'Aggregates',
                String(sc.totalWeeks - sc.missingAggregates),
                String(sc.missingAggregates),
              ],
            ]}
          />
        </>
      )}
      {data.baselineCompleteness?.length > 0 && (
        <>
          <SubsectionHeading
            title="Baseline Completeness"
            description="Whether baseline statistics have been computed for each category in each analysis period."
          />
          <DataTable
            headers={['Baseline', 'Category', 'Status']}
            rows={data.baselineCompleteness.map((r: any) => [
              r.baselineId,
              r.category,
              r.hasStats ? 'Complete' : 'Missing',
            ])}
          />
        </>
      )}
      {data.layer2Completeness?.length > 0 && (
        <>
          <SubsectionHeading
            title="AI Document Review Coverage"
            description="AI two-pass assessment progress per analysis period. P1 screens all docs; P2 deep-reviews flagged docs."
          />
          <DataTable
            headers={[
              'Period',
              'Docs',
              'P1 Done',
              'P1 Flagged',
              'P2 Done',
              'P2 Flagged',
              'Audit',
              'Audit False Neg',
            ]}
            rows={data.layer2Completeness.map((r: any) => [
              r.label,
              String(r.totalDocuments),
              String(r.pass1Assessed),
              String(r.pass1Flagged),
              String(r.pass2Assessed),
              String(r.pass2Flagged ?? 0),
              String(r.auditSampled ?? 0),
              String(r.auditFalseNegatives ?? 0),
            ])}
          />
        </>
      )}
      {data.layerScorePopulation?.length > 0 && (
        <>
          <SubsectionHeading
            title="Score Population"
            description="Weeks with computed scores for each assessment dimension and concern synthesis."
          />
          <DataTable
            headers={['Period', 'Weeks', 'Structural', 'AI', 'Thematic', 'Concern', 'All']}
            rows={data.layerScorePopulation.map((r: any) => [
              r.label,
              String(r.totalWeeks),
              String(r.withStructural),
              String(r.withAi),
              String(r.withThematic),
              String(r.withConvergence),
              String(r.withAllLayers ?? 0),
            ])}
          />
        </>
      )}
      {data.narrativeCoverage && (
        <>
          <SubsectionHeading
            title="Narrative Coverage"
            description="AI-generated narrative availability for weeks with elevated convergence status."
          />
          <DataTable
            headers={['Metric', 'Value']}
            rows={[
              ['Elevated weeks', String(data.narrativeCoverage.elevatedWeeks)],
              [
                'With narratives',
                String(
                  data.narrativeCoverage.weeksWithNarratives ??
                    data.narrativeCoverage.narrativeWeeks,
                ),
              ],
              ['Missing narratives', String(data.narrativeCoverage.missingWeeks)],
              ['With weekly summary', String(data.narrativeCoverage.weeksWithSummary)],
              ['Term summary', data.narrativeCoverage.termSummaryFresh ? 'Fresh' : 'Stale'],
              ['Missing summaries', String(data.narrativeCoverage.missingSummaryWeeks ?? 0)],
            ]}
          />
        </>
      )}
      <SeverityWarnings details={data.warningDetails} fallback={data.warnings} />
    </div>
  );
}

/* ── Detection Correctness ────────────────────────────────────────── */

export function renderDetection(data: any) {
  const s = data.summary;
  return (
    <div className="space-y-5 max-h-[600px] overflow-y-auto">
      {s && (
        <div className="flex flex-wrap gap-4 text-sm text-dm-text-secondary">
          <span>
            Events: {s.eventsDetected}/{s.totalEvents} detected
            {s.eventsMissed > 0 && `, ${s.eventsMissed} missed`}
            {s.eventsSkipped > 0 && `, ${s.eventsSkipped} skipped`}
          </span>
          <span>
            Controls: {s.controlsPassed}/{s.controlsPassed + s.controlsFailed} passed
          </span>
        </div>
      )}
      {data.populationSummary && (
        <>
          <SubsectionHeading
            title="Population Sufficiency"
            description="Whether enough weeks have all three detection layers computed to support reliable validation."
          />
          <DataTable
            headers={['Layer', 'Weeks']}
            rows={[
              ['Total', String(data.populationSummary.totalWeeks)],
              ['L1 Structural', String(data.populationSummary.withStructural)],
              ['L2 AI', String(data.populationSummary.withAi)],
              ['L3 Thematic', String(data.populationSummary.withThematic)],
              ['All layers', String(data.populationSummary.withAllLayers)],
            ]}
          />
          <div className="text-xs text-dm-text-secondary">
            {data.populationSummary.withAllLayers}/{data.populationSummary.totalWeeks} weeks with
            all layers — <PassFail pass={data.populationSummary.sufficient} />
          </div>
        </>
      )}
      {data.negativeControls?.length > 0 && (
        <>
          <SubsectionHeading
            title="Negative Controls"
            description="Baseline-period checks that verify the system does not over-flag during known-calm periods."
          />
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
          {data.negativeControls
            .filter((c: any) => c.details?.length > 0)
            .map((c: any) => (
              <div key={c.id} className="ml-4">
                <p className="text-[10px] font-semibold text-dm-text-secondary uppercase tracking-wider mb-1">
                  {c.id} — Per-Category Detail
                </p>
                <DataTable
                  headers={['Category', 'Value', 'Result']}
                  rows={c.details.map((d: any) => [
                    d.category,
                    String(d.value),
                    d.pass ? 'PASS' : 'FAIL',
                  ])}
                />
              </div>
            ))}
        </>
      )}
      {data.eventDetection?.length > 0 && (
        <>
          <SubsectionHeading
            title="Known Event Detection"
            description="Whether the system detected known institutional events via at least one detection layer."
          />
          <DataTable
            headers={[
              'Event',
              'Date',
              'Category',
              'Description',
              'Status',
              'L1',
              'L2',
              'L3',
              'Detected',
            ]}
            rows={data.eventDetection.map((e: any) => [
              e.eventId,
              e.eventDate ?? '—',
              e.category,
              e.description ?? '—',
              e.convergenceStatus ?? '—',
              e.l1Fired ? 'Y' : 'N',
              e.l2Fired ? 'Y' : 'N',
              e.l3Fired ? 'Y' : 'N',
              e.detected ? 'YES' : 'NO',
            ])}
          />
        </>
      )}
      <WarningsList warnings={data.warnings} />
    </div>
  );
}

export function renderBacktest(data: any) {
  return (
    <div className="space-y-5 max-h-[600px] overflow-y-auto">
      <div className="flex flex-wrap gap-4 text-xs">
        <div>
          <span className="text-dm-muted">Period: </span>
          <span className="text-dm-text-primary font-mono">{data.period}</span>
        </div>
        <div>
          <span className="text-dm-muted">Detection: </span>
          <span className="text-dm-text-primary font-mono">
            {data.detectionRate}% ({data.detected} hit + {data.latency} late / {data.totalEvents}{' '}
            events)
          </span>
        </div>
        <div>
          <span className="text-dm-muted">Missed: </span>
          <span className="text-dm-text-primary font-mono">{data.missed}</span>
        </div>
      </div>

      {data.categories && data.categories.length > 0 && (
        <>
          <SubsectionHeading
            title="Per-Category Backtest"
            description="Detection rate, noise (non-event elevated weeks), and precision per category."
          />
          <DataTable
            headers={['Category', 'Detect', 'Hit', 'Late', 'Miss', 'Noise', 'Precision', 'Peak']}
            rows={data.categories.map((c: any) => [
              c.category,
              `${c.detectionRate}%`,
              String(c.detected),
              String(c.latency),
              String(c.missed),
              `${c.noise}%`,
              `${c.precision}%`,
              c.peakWeek || '\u2014',
            ])}
          />
        </>
      )}

      {data.categories?.some((c: any) => c.missedDescriptions?.length > 0) && (
        <>
          <SubsectionHeading
            title="Missed Events"
            description="Known events not detected in the event week or following week."
          />
          <div className="space-y-1 text-xs">
            {data.categories
              .filter((c: any) => c.missedDescriptions?.length > 0)
              .flatMap((c: any) =>
                c.missedDescriptions.map((m: any, i: number) => (
                  <div key={`${c.category}-${i}`} className="flex gap-2">
                    <span className="text-dm-muted font-mono shrink-0">{m.date}</span>
                    <span className="text-dm-text-secondary">{c.category}:</span>
                    <span className="text-dm-text-primary">
                      {m.description} <span className="text-dm-muted">[{m.reason}]</span>
                    </span>
                  </div>
                )),
              )}
          </div>
        </>
      )}
    </div>
  );
}

/* ── Derivation Graph ─────────────────────────────────────────────── */

export function renderGraph(data: any) {
  if (data.pending) {
    return (
      <p className="text-xs text-dm-muted">
        No stored report yet — the contract runs at the end of each weekly snapshot and its results
        appear here after the next Monday run.
      </p>
    );
  }
  const results = data.results ?? [];
  return (
    <div className="space-y-5 max-h-[600px] overflow-y-auto">
      <SubsectionHeading
        title="Edge Contract"
        description={`Referential and freshness invariants across documents → scores → aggregates → enrichment → narratives, stored by the weekly snapshot${data.generatedAt ? ` (last run ${new Date(data.generatedAt).toLocaleString()})` : ''}. Warnings are informational; failures indicate a pipeline defect or an unfinished repair.`}
      />
      <DataTable
        headers={['Invariant', 'Description', 'Violations', 'Status']}
        rows={results.map((r: any) => [
          r.id,
          r.description,
          String(r.violations),
          r.pass ? 'PASS' : r.severity === 'warn' ? 'WARN' : 'FAIL',
        ])}
      />
      {results.some((r: any) => !r.pass && r.severity === 'error' && r.sample?.length) && (
        <WarningsList
          warnings={results
            .filter((r: any) => !r.pass && r.severity === 'error' && r.sample?.length)
            .flatMap((r: any) => r.sample.map((s: string) => `${r.id}: ${s}`))}
        />
      )}
    </div>
  );
}
