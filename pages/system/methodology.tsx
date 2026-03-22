import Link from 'next/link';
import { SEOHead } from '@/components/shared/SEOHead';
import { DataTable, Section } from '@/components/system/ContentHelpers';
import { useReadingLevel } from '@/lib/contexts/ReadingLevelContext';

function ConvergenceStatus({
  color,
  label,
  description,
  className,
}: {
  color?: string;
  label: string;
  description: string;
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
      </div>
    </div>
  );
}

function SummaryContent() {
  return (
    <>
      {/* Overview */}
      <Section title="Overview">
        <p>
          Democracy Monitor is an open-source system that tracks signs of executive-power
          centralization across U.S. government institutions. It reads publicly available government
          documents — federal regulations, court filings, press releases, legislative reports — and
          uses three independent detection methods to identify when institutional norms may be
          shifting. When multiple methods flag the same category, confidence in the finding
          increases.
        </p>
        <p>
          The system is designed to surface patterns worth human examination, not render definitive
          judgments. All assessments trace to specific documents, reproducible metrics, and
          published thresholds.
        </p>
      </Section>

      {/* Detection Architecture */}
      <Section title="Detection Architecture">
        <p>
          Democracy Monitor uses two <strong>active detection layers</strong> that drive convergence
          status, plus two <strong>descriptive context layers</strong> that provide narrative
          grounding without influencing the status determination.
        </p>
        <p>
          <strong>AI Content Assessment (active)</strong> — Two-pass AI review using different
          providers (OpenAI for screening, Anthropic for detailed review) to ensure epistemic
          independence. Pass 2 receives week-level context including peer document titles and flag
          rate trajectory. Documents are classified from routine to clearly concerning.
        </p>
        <p>
          <strong>Silence Detection (active)</strong> — Measures whether government-controlled
          sources have gone unusually quiet while independent-branch sources (courts, Congress)
          remain active. Uses an 8-week intra-administration rolling window.
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
      </Section>

      {/* Convergence */}
      <Section title="Convergence Synthesis">
        <p>
          L2 AI content assessment is the sole active detection layer driving convergence status.
          Structural anomaly, silence detection, and thematic drift provide descriptive context.
        </p>
        <div className="space-y-2 ml-2">
          <ConvergenceStatus
            className="bg-dm-border"
            label="Stable"
            description="AI content assessment within baseline range. No concerns detected."
          />
          <ConvergenceStatus
            className="bg-dm-accent"
            label="Elevated"
            description="AI two-pass review flags anomalous content with Pass 2 corroboration."
          />
          <ConvergenceStatus
            color="#8b5cf6"
            label="Divergent"
            description="Legacy status from prior detection model. No longer produced by the current pipeline."
          />
          <ConvergenceStatus
            className="bg-status-capture"
            label="Confirmed Concern"
            description="AI content assessment elevated with high Pass 2 concern rate (>20%). Warrants close examination."
          />
        </div>
      </Section>

      {/* Limitations */}
      <Section title="Limitations">
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

function DetailedContent() {
  return (
    <>
      {/* Overview */}
      <Section title="Overview">
        <p>
          Democracy Monitor is an open-source system that tracks signs of executive-power
          centralization across U.S. government institutions. It reads publicly available government
          documents — federal regulations, court filings, press releases, legislative reports — and
          uses three independent detection methods to identify when institutional norms may be
          shifting. When multiple methods flag the same category, confidence in the finding
          increases.
        </p>
        <p>
          The system is designed to surface patterns worth human examination, not render definitive
          judgments. All assessments trace to specific documents, reproducible metrics, and
          published thresholds.
        </p>
      </Section>

      {/* Data Sources */}
      <Section title="Data Sources">
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
              'GovInfo / GAO',
              'GAO audit reports, congressional reports, public laws, presidential documents (CPD)',
              'Every few days',
            ],
            [
              'CourtListener',
              'Federal court opinions, docket entries, RECAP archive',
              'Every few days',
            ],
            [
              'DOJ Press Releases',
              'Department of Justice press releases across divisions',
              'Every few days',
            ],
            [
              'Inspector General (OIG)',
              'Audit reports and investigations from HHS, DOJ, and SSA Inspectors General',
              'Every few days',
            ],
            [
              'LegiScan',
              'State and federal legislative bill tracking via bulk datasets',
              'Periodic',
            ],
            [
              'FEC',
              'Federal Election Commission advisory opinions and Matters Under Review',
              'Weekly',
            ],
            [
              'GDELT',
              'Global news coverage of U.S. government activity (filtered to U.S. sources)',
              'Daily',
            ],
          ]}
        />
        <p>
          Additionally, RSS feeds from the FCC provide supplementary signals for specific
          categories. Each source type has an expected publication cadence. When a source goes
          silent beyond its expected window, the system flags it for attention and may reduce
          confidence in assessments that depend on that source.
        </p>
      </Section>

      {/* Categories */}
      <Section title="Categories">
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

      {/* Layer 1 */}
      <Section title="Structural Anomaly Detection (Descriptive Context)">
        <p>
          Layer 1 is fully deterministic and uses only document metadata — no text analysis. It
          compares the current week&apos;s document patterns against historical baselines across six
          dimensions:
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

      {/* Layer 2 */}
      <Section title="AI Document Assessment (Active Detection)">
        <p>
          Layer 2 uses artificial intelligence to read and evaluate individual documents. To reduce
          single-provider bias, it uses a two-pass design with different AI providers:
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
            Anthropic) independently assesses each flagged document, classifying it as: routine,
            novel but not concerning, potentially concerning, or clearly concerning. Using a
            different AI provider for each pass ensures that the two assessments are epistemically
            independent.
          </li>
        </ul>
        <p>
          Convergence status is determined by absolute Pass 2 classification counts — no
          cross-administration baseline comparison is needed:
        </p>
        <ul className="list-disc list-inside space-y-1 ml-2">
          <li>
            <strong>Stable</strong> — Pass 2 found no concerning documents (0 clearly concerning, ≤1
            potentially concerning)
          </li>
          <li>
            <strong>Elevated</strong> — ≥1 clearly concerning OR ≥2 potentially concerning documents
          </li>
          <li>
            <strong>Confirmed Concern</strong> — ≥2 clearly concerning, OR ≥3 concerning documents
            with ≥20% concern rate
          </li>
        </ul>
        <p>
          An audit sample (3% of unflagged documents) is independently reviewed by Pass 2 to
          estimate false negative rates — how many concerning documents Pass 1 might be missing.
          Across historical baselines, the audit false negative rate ranges from 0% (Biden 2021) to
          under 1% (Trump 2017–2018), indicating that Pass 1 screening correctly filters the vast
          majority of routine documents while catching most documents that warrant closer review.
        </p>
      </Section>

      {/* Layer 3 */}
      <Section title="Thematic Drift (Descriptive Context)">
        <p>
          Layer 3 uses embedding-based analysis to detect when the topics discussed in a category
          shift away from recent norms. Unlike Layers 1 and 2, it operates on an
          intra-administration rolling window (8 weeks):
        </p>
        <ul className="list-disc list-inside space-y-1 ml-2">
          <li>
            <strong>Centroid Distance</strong> — How far the current week&apos;s document embeddings
            are from the rolling centroid of recent weeks.
          </li>
          <li>
            <strong>Novel Document Rate</strong> — Fraction of documents dissimilar to any document
            in the rolling window.
          </li>
          <li>
            <strong>Variance Ratio</strong> — Whether document diversity is expanding or
            contracting.
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
      </Section>

      {/* Convergence */}
      <Section title="Convergence Synthesis">
        <p>
          L2 AI content assessment drives the convergence status for each category. Structural
          anomaly, silence detection, and thematic drift scores are preserved as descriptive
          metadata but do not influence the status.
        </p>
        <DataTable
          headers={['Status', 'Meaning']}
          rows={[
            ['Stable', 'AI content assessment within baseline range. No concerns detected.'],
            ['Elevated', 'AI two-pass review flags anomalous content with Pass 2 corroboration.'],
            [
              'Divergent',
              'Legacy status from prior detection model. No longer produced by the current pipeline.',
            ],
            [
              'Confirmed Concern',
              'AI content assessment elevated with high Pass 2 concern rate (>20%). Warrants close examination.',
            ],
          ]}
        />
        <p>
          L2 AI content assessment is the <strong>sole active detection layer</strong> driving
          convergence status. Structural anomaly, silence detection, and thematic drift provide
          descriptive context but do not influence the convergence status.
        </p>
      </Section>

      {/* Baselines */}
      <Section title="Baselines">
        <p>
          All anomaly detection requires a reference period for comparison. The system maintains
          four historical baselines:
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
            ['Trump 2017', 'Year 1 of term', 'Cross-administration, first year'],
            ['Trump 2018', 'Year 2 of term', 'Cross-administration, same cycle year as primary'],
          ]}
        />
        <p>
          All four baselines cover the same core data sources (Federal Register, CourtListener, DOJ,
          GovInfo, FEC, LegiScan, OIG) to ensure consistent comparison. Baselines that would have
          covered only a subset of sources were excluded.
        </p>
        <p>
          <strong>Cycle-year adjustment:</strong> First-year administrations systematically differ
          from second-year administrations (higher executive order volume, more personnel changes).
          Cycle adjustment factors account for these predictable differences so that expected
          seasonal patterns don&apos;t trigger false positives.
        </p>
      </Section>

      {/* Keywords */}
      <Section title="Keywords as Annotations">
        <p>
          Keywords were Democracy Monitor&apos;s original detection mechanism, but as the detection
          architecture evolved, their role changed. Keywords now serve as{' '}
          <strong>contextual annotations</strong> — they help explain what the system is detecting,
          but they do not drive the convergence status.
        </p>
        <p>
          Each category has curated keyword dictionaries organized by severity tier (capture, drift,
          warning). An administration-specific keyword overlay adds time-bounded terms relevant to
          the current administration. Baselines use only the core keyword set to avoid anachronistic
          false positives.
        </p>
      </Section>

      {/* Source Health */}
      <Section title="Source Health Monitoring">
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
      <Section title="AI Narrative Generation">
        <p>
          For categories at Elevated status or above, the system generates plain-language narrative
          summaries explaining what the detection layers found and why. Narratives are produced in
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

      {/* Reproducibility */}
      <Section title="Reproducibility">
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
          <li>P2 Elevated: ≥1 clearly concerning OR ≥2 potentially concerning</li>
          <li>P2 Confirmed Concern: ≥2 clearly concerning, OR ≥3 concerning with ≥20% rate</li>
          <li>Thematic drift window: 8 weeks rolling (descriptive only)</li>
          <li>Long-horizon cumulative tracking: 12 weeks</li>
          <li>Structural dampening: exponential decay for mild z-scores, JSD outlier cap</li>
        </ul>
        <p>
          The methodology constants are also available programmatically via the{' '}
          <code className="text-xs bg-dm-card px-1 py-0.5 rounded">/api/methodology</code> JSON
          endpoint. Seed data for local reproduction is available via{' '}
          <code className="text-xs bg-dm-card px-1 py-0.5 rounded">pnpm seed:import</code>.
        </p>
      </Section>

      {/* Limitations */}
      <Section title="Limitations">
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
            <strong>Structural detection is descriptive, not evaluative</strong> — Layer 1
            identifies statistical departures from baselines. It cannot determine whether a
            departure is concerning or benign.
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
            <strong>Embedding coverage gaps</strong> — Layer 3 depends on document embeddings. Not
            all documents may have embeddings available.
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
