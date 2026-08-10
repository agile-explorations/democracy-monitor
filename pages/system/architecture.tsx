import Link from 'next/link';
import { useEffect, useState } from 'react';
import { SEOHead } from '@/components/shared/SEOHead';
import { DataTable, Section } from '@/components/system/ContentHelpers';
import { useReadingLevel } from '@/lib/contexts/ReadingLevelContext';

/** Live running-version badge — the deployed release tag + short commit, read
 *  from /api/version (version baked from package.json, commit from Render). */
function RunningVersion() {
  const [info, setInfo] = useState<{ version?: string; commit?: string } | null>(null);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/version');
        if (res.ok && !cancelled) setInfo(await res.json());
      } catch {
        // Version badge is non-essential — stay hidden on failure.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);
  if (!info?.version) return null;
  const short = info.commit && info.commit !== 'unknown' ? info.commit.slice(0, 7) : null;
  return (
    <p className="text-xs text-dm-muted mt-1">
      Running <span className="font-mono">v{info.version}</span>
      {short && (
        <>
          {' · '}
          <span className="font-mono">{short}</span>
        </>
      )}
    </p>
  );
}

function SummaryContent() {
  return (
    <>
      <Section title="Overview" id="overview">
        <p>
          Democracy Monitor is a Next.js application backed by PostgreSQL (with pgvector for
          embeddings) and Redis for caching. It ingests documents from 9 government data source
          types, processes them through an AI-driven detection pipeline, and presents findings via
          an interactive dashboard.
        </p>
        <p>
          Weekly cron jobs fetch new documents, score them, compute weekly aggregates, generate
          embeddings, run AI two-pass content assessment, and produce narrative summaries. The
          entire pipeline is automated and requires no manual intervention.
        </p>
      </Section>

      <Section title="Detection Pipeline" id="detection-pipeline">
        <p>
          Documents flow through a multi-stage pipeline: fetch from external sources, store in
          PostgreSQL, score with keyword annotations, aggregate weekly, embed with OpenAI, assess
          with L2 AI content assessment (sole active detection layer) plus descriptive context
          layers (structural anomaly, silence/source health, thematic drift), and generate
          narratives for elevated categories.
        </p>
      </Section>

      <Section title="Data Sources" id="data-sources">
        <p>
          Nine source types provide coverage of different government activities, all of them
          government documents: the Federal Register (executive orders, rules), GovInfo
          (presidential documents via CPD, congressional reports, public laws), Congressional Record
          (CREC floor speeches), congressional hearing transcripts (CHRG), CourtListener (federal
          courts), DOJ press releases, Inspector General reports (HHS, DOJ, SSA, DHS), LegiScan
          (federal legislation), and FEC filings.
        </p>
      </Section>

      <Section title="Deployment" id="deployment">
        <p>
          The application is deployed on Render.com with a web service (Next.js), managed
          PostgreSQL, Redis key-value store, and three weekly cron jobs: LegiScan fetch (Monday
          01:00 UTC), snapshot pipeline (Monday 03:00 UTC), and database dump (Monday 05:00 UTC).
        </p>
      </Section>
    </>
  );
}

