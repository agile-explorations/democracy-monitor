import Link from 'next/link';
import { SEOHead } from '@/components/shared/SEOHead';
import { DataTable, Section } from '@/components/system/ContentHelpers';
import { PromptTransparency } from '@/components/system/PromptTransparency';
import { useReadingLevel } from '@/lib/contexts/ReadingLevelContext';
import { CONCERN_LEVEL_THRESHOLDS } from '@/lib/data/concern-level-explanations';

function ConcernLevel({
  color,
  label,
  description,
  threshold,
  className,
}: {
  color?: string;
  label: string;
  description: string;
  threshold?: string;
  className?: string;
}) {
  return (
    <div className="flex items-start gap-3">
      <span
        className={`inline-block w-3 h-3 mt-1 rounded-full ${className ?? ''}`}
        style={color ? { backgroundColor: color } : undefined}
      />
      <div>
        <strong>{label}</strong> — {description}
        {threshold && (
          <div className="text-dm-muted text-sm">
            <em>Set when:</em> {threshold}
          </div>
        )}
      </div>
    </div>
  );
}

export function SummaryContent() {
  return (
    <>
      {/* Overview */}
      <Section title="Overview" id="overview">
        <p>
          Democracy Monitor is an open-source system that tracks signs of executive-power
          centralization across U.S. government institutions. It reads publicly available government
          documents — federal regulations, court filings, press releases, legislative reports — and
          uses AI content assessment as its primary detection method, supported by three descriptive
          context methods, to identify when institutional norms may be shifting.
        </p>
        <p>
          The system is designed to surface patterns worth human examination, not render definitive
          judgments. All assessments trace to specific documents, reproducible metrics, and
          published thresholds.
        </p>
        <p>
          The stance behind every measurement here is witness, not verdict: document the shift in
          how America governs itself without judging it — see{' '}
          <Link href="/why-this-matters#charter" className="text-dm-accent hover:underline">
            what this site is, and is not
          </Link>
          . The same instruments point at every administration; this page is where that claim is
          checkable.
        </p>
      </Section>

      {/* Detection Architecture */}
      <Section title="Detection Architecture" id="detection-architecture">
        <p>
          Democracy Monitor uses <strong>one active detection method</strong> (AI document review)
          that drives concern status, plus three <strong>descriptive context methods</strong> that
          provide narrative grounding without influencing the status determination.
        </p>
        <p>
          <strong>AI Content Assessment (sole active detection)</strong> — Two-pass AI review using
          different providers (OpenAI for screening, Anthropic for detailed review) to ensure
          epistemic independence. Both passes receive up to 8,000 characters of boilerplate-stripped
          content. Pass 2 also receives week-level context including peer document titles and flag
          rate trajectory. Documents are classified from routine to clear departure (internal value:
          clearly_concerning).
        </p>
        <p>
          <strong>Silence Detection (descriptive only)</strong> — Measures whether
          government-controlled sources have gone unusually quiet while independent-branch sources
          (courts, Congress) remain active. Uses an 8-week intra-administration rolling window;
          categories that average under 3 documents a week use a presence-rate test over 16 weeks
          instead, since week-to-week zeros are normal for rare-event categories. Provides narrative
          context but does not drive concern status.
        </p>
        <p>
          <strong>Structural Anomaly (descriptive only)</strong> — Deterministic, metadata-only
          analysis across six dimensions: volume, type composition, functional distribution, agency
          activity, publication tempo, and source convergence. Provides context for narratives.
        </p>
        <p>
          <strong>Thematic Drift (descriptive only)</strong> — Embedding-based analysis detecting
          topic shifts using an 8-week intra-administration rolling window. Provides research
          context.
        </p>
        <p>
          <strong>Data reprocessing</strong> — When scoring, filtering, or counting rules change,
          all historical periods are reprocessed under the new rules, so cross-era comparisons
          remain valid. If a future collection change cannot be reconciled this way, it is marked on
          the volume-based research charts as <span className="text-dm-accent">▲</span>; concern
          statuses are verified to remain comparable across every change.
        </p>
      </Section>

      {/* Concern Synthesis */}
      <Section title="Concern Synthesis" id="concern-synthesis">
        <p>
          AI document review is the primary active detection method driving concern status.
          Structural anomaly, silence detection, and thematic drift provide descriptive context.
        </p>
        <p>
          A category&apos;s weekly status is set by counting how the Pass 2 review classified that
          week&apos;s documents:
        </p>
        <div className="space-y-2 ml-2">
          <ConcernLevel
            className="bg-dm-border"
            label="Consistent with baseline"
            description="Document review within the baseline range. No departures detected. (Internal status: Stable.)"
            threshold={CONCERN_LEVEL_THRESHOLDS.Stable}
          />
          <ConcernLevel
            className="bg-dm-accent"
            label="Notable departure"
            description="Two-pass document review flags departures from baseline practice, with Pass 2 corroboration. (Internal status: Elevated.)"
            threshold={CONCERN_LEVEL_THRESHOLDS.Elevated}
          />
          <ConcernLevel
            className="bg-status-capture"
            label="Sustained departure"
            description="High Pass 2 rate of clear-departure documents (>20%). Warrants close examination. (Internal status: ConfirmedConcern.)"
            threshold={CONCERN_LEVEL_THRESHOLDS.ConfirmedConcern}
          />
        </div>
      </Section>

      {/* Limitations */}
      <Section title="Limitations" id="limitations">
        <ul className="list-disc list-inside space-y-1">
          <li>
            Structural anomaly detection identifies statistical departures from baselines — it
            cannot determine whether a departure is concerning or benign without additional context
          </li>
          <li>
            AI assessment quality depends on the models used; the two-pass design mitigates
            single-provider bias but cannot eliminate it
          </li>
          <li>
            Thematic drift requires sufficient document volume; categories with few documents per
            week may have noisy drift signals
          </li>
          <li>
            The system monitors publicly available information only — actions taken through informal
            channels or not publicly documented are invisible
          </li>
          <li>
            All assessments are automated indicators, not definitive judgments — they are designed
            to surface patterns worth human examination
          </li>
        </ul>
      </Section>
    </>
  );
}

