import Link from 'next/link';
import { SEOHead } from '@/components/shared/SEOHead';
import { DataTable, Section } from '@/components/system/ContentHelpers';
import { PromptTransparency } from '@/components/system/PromptTransparency';
import { ReaderAuditPanel } from '@/components/system/ReaderAuditPanel';
import { VerdictRatesTable } from '@/components/system/VerdictRatesTable';
import { PASS2_PROMPT_VERSION } from '@/lib/ai/prompts/document-review-pass2';
import { useReadingLevel } from '@/lib/contexts/ReadingLevelContext';
import { BASELINE_CONFIGS } from '@/lib/data/baselines';
import { STANCE_SENTENCE, STANCE_TAIL } from '@/lib/data/charter-copy';
import { CONCERN_LEVEL_THRESHOLDS } from '@/lib/data/concern-level-explanations';
import { PASS2_INSTRUCTIONS_URL } from '@/lib/data/repo-links';

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

/** Baseline table rows from the instrument's own configuration (#812): the
 *  labels here are the windows the code measures against, not a paraphrase. */
const BASELINE_ROLES: Record<string, string> = {
  biden_2022: 'Primary baseline — chosen for stability and comprehensive source coverage',
  biden_2021: 'First-year-in-term comparison',
  biden_2023: 'Late-term comparison',
  biden_2024: 'Election-year comparison',
  trump_2017: 'Cross-administration, first year',
  trump_2018: 'Cross-administration, same cycle year as primary',
  trump_2019: 'Cross-administration, late term',
  trump_2020: 'Cross-administration, election year',
};
function baselineRows(): string[][] {
  return BASELINE_CONFIGS.map((b) => [
    b.label,
    `${b.from} to ${b.to} (year ${b.cycleYear} of term)`,
    BASELINE_ROLES[b.id] ?? '',
  ]);
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
          {STANCE_SENTENCE} — see{' '}
          <Link href="/why-this-matters#charter" className="text-dm-accent hover:underline">
            what this site is, and is not
          </Link>
          . {STANCE_TAIL} When it is wrong, the{' '}
          <Link href="/system/reversals" className="text-dm-accent hover:underline">
            reversals ledger
          </Link>{' '}
          says so.
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
          epistemic independence. The review&apos;s flag and departure rates for every era, and the
          swap audit that tests whether names alone move a verdict, are published in the detailed
          view under AI Document Review. Both passes receive up to 8,000 characters of
          boilerplate-stripped content. Pass 2 also receives week-level context including peer
          document titles and flag rate trajectory. Documents are classified from routine to clear
          departure (internal value: clearly_concerning).
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

      {/* Status synthesis (internal module name: concern synthesis) */}
      <Section title="Status Synthesis" id="concern-synthesis">
        <p>
          AI document review is the primary active detection method driving the weekly status.
          Structural anomaly, silence detection, and thematic drift provide descriptive context.
        </p>
        <p>
          A category&apos;s weekly status is set by counting how the Pass 2 review classified that
          week&apos;s documents:
        </p>
        <div className="space-y-2 ml-2">
          <ConcernLevel
            className="bg-dm-border"
            label="Consistent with norms"
            description="Document review within the baseline range. No departures detected. (Internal status: Stable.)"
            threshold={CONCERN_LEVEL_THRESHOLDS.Stable}
          />
          <ConcernLevel
            className="bg-dm-accent"
            label="Notable departure from norms"
            description="Two-pass document review flags departures from baseline practice, with Pass 2 corroboration. (Internal status: Elevated.)"
            threshold={CONCERN_LEVEL_THRESHOLDS.Elevated}
          />
          <ConcernLevel
            className="bg-status-capture"
            label="Sustained departure from norms"
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
          {STANCE_SENTENCE} — see{' '}
          <Link href="/why-this-matters#charter" className="text-dm-accent hover:underline">
            what this site is, and is not
          </Link>
          . {STANCE_TAIL} When it is wrong, the{' '}
          <Link href="/system/reversals" className="text-dm-accent hover:underline">
            reversals ledger
          </Link>{' '}
          says so.
        </p>
      </Section>

      {/* Data Sources */}
      <Section title="Data Sources" id="data-sources">
        <p>
          Democracy Monitor ingests documents from multiple source types, covering different facets
          of government activity:
        </p>
        <p>
          Every source is fetched by the weekly ingest run (Mondays); the cadence column describes
          how the source itself publishes, and where a source publishes with a delay, how far back
          each run looks so late documents still land in their proper week.
        </p>
        <DataTable
          headers={['Source', 'What It Provides', 'Source Cadence / Look-back']}
          rows={[
            [
              'Federal Register',
              'Executive orders, proclamations, proposed and final rules, notices, presidential documents',
              'Published daily; fetched weekly',
            ],
            [
              'GovInfo — Congressional Reports',
              'House and Senate committee reports (CRPT collection)',
              'Published continuously; fetched weekly',
            ],
            [
              'GovInfo — Compilation of Presidential Documents (CPD)',
              'Remarks, interviews, letters, statements, and the CPD renditions of orders and proclamations',
              'GPO loads documents roughly seven weeks after their issue date, so each weekly run re-reads a 120-day window (disclosed August 2026: a one-week window had ingested nothing after January 7, 2026; the gap was backfilled)',
            ],
            [
              'CourtListener',
              'Federal court opinions — every Supreme Court opinion including emergency-docket orders, plus circuit and D.D.C. opinions matching executive-power and First Amendment queries — and case docket metadata (RECAP) feeding the litigation tracker',
              'Published continuously; fetched weekly with a 42-day look-back for opinions whose text CourtListener extracts late',
            ],
            [
              'GAO',
              'Government Accountability Office reports (recovered through the Internet Archive; gao.gov blocks automated access)',
              'Published continuously; fetched weekly',
            ],
            [
              'DOJ Press Releases',
              'Department of Justice press releases across divisions',
              'Published daily; fetched weekly',
            ],
            [
              'DHS/ICE/CBP Press Releases',
              'Operational press releases from DHS headquarters, ICE (full newsroom, including local enforcement operations), and CBP (national media releases)',
              'Published daily; fetched weekly',
            ],
            [
              'Congressional Record (CREC)',
              'Senate and House floor speeches with speaker attribution',
              'Published daily when in session; fetched weekly',
            ],
            [
              'Congressional Hearings (CHRG)',
              'Committee hearing transcripts from seven committees (Judiciary, Oversight, Homeland Security, Appropriations, Armed Services, Administration, Intelligence)',
              'Weekly; transcripts publish months after hearings, so past weeks gain documents as transcripts become available',
            ],
            [
              'Inspector General (OIG)',
              'Audit reports and investigations from 11 Inspectors General: HHS, DOJ, SSA, and DHS directly; OPM, TIGTA, Treasury, State, EAC, FEC, and the Intelligence Community via oversight.gov',
              'Published continuously; fetched weekly',
            ],
            [
              'LegiScan',
              'Federal legislative bill tracking via bulk datasets',
              'Weekly bulk dataset; bills can carry dates weeks in the past, which the weekly run reconciles',
            ],
            [
              'FEC',
              'Federal Election Commission advisory opinions and Matters Under Review',
              'Checked weekly; the Commission has issued no advisory opinion since April 30, 2025 and opened no enforcement matter in 2026, so the feed is current but empty',
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
            independent.{' '}
            <a
              href={PASS2_INSTRUCTIONS_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="text-dm-accent hover:underline"
            >
              The instructions the reviewer receives
            </a>{' '}
            are public (version <code>{PASS2_PROMPT_VERSION}</code>).
          </li>
        </ul>
        <p>
          The weekly status is determined by absolute Pass 2 classification counts — no
          cross-administration baseline comparison is needed:
        </p>
        <ul className="list-disc list-inside space-y-1 ml-2">
          <li>
            <strong>Consistent with norms</strong> (internal: Stable) — Pass 2 found no departure
            documents (0 clear-departure, ≤1 possible-departure)
          </li>
          <li>
            <strong>Notable departure from norms</strong> (internal: Elevated) — ≥1 clear-departure
            OR ≥2 possible-departure documents
          </li>
          <li>
            <strong>Sustained departure from norms</strong> (internal: ConfirmedConcern) — ≥2
            clear-departure, OR ≥3 departure documents with ≥20% departure rate
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
        <h3 className="text-sm font-semibold text-dm-text-primary mt-4">
          The same review, every era, side by side
        </h3>
        <p>
          The rates below are the same two-pass review applied to every analysis period. They differ
          by era — that is the record and the reviewer combined, and the difference is not a finding
          on its own. Two things are published so a reader can interrogate it: the numbers
          themselves, and a <strong>swap audit</strong> — reviewed documents with the
          administration-identifying names mechanically exchanged and re-reviewed, alongside an
          unchanged re-run that measures the model&apos;s own draw-to-draw noise. A verdict that
          flips on names alone is a reviewer effect; the audit&apos;s flip rate, net of that noise,
          is reported on this page once each run completes. The two passes use different providers
          (OpenAI screens, Anthropic reviews) precisely so that no single model&apos;s disposition
          decides a status.
        </p>
        <p>
          <strong>Swap audit, 2026-08-28.</strong> We took 200 documents from the current term that
          the reviewer had already judged and that name the administration, changed only the names —
          Trump to Biden, Vance to Harris, the party names — and asked the reviewer to judge them
          again. Everything else stayed the same: the actions, the dates, the agencies, the
          quotations. If the reviewer judged actions and not names, the verdicts should not have
          moved.
        </p>
        <p>
          They moved in about one document in nine (11.6%; the plausible range is 8–17%). Judging
          the same unchanged text twice moves a verdict only 1.5% of the time, so the swap itself
          accounts for roughly 10 points. The movement was one-directional:{' '}
          <strong>
            when a current-term document was made to read as the other administration&apos;s, the
            reviewer usually found it <em>less</em> concerning
          </strong>{' '}
          (19 verdicts down, 3 up), almost entirely in the borderline &quot;possible departure&quot;
          tier — clear departures were judged the same either way.
        </p>
        <p>
          We then ran the mirror test: 190 documents from the Biden 2021–22 baseline, renamed to the
          current administration. Those verdicts moved in 4.2% of documents (range 2–8%), four up
          and four down, with zero movement on the unchanged re-run. Renaming a document to the
          current administration did <em>not</em> make the reviewer harsher. So this is not a
          general tilt against one party&apos;s name: the effect is specific to current-term
          documents, which lose their borderline verdicts once the names no longer fit the events
          they describe.
        </p>
        <p>
          In both tests, a borderline &quot;possible departure&quot; verdict had about a one-in-four
          chance of becoming &quot;routine&quot; once the names were changed (24% and 25%); routine
          verdicts almost never moved (2–3%). The current term has many more borderline documents —
          71 of 199 in the sample, against 8 of 189 in the Biden-era sample — which is why the
          effect shows there. The lesson is about the borderline tier: those verdicts carry a wide
          margin of error, and a name change is one of the things that can tip them. It is not about
          one administration&apos;s name. The effect is smaller than the difference in departure
          rates between eras shown in the table, and it sits in the tier that decides &quot;notable
          departure&quot; weeks, not the clear-departure counts behind &quot;sustained
          departure&quot;. We publish it rather than adjust the reviewer quietly: every status on
          this site was produced by the reviewer as it is, and any calibration will be its own
          documented change. The full ledger is on issue #772.
        </p>
        <VerdictRatesTable />
        <h3
          id="reader-audit"
          className="text-sm font-semibold text-dm-text-primary mt-4 scroll-mt-4"
        >
          Read by people who are not us
        </h3>
        <p>
          Each quarter, fifty of the reviewer&apos;s readings are drawn at random and read by two
          outside readers who see the document, the reading, and the reviewer&apos;s reasoning, and
          record whether they agree — and if not, what they would have said. Agreement is reported
          as-is; the readings both readers reject go to the reversals ledger.
        </p>
        <ReaderAuditPanel />
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

      {/* Status synthesis (internal module name: concern synthesis) */}
      <Section title="Status Synthesis" id="concern-synthesis">
        <p>
          AI document review drives the weekly status for each category. Structural anomaly, silence
          detection, and thematic drift scores are preserved as descriptive metadata but do not
          influence the status.
        </p>
        <DataTable
          headers={['Status', 'Meaning', "How it's set (Pass 2 counts)"]}
          rows={[
            [
              'Consistent with norms',
              'Document review within the baseline range. No departures detected.',
              CONCERN_LEVEL_THRESHOLDS.Stable,
            ],
            [
              'Notable departure from norms',
              'Two-pass document review flags departures from baseline practice, with Pass 2 corroboration.',
              CONCERN_LEVEL_THRESHOLDS.Elevated,
            ],
            [
              'Sustained departure from norms',
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
        <DataTable headers={['Baseline', 'Period', 'Role']} rows={baselineRows()} />
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
          <li>P2 Notable departure from norms: ≥1 clear-departure OR ≥2 possible-departure</li>
          <li>
            P2 Sustained departure from norms: ≥2 clear-departure, OR ≥3 departure docs with ≥20%
            rate
          </li>
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
