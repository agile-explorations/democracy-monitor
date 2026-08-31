import Link from 'next/link';
import { SEOHead } from '@/components/shared/SEOHead';
import { Section } from '@/components/system/ContentHelpers';
import { READER_INVITE_HREF } from '@/lib/data/reader-audits';

export default function RoadmapPage() {
  return (
    <>
      <SEOHead
        title="Roadmap"
        description="What Democracy Monitor is building next: durable-power infrastructure, rhetoric-versus-action analysis, budget-versus-actual spending, democracy index evidence mapping, and state-level coverage."
        canonicalPath="/system/roadmap"
      />

      <Link href="/" className="text-xs text-dm-accent hover:underline">
        &larr; Back to overview
      </Link>

      <h1 className="text-xl font-bold text-dm-text-primary mt-4 mb-6">Roadmap</h1>

      <div className="max-w-3xl">
        <Section title="Current State" id="current-state">
          <p>
            The system ingests documents from 10 federal sources — the Federal Register,
            Congressional Record, congressional hearing transcripts, CourtListener, Compilation of
            Presidential Documents, GovInfo congressional reports and public laws, DOJ press
            releases, DHS/ICE/CBP press releases, Inspector General reports from 11 offices, and
            LegiScan federal bills plus FEC advisory opinions — and assesses each across 14
            categories of democratic institutional health.
          </p>
          <p>
            Detection has been validated against 39 known democratic erosion events across both
            Trump administrations (2017–2018 and 2025–present), including the travel ban executive
            orders, James Comey firing, DACA rescission, mass Inspector General firings, Schedule F
            reinstatement, and DOGE agency interventions. Negative-control periods drawn from normal
            governance are used to verify the system does not produce false alarms; these controls
            are re-run as the methodology evolves.
          </p>
          <p>
            The system covers a continuous documentary record from 2017 to the present — both Trump
            terms and the Biden term, with the final stretches of gap-year backfill nearing
            completion. New documents are processed weekly.
          </p>
          <p>
            Alongside the document corpus, a federal litigation tracker follows over 200,000 court
            cases routed to the monitored categories — each with its court, filing and termination
            dates, and current procedural posture, refreshed weekly for active cases and browsable
            from every category page.
          </p>
        </Section>

        <h2 className="text-base font-semibold text-dm-text-primary mb-4">What&apos;s Next</h2>
        <p className="text-sm text-dm-text-secondary leading-relaxed mb-4">
          The sections below are the build order, each with its status. First, the standing
          commitment that shapes all of them:
        </p>

        <Section title="What we won't build" id="what-we-wont-build">
          <p>
            No calls to action. No petitions, no scorecards ranking officials, no endorsements, no
            &ldquo;take action&rdquo; button, no email list that asks you to do anything but read.
          </p>
          <p>
            The record is the product. What to do about it is yours. If you ever find this site
            telling you what to do, that is a defect —{' '}
            <Link href="/feedback" className="text-dm-accent hover:underline">
              report it
            </Link>
            .
          </p>
        </Section>

        <Section title="Detection Quality & Platform Hardening" id="detection-quality">
          <p className="italic text-dm-muted text-xs mb-2">In progress</p>
          <p>
            Completing the foundation. This includes finishing the last stretches of historical
            backfill (the 2019–2020 and 2023–2024 gap years are now largely in place), improving the
            data download and API access on our Data page, and ongoing refinement of the detection
            methodology based on what we learn each week. The goal: the most complete, accurate, and
            accessible repository of assessed government documents available anywhere.
          </p>
        </Section>

        <span id="authoritarian-infrastructure" />
        <Section title="Durable-Power Infrastructure" id="durable-power-infrastructure">
          <p>
            <p className="italic text-dm-muted text-xs mb-2">Next up</p>
            Nobody systematically tracks whether the government is building operational capacity
            that would outlast the president assembling it — not what officials say, and not what
            policies are announced, but whether the personnel, surveillance technology, enforcement
            networks, and funding are being put in place to act at scale. Which powers outlast the
            president who builds them is the question this analysis would answer with procurement
            and staffing records.
          </p>
          <p>
            Existing organizations do excellent work tracking detention capacity (the{' '}
            <a
              href="https://deportationdata.org"
              className="text-dm-accent hover:underline"
              target="_blank"
              rel="noopener noreferrer"
            >
              Deportation Data Project
            </a>{' '}
            at UC Berkeley Law,{' '}
            <a
              href="https://detentionreports.com"
              className="text-dm-accent hover:underline"
              target="_blank"
              rel="noopener noreferrer"
            >
              Detention Reports
            </a>
            , the{' '}
            <a
              href="https://immigrantjustice.org"
              className="text-dm-accent hover:underline"
              target="_blank"
              rel="noopener noreferrer"
            >
              National Immigrant Justice Center
            </a>
            ). Rather than duplicate their work, we plan to integrate their data and focus on the
            dimensions nobody else watches:
          </p>
          <ul className="list-disc list-inside space-y-1 ml-2">
            <li>
              <strong>Personnel buildup</strong> — federal law enforcement hiring patterns across
              agencies, tracked through USAJobs data
            </li>
            <li>
              <strong>Surveillance procurement</strong> — technology contracts for facial
              recognition, border surveillance, biometric databases, and social media monitoring,
              tracked through SAM.gov
            </li>
            <li>
              <strong>Information control</strong> — degradation of public access to government
              data, including FOIA response times, removal of datasets from government websites, and
              reduced statistical publications
            </li>
            <li>
              <strong>Enforcement network expansion</strong> — the rate at which new agreements
              between federal immigration authorities and local law enforcement come online,
              expanding the reach of enforcement operations
            </li>
            <li>
              <strong>Immigration court capacity</strong> — judicial throughput for processing
              enforcement actions at scale
            </li>
          </ul>
          <p>
            The unique contribution is the convergence: when detention expansion, personnel buildup,
            surveillance procurement, and document-level concern all point in the same direction
            simultaneously, that tells a story no single data source reveals.
          </p>
        </Section>

        <Section title="Rhetoric vs. Action Analysis" id="rhetoric-action">
          <p>
            <p className="italic text-dm-muted text-xs mb-2">
              Under consideration — tell us if this matters to you
            </p>
            Democratic erosion often follows a pattern: officials first say something, then the
            government does something. A president calls an agency &ldquo;corrupt and
            wasteful&rdquo; — weeks later, thousands of employees are placed on leave. A secretary
            announces a &ldquo;reorganization&rdquo; — days later, career staff are terminated.
          </p>
          <p>
            We plan to add new rhetoric sources — presidential social media (Truth Social), press
            conference transcripts (American Presidency Project at UCSB), and cabinet agency
            newsroom statements — alongside the congressional floor speeches and presidential
            documents we already track. Each document will be classified along two independent
            dimensions: <strong>rhetoric vs. action</strong> (is someone saying something, or is the
            government doing something?) and <strong>channel formality</strong> (official record,
            direct-to-public, or surrogate amplification).
          </p>
          <p>The analysis will be built in stages:</p>
          <ol className="list-decimal list-inside space-y-1 ml-2">
            <li>
              <strong>Standalone dashboards</strong> showing rhetoric intensity and action intensity
              side by side per category, with no matching required — the visual juxtaposition is
              itself informative
            </li>
            <li>
              <strong>An expert matching tool</strong> where domain experts draw connections between
              specific statements and specific government actions, building a dataset of confirmed
              rhetoric-to-action links with immediate feedback on how each connection improves the
              analysis
            </li>
            <li>
              <strong>Automation</strong> only where expert-confirmed data proves it&apos;s reliable
              — if automated matching can&apos;t achieve sufficient precision, the expert tool is
              the product
            </li>
          </ol>
        </Section>

        <Section title="Following the Money" id="following-the-money">
          <p className="italic text-dm-muted text-xs mb-2">
            <p className="italic text-dm-muted text-xs mb-2">
              Filed, not scheduled — investigation complete
            </p>
            Under consideration — tell us if this matters to you
          </p>
          <p>
            Documents show what the government says it will do. Budget and spending data show what
            it actually does. Federal sources make both sides public: the President&apos;s Budget
            (per-agency request documents and account-level budget tables back to 1962) and the
            Treasury&apos;s monthly outlay data (actual spending per agency, back to 1980) — which
            together support a programmatic <strong>budget-vs-actual</strong> comparison for every
            agency.
          </p>
          <p>We&apos;re considering building, in stages:</p>
          <ol className="list-decimal list-inside space-y-1 ml-2">
            <li>
              <strong>Budget documents in search</strong> — agency budget requests become searchable
              and citable in Research mode, so questions about funding get outcome-grounded answers
            </li>
            <li>
              <strong>A budget-vs-actual view</strong> — per-agency spending trendlines against
              plan, surfacing divergences like appropriated funds that stop flowing (the core
              question of our Fiscal Independence category, today visible only through litigation)
              or enforcement spending that surges past what Congress budgeted
            </li>
            <li>
              <strong>Claims vs. spending</strong> — placing agency press releases (which we now
              archive comprehensively for DHS, ICE, and CBP) next to the money that did or
              didn&apos;t follow them
            </li>
          </ol>
          <p>
            This would touch several other items on this page: it adds the funding backbone that{' '}
            <a href="#durable-power-infrastructure" className="text-dm-accent hover:underline">
              Durable-Power Infrastructure
            </a>{' '}
            needs (tracking whether enforcement capacity is being <em>funded</em>, not just
            announced); it gives{' '}
            <a href="#rhetoric-action" className="text-dm-accent hover:underline">
              Rhetoric vs. Action Analysis
            </a>{' '}
            its hardest form of &ldquo;action&rdquo; (money moving); and it would expand the{' '}
            <a href="#current-state" className="text-dm-accent hover:underline">
              current corpus
            </a>{' '}
            with its first structured-data sources alongside documents. Spending anomalies would
            appear as descriptive context first — they would not drive concern statuses unless that
            proves warranted and is adopted as an explicit methodology change.
          </p>
          <p>
            If budget-vs-actual visibility would be useful to your work, we&apos;d like to hear it —{' '}
            <a href="/feedback" className="text-dm-accent hover:underline">
              send us feedback
            </a>
            . Demand helps us prioritize this against other roadmap items.
          </p>
        </Section>

        <Section title="Democracy Index Evidence Mapping" id="democracy-index-mapping">
          <p>
            <p className="italic text-dm-muted text-xs mb-2">
              Under consideration — tell us if this matters to you
            </p>
            V-Dem and Freedom House produce the most widely cited assessments of democratic health
            worldwide. What they cannot provide is the evidentiary trail: which specific government
            actions support their assessments? We plan to map their indicators to Democracy
            Monitor&apos;s 14 categories and present the documentary evidence — the specific
            regulations, court filings, executive orders, and enforcement actions — that a
            researcher would need to evaluate those assessments for themselves.
          </p>
          <p>
            The documents may confirm an index&apos;s assessment, complicate it, or reveal dynamics
            the annual score missed entirely. Democracy Monitor does not validate or invalidate any
            specific index. It provides the primary-source documents and lets researchers form their
            own conclusions.
          </p>
        </Section>

        <Section title="Project 2025 Implementation Tracking" id="project-2025">
          <p>
            <p className="italic text-dm-muted text-xs mb-2">
              Under consideration — tell us if this matters to you
            </p>
            Existing trackers (
            <a
              href="https://project2025.observer"
              className="text-dm-accent hover:underline"
              target="_blank"
              rel="noopener noreferrer"
            >
              Project 2025 Observer
            </a>
            ,{' '}
            <a
              href="https://progressivereform.org"
              className="text-dm-accent hover:underline"
              target="_blank"
              rel="noopener noreferrer"
            >
              Center for Progressive Reform
            </a>
            ) do comprehensive work tracking implementation status. Democracy Monitor&apos;s
            contribution would be narrower: linking each implementation to the specific government
            documents in our repository, identifying instances where government actions go beyond
            what was proposed, and connecting implementation data to the other analytical
            dimensions.
          </p>
        </Section>

        <Section title="State-Level Research Corpus" id="state-level">
          <p>
            <p className="italic text-dm-muted text-xs mb-2">Filed, not scheduled</p>
            Significant threats to democratic governance originate at state legislatures, state
            courts, and governors&apos; offices. We plan to extend the document repository to cover
            state-level bills, court opinions, and executive orders, beginning with states that
            democracy indices flag for declining democratic quality. Governor executive orders,
            which no one currently aggregates across all 50 states in machine-readable form, are a
            particular focus. State-level analysis will build incrementally — starting with making
            the documents searchable and downloadable, then adding assessment capabilities as we
            develop the state-specific context needed to distinguish genuine erosion signals from
            normal state governance variation.
          </p>
        </Section>

        <Section title="How You Can Help" id="how-to-help">
          <p>
            <strong>Read fifty documents and tell us where we&apos;re wrong.</strong> Each quarter,
            fifty of the reviewer&apos;s readings go to two people who are not us. The 2026-Q3
            packet is ready and waiting for its readers.{' '}
            <Link href={READER_INVITE_HREF} className="text-dm-accent hover:underline">
              Volunteer
            </Link>
            .
          </p>
          <p>
            <strong>Dispute a specific reading.</strong> Every reviewed document carries a way to
            say the reading is wrong. Disputes are published once reviewed, and the ones that change
            a reading go in the{' '}
            <Link href="/system/reversals" className="text-dm-accent hover:underline">
              reversals ledger
            </Link>
            .
          </p>
          <p>
            <strong>Use the site and tell us what&apos;s missing.</strong> The most valuable
            feedback comes from domain experts who know the events and can tell us what we got right
            and wrong.
          </p>
          <p>
            <strong>Contribute data expertise.</strong> The rhetoric-action analysis will need
            experts who can confirm connections between statements and government actions. If you
            study executive power, administrative law, or specific policy domains, your knowledge
            makes the analysis better.
          </p>
          <p>
            <strong>Support the project.</strong> Democracy Monitor runs on AI infrastructure that
            costs real money. Every document is assessed through two AI passes, narratives are
            generated weekly, and the system processes new documents on a continuous basis. One-time
            and monthly contributions on the{' '}
            <Link href="/support" className="text-dm-accent hover:underline">
              support page
            </Link>{' '}
            go directly to these operating costs.
          </p>
          <p>
            <strong>Contribute code.</strong> The project is open source on{' '}
            <a
              href="https://github.com/agile-explorations/democracy-monitor"
              className="text-dm-accent hover:underline"
              target="_blank"
              rel="noopener noreferrer"
            >
              GitHub
            </a>
            . Issues tagged &ldquo;good first issue&rdquo; are available for contributors.
          </p>
        </Section>

        <Section title="Principles" id="principles">
          <p>
            The project&apos;s stance — what it claims, why it stops at the record, how to catch it
            being wrong — lives on{' '}
            <Link href="/why-this-matters#charter" className="text-dm-accent hover:underline">
              the charter
            </Link>
            . Two principles are specific to building it:
          </p>
          <p>
            <strong>Credit others.</strong> Where existing organizations do excellent work, we
            integrate and link rather than duplicate. Democracy Monitor is one tool in an ecosystem
            of civic technology, academic research, and investigative journalism.
          </p>
          <p>
            <strong>Honest about limitations.</strong> The system&apos;s blind spots are listed in
            our own words on the{' '}
            <Link href="/system/methodology#limitations" className="text-dm-accent hover:underline">
              methodology page
            </Link>
            , and every correction is published in the{' '}
            <Link href="/system/reversals" className="text-dm-accent hover:underline">
              reversals ledger
            </Link>
            .
          </p>
        </Section>
      </div>
    </>
  );
}
