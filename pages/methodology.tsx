import Head from 'next/head';
import Link from 'next/link';

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-8">
      <h2 className="text-base font-semibold text-dm-text-primary mb-3">{title}</h2>
      <div className="text-sm text-dm-text-secondary leading-relaxed space-y-3">{children}</div>
    </section>
  );
}

export default function Methodology() {
  return (
    <>
      <Head>
        <title>Methodology — Democracy Monitor</title>
        <meta
          name="description"
          content="How the Democracy Monitor assesses institutional health using three-layer triangulated detection."
        />
      </Head>

      {/* Back link */}
      <Link href="/" className="text-xs text-dm-accent hover:underline">
        &larr; Back to overview
      </Link>

      <h1 className="text-xl font-bold text-dm-text-primary mt-4 mb-6">Methodology</h1>

      <div className="max-w-3xl space-y-2">
        {/* Overview */}
        <Section title="Overview">
          <p>
            Democracy Monitor tracks institutional health across 13 categories of executive-power
            signals using a three-layer triangulated detection system. Rather than relying on any
            single method, the system combines structural anomaly detection, AI document assessment,
            and thematic drift monitoring. When multiple independent layers flag the same category,
            confidence in the finding increases.
          </p>
          <p>
            Data sources include the Federal Register, White House briefings, and GDELT global news
            coverage. All assessments trace to specific documents and reproducible metrics. The
            methodology and source code are open source.
          </p>
        </Section>

        {/* Layer 1 */}
        <Section title="Layer 1: Structural Anomaly Detection">
          <p>
            Layer 1 is fully deterministic and uses only document metadata — no text analysis. It
            compares the current week&apos;s document patterns against historical baselines across
            six dimensions:
          </p>
          <ul className="list-disc list-inside space-y-1 ml-2">
            <li>
              <strong>Volume</strong> — document count relative to baseline mean/stddev
            </li>
            <li>
              <strong>Type Composition</strong> — distribution of document types (executive orders,
              rules, notices) measured via Jensen-Shannon divergence
            </li>
            <li>
              <strong>Functional Distribution</strong> — shifts across 9 institutional function
              buckets (rulemaking, personnel actions, organizational changes, etc.)
            </li>
            <li>
              <strong>Agency Activity</strong> — changes in which agencies are publishing
            </li>
            <li>
              <strong>Publication Tempo</strong> — daily variance within the week
            </li>
            <li>
              <strong>Source Convergence</strong> — ratio of government vs. rhetoric sources
            </li>
          </ul>
          <p>
            Each dimension produces a z-score. The composite score is a weighted average with
            exponential dampening for mild z-scores and a cap on JSD outliers. A long-horizon
            component tracks cumulative deviation over 12 weeks to detect slow-building trends.
          </p>
        </Section>

        {/* Layer 2 */}
        <Section title="Layer 2: AI Document Assessment">
          <p>
            Layer 2 uses a two-pass AI assessment for epistemic independence — different AI
            providers evaluate documents independently:
          </p>
          <ul className="list-disc list-inside space-y-1 ml-2">
            <li>
              <strong>Pass 1 (Screening)</strong> — A fast model (gpt-4o-mini) evaluates every
              document for relevance to democratic institutional concerns. Documents are flagged as
              relevant or routine.
            </li>
            <li>
              <strong>Pass 2 (Detailed Review)</strong> — A different provider (Claude Sonnet)
              independently assesses each flagged document, classifying it as routine, novel but not
              concerning, potentially concerning, or clearly concerning.
            </li>
          </ul>
          <p>
            The flag rate is compared against baseline flag rates using z-scores. A concern rate
            (fraction of reviewed documents at &quot;potentially&quot; or &quot;clearly&quot;
            concerning) above 20% triggers elevated status. An audit sample of unflagged documents
            (3%) is reviewed by Pass 2 to estimate false negative rates.
          </p>
        </Section>

        {/* Layer 3 */}
        <Section title="Layer 3: Thematic Drift">
          <p>
            Layer 3 uses embedding-based analysis to detect when the topics being discussed in a
            category shift away from historical norms. It operates on an 8-week intra-administration
            rolling window:
          </p>
          <ul className="list-disc list-inside space-y-1 ml-2">
            <li>
              <strong>Centroid Distance</strong> — how far the current week&apos;s document
              embeddings are from the rolling centroid
            </li>
            <li>
              <strong>Novel Document Rate</strong> — fraction of documents dissimilar to any in the
              rolling window
            </li>
            <li>
              <strong>Variance Ratio</strong> — whether document diversity is expanding or
              contracting
            </li>
            <li>
              <strong>Cross-Admin Distance</strong> — comparison against a prior
              administration&apos;s baseline (when available)
            </li>
          </ul>
          <p>
            During the bootstrap period (first weeks of a new administration), confidence is reduced
            because the rolling window lacks sufficient history for comparison.
          </p>
        </Section>

        {/* Convergence */}
        <Section title="Convergence Synthesis">
          <p>
            The three layers are combined into a convergence status. Each layer independently
            determines whether it is &quot;elevated&quot; (anomalous). The convergence status
            reflects how many layers agree:
          </p>
          <div className="space-y-2 ml-2">
            <div className="flex items-start gap-3">
              <span className="inline-block w-3 h-3 mt-1 rounded-full bg-dm-border" />
              <div>
                <strong>Stable</strong> — No layers elevated. Patterns are within normal baseline
                range.
              </div>
            </div>
            <div className="flex items-start gap-3">
              <span className="inline-block w-3 h-3 mt-1 rounded-full bg-dm-accent" />
              <div>
                <strong>Elevated</strong> — One layer elevated. May reflect a single-dimension
                anomaly worth monitoring.
              </div>
            </div>
            <div className="flex items-start gap-3">
              <span
                className="inline-block w-3 h-3 mt-1 rounded-full"
                style={{ backgroundColor: '#8b5cf6' }}
              />
              <div>
                <strong>Divergent</strong> — Two or more layers independently flag anomalies.
                Multiple detection methods see something unusual.
              </div>
            </div>
            <div className="flex items-start gap-3">
              <span className="inline-block w-3 h-3 mt-1 rounded-full bg-status-capture" />
              <div>
                <strong>Confirmed Concern</strong> — Two or more layers elevated AND the AI concern
                rate is above 20%. Independent methods converge on concerning findings.
              </div>
            </div>
          </div>
        </Section>

        {/* Baselines */}
        <Section title="Baselines">
          <p>
            All anomaly detection requires a baseline for comparison. The primary baseline is Biden
            2022 (Year 2 of a first term), chosen for stability and comprehensive source coverage.
            Three additional baselines enable cross-comparison:
          </p>
          <ul className="list-disc list-inside space-y-1 ml-2">
            <li>Biden 2021 (Year 1) — first-year-in-term patterns</li>
            <li>Trump 2017 (Year 1) — different administration, first year</li>
            <li>Trump 2018 (Year 2) — different administration, same cycle year as primary</li>
          </ul>
          <p>
            Cycle adjustment factors account for systematic differences between Year 1 and Year 2
            patterns (e.g., first-year administrations tend to have higher executive order volume).
          </p>
        </Section>

        {/* Keywords */}
        <Section title="Keywords (Annotation Layer)">
          <p>
            Keywords were the original detection mechanism but now serve as contextual annotations.
            They do not drive the convergence status. Each category has curated keyword dictionaries
            organized by severity tier (capture, drift, warning). When documents contain these
            keywords, they are displayed as annotations to help explain what the three-layer system
            is detecting.
          </p>
          <p>
            An administration-specific keyword overlay adds time-bounded keywords relevant to the
            current administration. Baselines use only the core keyword set to avoid anachronistic
            false positives.
          </p>
        </Section>

        {/* Source Health */}
        <Section title="Source Health Monitoring">
          <p>
            The system continuously monitors the availability of its data sources. Six canary
            sources — critical feeds whose absence would significantly degrade analysis — are
            tracked with special attention. Source health maps to four integrity levels:
          </p>
          <ul className="list-disc list-inside space-y-1 ml-2">
            <li>
              <strong>High</strong> — all or nearly all sources responding normally
            </li>
            <li>
              <strong>Moderate</strong> — some degradation or canary concerns
            </li>
            <li>
              <strong>Low</strong> — significant source unavailability
            </li>
            <li>
              <strong>Critical</strong> — majority of sources unavailable
            </li>
          </ul>
          <p>
            When source availability drops below critical thresholds, data coverage scores are
            capped to prevent high-confidence assessments based on incomplete data.
          </p>
        </Section>

        {/* Limitations */}
        <Section title="Limitations">
          <ul className="list-disc list-inside space-y-1">
            <li>
              Structural anomaly detection identifies statistical departures from baselines — it
              cannot determine whether a departure is concerning or benign without additional
              context
            </li>
            <li>
              AI assessment quality depends on the models used and their training data; the two-pass
              design mitigates single-provider bias but cannot eliminate it
            </li>
            <li>
              Thematic drift requires sufficient document volume; categories with few documents per
              week may have noisy drift signals
            </li>
            <li>
              Source availability depends on government websites remaining accessible and APIs
              remaining stable
            </li>
            <li>
              The dashboard monitors publicly available information only — actions taken through
              informal channels or not publicly documented are invisible
            </li>
            <li>
              Baselines reflect specific historical periods; structural changes in government
              publishing practices could shift baselines over time
            </li>
            <li>
              All assessments are automated indicators, not definitive judgments — they are designed
              to surface patterns worth human examination
            </li>
          </ul>
        </Section>
      </div>
    </>
  );
}