function DetailedContent() {
  return (
    <>
      <Section title="Tech Stack" id="tech-stack">
        <ul className="list-disc list-inside space-y-1 ml-2">
          <li>
            <strong>Framework</strong> — Next.js 14 with Pages Router, TypeScript strict mode
          </li>
          <li>
            <strong>Styling</strong> — Tailwind CSS with custom design tokens (dm-* color system)
          </li>
          <li>
            <strong>Database</strong> — PostgreSQL with Drizzle ORM and pgvector extension for
            embedding storage and similarity search
          </li>
          <li>
            <strong>Caching</strong> — Redis with automatic in-memory fallback when Redis is
            unavailable
          </li>
          <li>
            <strong>AI Providers</strong> — OpenAI (GPT-4o-mini for Layer 2 Pass 1, text-embedding
            for Layer 3) and Anthropic (Claude Sonnet for Layer 2 Pass 2 and narratives)
          </li>
          <li>
            <strong>Testing</strong> — Vitest with jsdom environment
          </li>
          <li>
            <strong>Linting</strong> — ESLint (next/core-web-vitals), OpenGrep custom rules, Knip
            for dead code detection
          </li>
          <li>
            <strong>Package Manager</strong> — pnpm
          </li>
        </ul>
      </Section>

      <Section title="Data Flow" id="data-flow">
        <p>Documents move through the system in a defined pipeline:</p>
        <div className="bg-dm-card border border-dm-border rounded-lg p-4 my-3">
          <div className="flex flex-wrap items-center gap-2 text-xs text-dm-text-secondary">
            <span className="bg-dm-bg px-2 py-1 rounded font-medium">Sources</span>
            <span className="text-dm-muted">&rarr;</span>
            <span className="bg-dm-bg px-2 py-1 rounded font-medium">Fetch</span>
            <span className="text-dm-muted">&rarr;</span>
            <span className="bg-dm-bg px-2 py-1 rounded font-medium">Store</span>
            <span className="text-dm-muted">&rarr;</span>
            <span className="bg-dm-bg px-2 py-1 rounded font-medium">Score</span>
            <span className="text-dm-muted">&rarr;</span>
            <span className="bg-dm-bg px-2 py-1 rounded font-medium">Aggregate</span>
            <span className="text-dm-muted">&rarr;</span>
            <span className="bg-dm-bg px-2 py-1 rounded font-medium">Embed</span>
            <span className="text-dm-muted">&rarr;</span>
            <span className="bg-dm-bg px-2 py-1 rounded font-medium">Assess</span>
            <span className="text-dm-muted">&rarr;</span>
            <span className="bg-dm-bg px-2 py-1 rounded font-medium">Narrate</span>
          </div>
        </div>
        <ul className="list-disc list-inside space-y-1 ml-2">
          <li>
            <strong>Fetch</strong> — Backfill pipeline fetches historical data; the weekly snapshot
            pipeline fetches incremental updates from all source types
          </li>
          <li>
            <strong>Store</strong> — Raw documents persisted to the{' '}
            <code className="text-xs bg-dm-card px-1 py-0.5 rounded">documents</code> table with
            source metadata
          </li>
          <li>
            <strong>Score</strong> — Keyword annotation layer matches documents against
            category-specific dictionaries (capture/drift/warning tiers)
          </li>
          <li>
            <strong>Aggregate</strong> — Weekly rollups computed per category for structural
            analysis (volume, type distribution, agency counts)
          </li>
          <li>
            <strong>Embed</strong> — OpenAI text-embedding-3-small generates vector embeddings
            stored via pgvector for thematic drift analysis
          </li>
          <li>
            <strong>Assess</strong> — AI document review (sole active detection layer) drives
            concern status; structural anomaly, silence detection, and thematic drift are computed
            as descriptive context per category
          </li>
          <li>
            <strong>Narrate</strong> — AI generates expert and public narrative summaries for
            elevated categories
          </li>
        </ul>
      </Section>

      <Section title="Source Types" id="source-types">
        <DataTable
          headers={['Source', 'What It Provides', 'Fetcher Module']}
          rows={[
            [
              'Federal Register',
              'Executive orders, rules, notices, presidential documents',
              'federal-register-fetcher.ts',
            ],
            [
              'CourtListener',
              'Federal court opinions (stored as documents) and case docket metadata via the RECAP archive (feeds the tracked_cases litigation tracker)',
              'courtlistener-fetcher.ts',
            ],
            [
              'DOJ Press Releases',
              'Department of Justice press releases across divisions',
              'doj-fetcher.ts',
            ],
            [
              'GovInfo',
              'Congressional reports, public laws, presidential documents (CPD)',
              'govinfo-fetcher.ts',
            ],
            ['FEC', 'Advisory opinions and Matters Under Review (MURs)', 'fec-fetcher.ts'],
            ['CREC', 'Congressional Record floor speeches (Senate + House)', 'crec-fetcher.ts'],
            [
              'CHRG',
              'Congressional hearing transcripts (7 committees, subject-routed)',
              'chrg-fetcher.ts',
            ],
            [
              'LegiScan',
              'Federal legislative bill tracking via bulk datasets',
              'legiscan-fetcher.ts',
            ],
            [
              'OIG',
              'Inspector General reports (HHS, DOJ, SSA, DHS)',
              'hhs/doj/ssa/dhs-oig-fetcher.ts',
            ],
          ]}
        />
        <p>
          All source fetchers follow a consistent module pattern:{' '}
          <code className="text-xs bg-dm-card px-1 py-0.5 rounded">parseParams()</code> parses
          signal URLs,{' '}
          <code className="text-xs bg-dm-card px-1 py-0.5 rounded">toContentItem()</code> normalizes
          responses, <code className="text-xs bg-dm-card px-1 py-0.5 rounded">fetchRecent()</code>{' '}
          handles weekly snapshots, and{' '}
          <code className="text-xs bg-dm-card px-1 py-0.5 rounded">fetchHistorical()</code> handles
          backfill.
        </p>
      </Section>

      <Section title="Database Schema" id="database-schema">
        <p>Key tables in the PostgreSQL database:</p>
        <DataTable
          headers={['Table', 'Purpose']}
          rows={[
            [
              'documents',
              'Raw documents from all sources with title, content, publication date, source metadata',
            ],
            [
              'document_scores',
              'Keyword annotation scores per document (tier, matched keywords, category)',
            ],
            [
              'weekly_aggregates',
              'Per-category weekly rollups (volume, type distribution, agency counts, tier breakdown) plus the AI-driven concern status and descriptive layer scores',
            ],
            [
              'ai_document_assessments',
              'Layer 2 AI assessment results (pass 1 flag, pass 2 classification, reasoning)',
            ],
            [
              'baselines',
              'Historical baseline statistics per category (mean, stddev, distributions)',
            ],
            [
              'tracked_cases',
              'Federal litigation case tracker: one row per case with court, filing/termination dates, status, posture, and category routing (refreshed weekly for open cases)',
            ],
            ['narratives', 'AI-generated expert and public narrative summaries'],
          ]}
        />
        <p>
          Migrations are managed via Drizzle ORM with a schema-first workflow. The schema is defined
          in <code className="text-xs bg-dm-card px-1 py-0.5 rounded">lib/db/schema.ts</code> and
          migrations are generated into the{' '}
          <code className="text-xs bg-dm-card px-1 py-0.5 rounded">drizzle/</code> directory.
        </p>
      </Section>

      <Section title="Cron Jobs" id="cron-jobs">
        <DataTable
          headers={['Job', 'Schedule', 'What It Does']}
          rows={[
            [
              'LegiScan Fetch',
              'Monday 01:00 UTC',
              'Downloads bulk legislative datasets from LegiScan, classifies bills into categories',
            ],
            [
              'Weekly Snapshot',
              'Monday 03:00 UTC',
              'Fetches new documents from all sources, runs AI assessment, computes aggregates, generates narratives',
            ],
            [
              'Database Dump',
              'Monday 05:00 UTC',
              'Creates a pg_dump backup on the persistent disk, served at /api/data/dump (GitHub Releases holds only the bootstrap dump)',
            ],
          ]}
        />
        <p>
          The snapshot pipeline orchestrates the full data flow: fetch, score, aggregate, embed,
          assess, and narrate. It is defined in{' '}
          <code className="text-xs bg-dm-card px-1 py-0.5 rounded">lib/cron/snapshot.ts</code>.
        </p>
      </Section>

      <Section title="API Routes" id="api-routes">
        <p>
          Server-side API routes act as proxies with caching and provide data endpoints for the
          dashboard:
        </p>
        <ul className="list-disc list-inside space-y-1 ml-2">
          <li>
            <code className="text-xs bg-dm-card px-1 py-0.5 rounded">/api/proxy</code> — CORS proxy
            with host whitelist, content-type detection, Redis caching
          </li>
          <li>
            <code className="text-xs bg-dm-card px-1 py-0.5 rounded">/api/federal-register</code> —
            Federal Register API proxy
          </li>
          <li>
            <code className="text-xs bg-dm-card px-1 py-0.5 rounded">/api/methodology</code> — JSON
            endpoint exposing scoring thresholds and configuration constants
          </li>
        </ul>
      </Section>

      <Section title="Deployment" id="deployment">
        <p>
          The application is configured for Render.com deployment via{' '}
          <code className="text-xs bg-dm-card px-1 py-0.5 rounded">render.yaml</code>:
        </p>
        <ul className="list-disc list-inside space-y-1 ml-2">
          <li>
            <strong>Web Service</strong> — Next.js application serving the dashboard and API routes
          </li>
          <li>
            <strong>PostgreSQL</strong> — Managed database with pgvector extension for embedding
            storage
          </li>
          <li>
            <strong>Redis</strong> — Key-value store for API response caching (600s default TTL)
          </li>
          <li>
            <strong>Cron Jobs</strong> — Three scheduled tasks (LegiScan fetch, weekly snapshot,
            database dump) running on Render&apos;s cron infrastructure
          </li>
        </ul>
      </Section>
    </>
  );
}

export default function ArchitecturePage() {
  const { readingLevel } = useReadingLevel();

  return (
    <>
      <SEOHead
        title="Architecture"
        description="System architecture and technical design of Democracy Monitor."
        canonicalPath="/system/architecture"
      />

      <Link href="/" className="text-xs text-dm-accent hover:underline">
        &larr; Back to overview
      </Link>

      <h1 className="text-xl font-bold text-dm-text-primary mt-4 mb-1">System Architecture</h1>
      <RunningVersion />
      <div className="mb-6" />

      <div className="max-w-3xl space-y-2">
        {readingLevel === 'summary' ? <SummaryContent /> : <DetailedContent />}
      </div>
    </>
  );
}