export function DetailedContent() {
  return (
    <>
      {/* Overview */}
      <Section title="Overview" id="overview">
        <p>
          Democracy Monitor is an open-source system that tracks signs of executive-power
          centralization across U.S. government institutions. It reads publicly available government
          documents — federal regulations, court filings, press releases, legislative reports — and
          uses AI content assessment as its primary detection method, supported by three descriptive
          context methods, to identify when institutional norms may be shifting.
        </p>
        <p>
          The system is designed to surface patterns worth human examination, not render definitive
          judgments. All assessments trace to specific documents, reproducible metrics, and
          published thresholds.
        </p>
        <p>
          The stance behind every measurement here is witness, not verdict: document the shift in
          how America governs itself without judging it — see{' '}
          <Link href="/why-this-matters#charter" className="text-dm-accent hover:underline">
            what this site is, and is not
          </Link>
          . The same instruments point at every administration; this page is where that claim is
          checkable.
        </p>
      </Section>

      {/* Data Sources */}
      <Section title="Data Sources" id="data-sources">
        <p>
          Democracy Monitor ingests documents from multiple source types, covering different facets
          of government activity:
        </p>
        <DataTable
          headers={['Source', 'What It Provides', 'Update Cadence']}
          rows={[
            [
              'Federal Register',
              'Executive orders, proposed and final rules, notices, presidential documents',
              'Daily',
            ],
            [
              'GovInfo',
              'Congressional reports, public laws, presidential documents (CPD)',
              'Every few days',
            ],
            [
              'CourtListener',
              'Federal court opinions, plus case docket metadata (RECAP) feeding the litigation tracker',
              'Every few days',
            ],
            [
              'DOJ Press Releases',
              'Department of Justice press releases across divisions',
              'Every few days',
            ],
            [
              'DHS/ICE/CBP Press Releases',
              'Operational press releases from DHS headquarters, ICE (full newsroom, including local enforcement operations), and CBP (national media releases)',
              'Weekly',
            ],
            [
              'Congressional Record (CREC)',
              'Senate and House floor speeches with speaker attribution',
              'Daily when in session',
            ],
            [
              'Congressional Hearings (CHRG)',
              'Committee hearing transcripts from seven committees (Judiciary, Oversight, Homeland Security, Appropriations, Armed Services, Administration, Intelligence)',
              'Weekly; transcripts publish months after hearings, so past weeks gain documents as transcripts become available',
            ],
            [
              'Inspector General (OIG)',
              'Audit reports and investigations from 11 Inspectors General: HHS, DOJ, SSA, and DHS directly; OPM, TIGTA, Treasury, State, EAC, FEC, and the Intelligence Community via oversight.gov',
              'Every few days',
            ],
            ['LegiScan', 'Federal legislative bill tracking via bulk datasets', 'Periodic'],
            [
              'FEC',
              'Federal Election Commission advisory opinions and Matters Under Review',
              'Weekly',
            ],
          ]}
        />
        <p>
          <strong>DHS/ICE/CBP capture scope:</strong> the homeland-security press corpus is captured
          in full within a deliberate scope, with no keyword or relevance filtering at ingest. From
          DHS headquarters, only the Press Releases news type is collected (speeches, testimony,
          fact sheets, and blog posts are not). From ICE, every newsroom release is collected,
          including local enforcement-operation announcements — often the most detection-relevant
          content. From CBP, national media releases are collected while port-level local media
          releases (routine seizure and trade notices) are excluded by their URL class. Other DHS
          component newsrooms (USCIS, TSA, FEMA, Secret Service) are not monitored. Releases
          cross-posted by DHS headquarters and a component newsroom are deduplicated to the
          component original. Every captured release is stored with its full text and screened by
          the AI document-review layer downstream — relevance triage happens in assessment, never at
          ingest. Because the agencies&apos; live newsroom listings only reach back to January 20,
          2025, earlier releases are recovered from the agencies&apos; own sitemaps where their
          robots.txt policies permit, and from the Internet Archive&apos;s Wayback Machine where
          they do not; every source&apos;s robots.txt is re-verified programmatically on each weekly
          ingest run.
        </p>
        <p>
          <strong>What counts as a document:</strong> nearly every stored document carries a
          complete body and is what document counts, search, and AI assessment operate on. Federal
          litigation is tracked separately: rather than storing a body-less row per docket filing
          (most filing texts sit behind the PACER paywall), each monitored case lives in a dedicated
          case-tracker table with its court, filing and termination dates, subject matter, and
          current posture — sourced from CourtListener&apos;s bulk docket data and refreshed weekly
          for active cases. Court <em>opinions</em>, which do have retrievable text, remain full
          documents in the corpus. The remaining metadata-only document rows are news-rhetoric
          records from the GDELT event database (headline-level signals whose full articles we do
          not republish) and a small set of documents whose bodies are unobtainable (for example,
          reports an agency stopped publishing openly); these are excluded from document counts,
          search results, and all detection layers so a body-less row can never masquerade as a
          substantive document. Anyone loading the downloadable dump will see the case tracker as
          its own table (as of August 2026, replacing roughly 283,000 docket-entry stub rows that
          previously inflated the raw row count) plus these metadata records.
        </p>
        <p>
          Source ingestion is health-checked on every weekly run. A source that fails to fetch is
          marked unavailable; one that succeeds but returns zero documents for two consecutive
          checks is marked silent. Unhealthy sources surface as alerts on the System pages and roll
          up to the site-wide data-integrity level, which is shown on the overview page and gates
          the weekly email digest — no digest is sent for a week whose ingest looks degraded.
        </p>
        <p>
          <strong>Congressional Record granularity (disclosed August 2026):</strong> the
          Congressional Record arrives from GovInfo at finer granularity for the current term
          (individual speeches) than for 2019&ndash;2024 (multi-topic whole-day sections), so AI
          review has examined proportionally less of the older floor-speech record. A measured audit
          (August 2026) bounds the effect as small: sampled older floor content, when individually
          reviewed, confirmed as erosion evidence at roughly one-sixth the current-term rate &mdash;
          floor speeches earn their evidentiary weight by discussing a sitting administration&apos;s
          contemporaneous actions, which re-reading historical debate does not reproduce. Earlier
          terms&apos; concern levels are therefore best read as floors sitting modestly below their
          true values (scattered single-point weeks, not a broad shift). The older record is being
          made individually searchable; full historical re-review remains a documented, deliberately
          deferred option.
        </p>
        <p>
          <strong>Coverage parity (July 2026):</strong> historical coverage and counting gaps were
          repaired in July 2026 — the court-scoped opinion layer and federal-legislation tracking
          now extend uniformly across all monitored periods (a correction that raised concern
          statuses in 147 historical weeks once previously missing court decisions and bills were
          assessed), and weekly document counts now count substantive documents only, under the same
          rule in every period. One inherent difference remains and cannot be repaired: public
          court-record archives digitized fewer documents for 2017–2018 than for later years, so
          court-document volume in those years reflects the source archives themselves. Weekly
          concern statuses use fixed, absolute criteria within each week and are unaffected. A full
          accounting is maintained in the project&apos;s coverage-parity audit.
        </p>
        <p>
          <strong>Retrieval-relevance correction (July 2026):</strong> Federal Register full-text
          term queries for the Press Freedom category had matched administrative boilerplate
          (Privacy Act statements, paperwork notices) in routine documents from unrelated agencies.
          A verified title-and-abstract relevance filter now screens these at fetch time, and 17,241
          historical off-topic documents (2017–2026) were annotated and excluded from assessment,
          statistics, search, and exports — annotated, not deleted, and every exclusion is recorded
          in a public drop ledger. Recomputing nine years of Press Freedom history with the
          corrected corpus changed 2 week-statuses (one week rose to Elevated, one ConfirmedConcern
          week was revised to Elevated), confirming that detection had been driven by real signal
          rather than the noise.
        </p>
      </Section>

      {/* Categories */}
      <Section title="Categories" id="categories">
        <p>
          The system monitors 14 institutional categories, aligned to frameworks used by V-Dem and
          Freedom House for measuring democratic governance:
        </p>
        <DataTable
          headers={['Category', 'What It Monitors']}
          rows={[
            ['Civil Service', 'Protection of career government workers from political dismissal'],
            [
              'Fiscal Independence',
              'Congressional control over spending; whether appropriated funds are being withheld',
            ],
            ['Executive Oversight', 'Independence and functioning of Inspectors General'],
            ['Hatch Act', 'Separation of government work from partisan political activity'],
            ['Judicial Independence', 'Executive compliance with court orders'],
            ['Military Constraints', 'Restrictions on domestic military deployment'],
            [
              'Rulemaking Autonomy',
              'Independence of regulatory agencies from political interference',
            ],
            ['Executive Actions', 'Volume and pace of presidential orders and directives'],
            ['Information Availability', 'Public access to government data, reports, and websites'],
            [
              'Elections',
              'Fair administration of elections, voter access, election infrastructure integrity',
            ],
            ['Media Freedom', 'Press access, FOIA compliance, threats to independent journalism'],
            ['Law Enforcement', 'Selective or political use of federal prosecution authority'],
            [
              'Civil Liberties',
              'Protection of constitutional rights, due process, and equal protection',
            ],
            [
              'Immigration Enforcement',
              'Detention, removal, asylum restrictions, and enforcement apparatus patterns',
            ],
          ]}
        />
      </Section>

      {/* Structural Anomaly */}
      <Section title="Structural Anomaly Detection (Descriptive Context)" id="structural-anomaly">
        <p>
          Structural anomaly detection is fully deterministic and uses only document metadata — no
          text analysis. It compares the current week&apos;s document patterns against historical
          baselines across six dimensions:
        </p>
        <ul className="list-disc list-inside space-y-1 ml-2">
          <li>
            <strong>Volume</strong> — Document count relative to baseline mean and standard
            deviation. A spike or drop in the number of documents published in a category may
            indicate unusual activity.
          </li>
          <li>
            <strong>Type Composition</strong> — Distribution of document types (executive orders,
            rules, notices, proclamations). Measured using Jensen-Shannon divergence, which
            quantifies how much the current distribution differs from the baseline.
          </li>
          <li>
            <strong>Functional Distribution</strong> — Shifts across eleven institutional function
            buckets (rulemaking, executive action, personnel action, administrative procedure,
            organizational change, financial/regulatory, cultural/ceremonial, news/rhetoric,
            enforcement action, judicial action, unclassified). Detects when the <em>kind</em> of
            government activity changes, not just the volume.
          </li>
          <li>
            <strong>Agency Activity</strong> — Changes in which agencies are publishing documents.
            Unusual concentration or absence of specific agencies can signal institutional
            disruption.
          </li>
          <li>
            <strong>Publication Tempo</strong> — Daily variance within the week. A pattern where all
            documents arrive on one day rather than being spread across the week may indicate
            coordinated activity.
          </li>
          <li>
            <strong>Source Convergence</strong> — Ratio of government-origin documents to
            rhetoric/news sources. Large imbalances may indicate that government actions are
            generating disproportionate external attention, or that government publishing has gone
            quiet.
          </li>
        </ul>
        <p>
          Each dimension produces a z-score. The composite structural score is a weighted average
          with exponential dampening for mild z-scores (to avoid noise from routine variation) and a
          cap on JSD outliers. A long-horizon component tracks cumulative deviation over 12 weeks to
          detect slow-building trends that wouldn&apos;t appear in any single week.
        </p>
      </Section>

      {/* AI Document Review */}
      <Section title="AI Document Review (Active Detection)" id="ai-document-review">
        <p>
          The AI document review uses artificial intelligence to read and evaluate individual
          documents. To reduce single-provider bias, it uses a two-pass design with different AI
          providers:
        </p>
        <ul className="list-disc list-inside space-y-1 ml-2">
          <li>
            <strong>Pass 1 (Screening)</strong> — A fast model (GPT-4o-mini, from OpenAI) evaluates
            every document for relevance to democratic institutional concerns. Documents are flagged
            as relevant or routine. Most government documents are routine administrative activity;
            this pass filters to the small fraction worth closer examination.
          </li>
          <li>
            <strong>Pass 2 (Detailed Review)</strong> — A different provider (Claude, from
            Anthropic) independently assesses each flagged document, classifying it as: routine;
            novel, within baseline; possible departure; or clear departure (internal values:
            routine, novel_not_concerning, potentially_concerning, clearly_concerning). Using a
            different AI provider for each pass ensures that the two assessments are epistemically
            independent.
          </li>
        </ul>
        <p>
          The weekly status is determined by absolute Pass 2 classification counts — no
          cross-administration baseline comparison is needed:
        </p>
        <ul className="list-disc list-inside space-y-1 ml-2">
          <li>
            <strong>Consistent with baseline</strong> (internal: Stable) — Pass 2 found no departure
            documents (0 clear-departure, ≤1 possible-departure)
          </li>
          <li>
            <strong>Notable departure</strong> (internal: Elevated) — ≥1 clear-departure OR ≥2
            possible-departure documents
          </li>
          <li>
            <strong>Sustained departure</strong> (internal: ConfirmedConcern) — ≥2 clear-departure,
            OR ≥3 departure documents with ≥20% departure rate
          </li>
        </ul>
        <p>
          Pass 2 also records two descriptive classifications for each concerning document: the{' '}
          <strong>mechanism of change</strong> (formal override, operational hollowing, or
          noncompliance/refusal — stored as the &quot;erosion type&quot;) and the{' '}
          <strong>actor</strong> — which institutional actor performs the erosion-relevant action:
          the federal executive, Congress, the judiciary, or a state/local government. The actor is
          whoever performs the action, not the document&apos;s author or venue: a court opinion
          documenting a federal agency&apos;s defiance of court orders attributes to the federal
          executive, while a ruling that itself removes a protection attributes to the judiciary.
          Actor attribution is context only — it does not change how any document is assessed or how
          weekly concern status is computed. To guarantee that, attribution runs as a separate
          lightweight classification pass, fully decoupled from the assessment prompt: a controlled
          experiment showed that embedding attribution in the assessment prompt measurably shifted
          outcomes, so the assessment prompt is kept unchanged. How attribution should shape the
          dashboard&apos;s headline framing is an open product question that will be decided from
          the attributed data itself.
        </p>
        <p>
          An audit sample (3% of unflagged documents) is independently reviewed by Pass 2 to
          estimate false negative rates — how many concerning documents Pass 1 might be missing.
          Across historical baselines, the audit false negative rate ranges from 0% (Biden 2021) to
          under 1% (Trump 2017–2018), indicating that Pass 1 screening correctly filters the vast
          majority of routine documents while catching most documents that warrant closer review.
        </p>
      </Section>

      {/* Thematic Drift */}
      <Section title="Thematic Drift (Descriptive Context)" id="thematic-drift">
        <p>
          Thematic drift uses embedding-based analysis to detect when the topics discussed in a
          category shift away from recent norms. It operates on an intra-administration rolling
          window (8 weeks):
        </p>
        <ul className="list-disc list-inside space-y-1 ml-2">
          <li>
            <strong>Centroid Distance</strong> — Cosine distance between the week&apos;s document
            centroid and the mean centroid of the preceding eight weeks (the current week is never
            part of its own comparison window).
          </li>
          <li>
            <strong>z-Score</strong> — That distance expressed against the typical week-to-week
            centroid movement inside the window, so a spike means the week departed from the recent
            average by far more than adjacent weeks normally differ from each other.
          </li>
          <li>
            <strong>Novel Document Rate</strong> — Fraction of the week&apos;s documents whose
            distance from the rolling centroid exceeds the calibrated novelty threshold (0.5, about
            the 90th percentile of typical document distances).
          </li>
          <li>
            <strong>Variance Ratio</strong> — Embedding variance of the week&apos;s documents
            relative to the window&apos;s: above 1 means topics are diversifying, below 1 means
            narrowing.
          </li>
          <li>
            <strong>Cross-Administration Distance</strong> — When available, comparison against a
            prior administration&apos;s baseline to contextualize whether a drift is historically
            unusual.
          </li>
        </ul>
        <p>
          During the bootstrap period (first weeks of a new administration), confidence is reduced
          because the rolling window lacks sufficient history for meaningful comparison.
        </p>
        <p>
          <strong>Data reprocessing.</strong> When scoring, filtering, or counting rules change, all
          historical periods are reprocessed under the new rules, so cross-era comparisons remain
          valid — rule changes do not create breaks in the data. When court-record collection was
          reworked in February 2026, document counts were made consistent in July 2026 by defining
          the counting population with a documented classifier applied uniformly to all periods (the{' '}
          <code>counting_scope</code> flag in the published data). If a future collection change
          cannot be reconciled this way, the volume-based research views mark it with{' '}
          <span className="text-dm-accent">▲</span> and suppress findings that overlap it. Concern
          statuses are derived from document <em>content</em> against absolute thresholds and are
          verified to remain comparable across every change (each pipeline change is gated on
          producing zero unexplained status flips), so the concern chart and status timeline carry
          no breaks.
        </p>
      </Section>

      {/* Concern Synthesis */}
      <Section title="Concern Synthesis" id="concern-synthesis">
        <p>
          AI document review drives the concern status for each category. Structural anomaly,
          silence detection, and thematic drift scores are preserved as descriptive metadata but do
          not influence the status.
        </p>
        <DataTable
          headers={['Status', 'Meaning', "How it's set (Pass 2 counts)"]}
          rows={[
            [
              'Consistent with baseline',
              'Document review within the baseline range. No departures detected.',
              CONCERN_LEVEL_THRESHOLDS.Stable,
            ],
            [
              'Notable departure',
              'Two-pass document review flags departures from baseline practice, with Pass 2 corroboration.',
              CONCERN_LEVEL_THRESHOLDS.Elevated,
            ],
            [
              'Sustained departure',
              'High Pass 2 rate of clear-departure documents (>20%). Warrants close examination.',
              CONCERN_LEVEL_THRESHOLDS.ConfirmedConcern,
            ],
          ]}
        />
        <p>
          AI document review is the <strong>sole active detection method</strong> driving concern
          status. Structural anomaly, silence detection, and thematic drift provide descriptive
          context but do not influence the concern status.
        </p>
      </Section>

      {/* Baselines */}
      <Section title="Baselines" id="baselines">
        <p>
          All anomaly detection requires a reference period for comparison. The system maintains
          eight historical baselines — every year of the two preceding administrations:
        </p>
        <DataTable
          headers={['Baseline', 'Period', 'Role']}
          rows={[
            [
              'Biden 2022',
              'Year 2 of term',
              'Primary baseline — chosen for stability and comprehensive source coverage',
            ],
            ['Biden 2021', 'Year 1 of term', 'First-year-in-term comparison'],
            ['Biden 2023', 'Year 3 of term', 'Late-term comparison'],
            ['Biden 2024', 'Year 4 of term', 'Election-year comparison'],
            ['Trump 2017', 'Year 1 of term', 'Cross-administration, first year'],
            ['Trump 2018', 'Year 2 of term', 'Cross-administration, same cycle year as primary'],
            ['Trump 2019', 'Year 3 of term', 'Cross-administration, late term'],
            ['Trump 2020', 'Year 4 of term', 'Cross-administration, election year'],
          ]}
        />
        <p>
          All eight baselines cover the same core data sources (Federal Register, CourtListener,
          DOJ, GovInfo, FEC, LegiScan, OIG) under uniform routing and filtering rules — see the
          coverage-parity note above for the July 2026 repairs that made this true across every
          period.
        </p>
        <p>
          <strong>Cycle-year adjustment:</strong> First-year administrations systematically differ
          from second-year administrations (higher executive order volume, more personnel changes).
          Cycle adjustment factors account for these predictable differences so that expected
          seasonal patterns don&apos;t trigger false positives.
        </p>
      </Section>

      {/* Keywords */}
      <Section title="Keywords as Annotations" id="keywords">
        <p>
          Keywords were Democracy Monitor&apos;s original detection mechanism, but as the detection
          architecture evolved, their role changed. Keywords now serve as{' '}
          <strong>contextual annotations</strong> — they help explain what the system is detecting,
          but they do not drive the concern status.
        </p>
        <p>
          Each category has curated keyword dictionaries organized by severity tier (capture, drift,
          warning). An administration-specific keyword overlay adds time-bounded terms relevant to
          the current administration. Baselines use only the core keyword set to avoid anachronistic
          false positives.
        </p>
      </Section>

      {/* Source Health */}
      <Section title="Source Health Monitoring" id="source-health">
        <p>
          The system continuously monitors the availability of its data sources. Six
          &quot;canary&quot; sources — critical feeds whose absence would significantly degrade
          analysis — are tracked with special attention.
        </p>
        <DataTable
          headers={['Level', 'Meaning']}
          rows={[
            ['High', 'All or nearly all sources responding normally'],
            ['Moderate', 'Some degradation or canary source concerns'],
            ['Low', 'Significant source unavailability'],
            ['Critical', 'Majority of sources unavailable'],
          ]}
        />
        <p>
          When source availability drops below critical thresholds, data coverage scores are capped
          to prevent high-confidence assessments based on incomplete data. A critical source health
          level caps the maximum confidence at 30%.
        </p>
      </Section>

      {/* AI Narrative Generation */}
      <Section title="AI Narrative Generation" id="ai-narrative-generation">
        <p>
          For categories at Elevated status or above, the system generates plain-language narrative
          summaries explaining what the detection system found and why. Narratives are produced in
          two versions:
        </p>
        <ul className="list-disc list-inside space-y-1 ml-2">
          <li>
            <strong>Expert</strong> — Technical analysis (400-800 words) for researchers and policy
            analysts, citing specific metrics, z-scores, and document references.
          </li>
          <li>
            <strong>Public</strong> — Accessible summary (200-500 words) for general audiences,
            avoiding jargon and focusing on practical meaning.
          </li>
        </ul>
        <p>
          Categories at Stable status use a template-based summary rather than AI generation, since
          there is nothing unusual to explain.
        </p>
      </Section>

      {/* Research Answers */}
      <Section title="Search: How Research Answers Are Generated" id="research-answers">
        <p>
          Research mode on the{' '}
          <Link href="/search" className="text-dm-accent hover:underline">
            Search page
          </Link>{' '}
          answers questions from the documentary record. Retrieval is hybrid: semantic similarity
          finds documents about the question&apos;s topic, while corpus-validated keyword expansion
          finds documents that use different vocabulary for the same subject (a question about
          &ldquo;Schedule F&rdquo; also searches the era&apos;s actual terms — the expanded terms
          are disclosed as &ldquo;Also searched&rdquo; chips above the results). Comparative
          questions retrieve evenly from each administration named, and every era&apos;s results
          balance primary sources (orders, rules, opinions, bills) with congressional discussion.
        </p>
        <p>
          The written answer is generated by an AI model grounded exclusively in the retrieved
          documents, with every claim cited back to a numbered document. Three safeguards apply:
          statements about missing coverage are scoped to the retrieved set, never generalized to
          the whole corpus; our own automated-review classifications are attributed explicitly when
          referenced, never presented as document content; and after generation, every quoted
          passage is machine-checked verbatim against the stored document text — the result appears
          under the answer (&ldquo;✓ verified&rdquo; or a caution when a quote could not be
          matched). Answers are generated fresh for each query, so wording varies between runs; the
          cited documents, which you can open directly, are the ground truth.
        </p>
      </Section>

      {/* AI Prompt Transparency */}
      <Section title="AI Prompt Transparency" id="ai-prompt-transparency">
        <p>
          The following are the production prompts used in the detection and narrative pipelines.
          Where template variables are used, they have been replaced with example values from the
          Government Worker Protections (Civil Service) category to show what the AI actually
          receives. You can evaluate the prompts for bias, test them yourself against the same
          documents, and{' '}
          <Link href="/feedback" className="text-dm-accent hover:underline">
            provide specific feedback
          </Link>{' '}
          if you think an instruction is unfair.
        </p>
        <PromptTransparency />
      </Section>

      {/* Reproducibility */}
      <Section title="Reproducibility" id="reproducibility">
        <p>
          All scoring thresholds, dimension weights, and configuration constants are defined in a
          single file (
          <code className="text-xs bg-dm-card px-1 py-0.5 rounded">
            lib/methodology/scoring-config.ts
          </code>
          ). Key values include:
        </p>
        <ul className="list-disc list-inside space-y-1 ml-2">
          <li>Structural anomaly threshold: composite z-score &gt; 2.5 (descriptive only)</li>
          <li>P2 Notable departure: ≥1 clear-departure OR ≥2 possible-departure</li>
          <li>P2 Sustained departure: ≥2 clear-departure, OR ≥3 departure docs with ≥20% rate</li>
          <li>Thematic drift window: 8 weeks rolling (descriptive only)</li>
          <li>Long-horizon cumulative tracking: 12 weeks</li>
          <li>Structural dampening: exponential decay for mild z-scores, JSD outlier cap</li>
        </ul>
        <p>
          The methodology constants are also available programmatically via the{' '}
          <code className="text-xs bg-dm-card px-1 py-0.5 rounded">/api/methodology</code> JSON
          endpoint. The full database can be restored locally for reproduction via{' '}
          <code className="text-xs bg-dm-card px-1 py-0.5 rounded">pnpm db:init</code> (see the{' '}
          <Link href="/data" className="text-dm-accent hover:underline">
            Data page
          </Link>
          ).
        </p>
      </Section>

      {/* Limitations */}
      <Section title="Limitations" id="limitations">
        <ul className="list-disc list-inside space-y-1">
          <li>
            <strong>Federal focus</strong> — The system monitors federal government activity. State
            and local government actions are not covered.
          </li>
          <li>
            <strong>Public information only</strong> — Actions taken through informal channels,
            verbal directives, or unpublished documents are invisible.
          </li>
          <li>
            <strong>Structural detection is descriptive, not evaluative</strong> — Structural
            anomaly detection identifies statistical departures from baselines. It cannot determine
            whether a departure is concerning or benign.
          </li>
          <li>
            <strong>AI assessment limitations</strong> — AI quality depends on the models used. The
            two-pass design mitigates single-provider bias but cannot eliminate it entirely.
          </li>
          <li>
            <strong>Thematic drift requires volume</strong> — Categories with few documents per week
            produce noisy drift signals.
          </li>
          <li>
            <strong>Source availability dependence</strong> — The system depends on government
            websites remaining accessible and APIs remaining stable.
          </li>
          <li>
            <strong>Baseline assumptions</strong> — Baselines reflect specific historical periods.
            Structural changes in government publishing practices could invalidate comparisons over
            time.
          </li>
          <li>
            <strong>Embedding coverage gaps</strong> — Thematic drift depends on document
            embeddings. Not all documents may have embeddings available.
          </li>
          <li>
            <strong>Automation bias</strong> — Presenting automated assessments alongside official
            government documents risks creating an impression of certainty. All findings are
            indicators warranting human review, not conclusions.
          </li>
        </ul>
      </Section>
    </>
  );
}

export default function MethodologyPage() {
  const { readingLevel } = useReadingLevel();

  return (
    <>
      <SEOHead
        title="Methodology"
        description="How Democracy Monitor assesses institutional health using AI two-pass content assessment."
        canonicalPath="/system/methodology"
      />

      <Link href="/" className="text-xs text-dm-accent hover:underline">
        &larr; Back to overview
      </Link>

      <h1 className="text-xl font-bold text-dm-text-primary mt-4 mb-6">Methodology</h1>

      <div className="max-w-3xl space-y-2">
        {readingLevel === 'summary' ? <SummaryContent /> : <DetailedContent />}
      </div>
    </>
  );
}
