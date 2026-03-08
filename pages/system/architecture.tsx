import Head from 'next/head';
import Link from 'next/link';
import { DataTable, Section } from '@/components/system/ContentHelpers';
import { useReadingLevel } from '@/lib/contexts/ReadingLevelContext';

function SummaryContent() {
  return (
    <>
      <Section title="Overview">
        <p>
          Democracy Monitor is a Next.js application backed by PostgreSQL (with pgvector for
          embeddings) and Redis for caching. It ingests documents from 7 government data sources,
          processes them through a three-layer detection pipeline, and presents findings via an
          interactive dashboard.
        </p>
        <p>
          A daily cron job fetches new documents, scores them, computes weekly aggregates, generates
          embeddings, runs the three-layer assessment, and produces narrative summaries. The entire
          pipeline is automated and requires no manual intervention.
        </p>
      </Section>

      <Section title="Detection Pipeline">
        <p>
          Documents flow through a multi-stage pipeline: fetch from external sources, store in
          PostgreSQL, score with keyword annotations, aggregate weekly, embed with OpenAI, assess
          across three independent layers (structural anomaly, AI document review, thematic drift),
          and generate narratives for elevated categories.
        </p>
      </Section>

      <Section title="Data Sources">
        <p>
          Seven source types provide coverage of different government activities: the Federal
          Register (executive orders, rules), White House briefings, GDELT global news,
          CourtListener (federal courts), DOJ press releases, GovInfo/GAO reports, and FEC filings.
          RSS feeds supplement specific categories.
        </p>
      </Section>

      <Section title="Deployment">
        <p>
          The application is deployed on Render.com with a web service (Next.js), managed
          PostgreSQL, Redis key-value store, and three cron jobs (daily snapshot, daily digest,
          hourly uptime check).
        </p>
      </Section>
    </>
  );
}

function DetailedContent() {
  return (
    <>
      <Section title="Tech Stack">
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

      <Section title="Data Flow">
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
            <strong>Fetch</strong> — Backfill pipeline fetches historical data; snapshot pipeline
            fetches daily increments from all source types
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
            <strong>Assess</strong> — Three-layer detection (structural anomaly, AI document review,
            thematic drift) runs independently per category
          </li>
          <li>
            <strong>Narrate</strong> — AI generates expert and public narrative summaries for
            elevated categories
          </li>
        </ul>
      </Section>

      <Section title="Source Types">
        <DataTable
          headers={['Source', 'What It Provides', 'Fetcher Module']}
          rows={[
            [
              'Federal Register',
              'Executive orders, rules, notices, presidential documents',
              'fr-fetcher.ts',
            ],
            [
              'CourtListener',
              'Federal court opinions, docket entries via RECAP archive',
              'courtlistener-fetcher.ts',
            ],
            [
              'DOJ Press Releases',
              'Department of Justice press releases across divisions',
              'doj-fetcher.ts',
            ],
            [
              'GovInfo / GAO',
              'GAO audit reports, congressional reports, public laws',
              'govinfo-fetcher.ts',
            ],
            ['FEC', 'Advisory opinions and Matters Under Review (MURs)', 'fec-fetcher.ts'],
            [
              'RSS / HTML / JSON',
              'Inspector General reports, FCC items, White House briefings',
              'rss-fetcher.ts',
            ],
            [
              'CPD (GDELT)',
              'Global news coverage filtered to U.S. government activity',
              'gdelt-fetcher.ts',
            ],
          ]}
        />
        <p>
          All source fetchers follow a consistent module pattern:{' '}
          <code className="text-xs bg-dm-card px-1 py-0.5 rounded">parseParams()</code> parses
          signal URLs,{' '}
          <code className="text-xs bg-dm-card px-1 py-0.5 rounded">toContentItem()</code> normalizes
          responses, <code className="text-xs bg-dm-card px-1 py-0.5 rounded">fetchRecent()</code>{' '}
          handles daily snapshots, and{' '}
          <code className="text-xs bg-dm-card px-1 py-0.5 rounded">fetchHistorical()</code> handles
          backfill.
        </p>
      </Section>

      <Section title="Database Schema">
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
              'Per-category weekly rollups (volume, type distribution, agency counts, tier breakdown)',
            ],
            [
              'ai_document_assessments',
              'Layer 2 AI assessment results (pass 1 flag, pass 2 classification, reasoning)',
            ],
            [
              'baselines',
              'Historical baseline statistics per category (mean, stddev, distributions)',
            ],
            ['assessment_snapshots', 'Three-layer convergence results per category per week'],
            ['narratives', 'AI-generated expert and public narrative summaries'],
            [
              'layer_scores',
              'Individual layer scores (L1 structural, L2 AI, L3 drift) per assessment',
            ],
          ]}
        />
        <p>
          Migrations are managed via Drizzle ORM with a schema-first workflow. The schema is defined
          in <code className="text-xs bg-dm-card px-1 py-0.5 rounded">lib/db/schema.ts</code> and
          migrations are generated into the{' '}
          <code className="text-xs bg-dm-card px-1 py-0.5 rounded">drizzle/</code> directory.
        </p>
      </Section>

      <Section title="Cron Jobs">
        <DataTable
          headers={['Job', 'Schedule', 'What It Does']}
          rows={[
            [
              'Daily Snapshot',
              '06:00 UTC',
              'Fetches new documents from all sources, runs three-layer assessment, generates narratives',
            ],
            ['Daily Digest', '07:00 UTC', 'Compiles assessment results into a digest notification'],
            ['Uptime Check', 'Hourly', 'Verifies source availability and flags silent sources'],
          ]}
        />
        <p>
          The snapshot pipeline orchestrates the full data flow: fetch, score, aggregate, embed,
          assess, and narrate. It is defined in{' '}
          <code className="text-xs bg-dm-card px-1 py-0.5 rounded">lib/cron/snapshot.ts</code>.
        </p>
      </Section>

      <Section title="API Routes">
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
            <code className="text-xs bg-dm-card px-1 py-0.5 rounded">/api/assess-status</code> —
            Assessment status endpoint delegating to the assessment service
          </li>
          <li>
            <code className="text-xs bg-dm-card px-1 py-0.5 rounded">/api/methodology</code> — JSON
            endpoint exposing scoring thresholds and configuration constants
          </li>
        </ul>
      </Section>

      <Section title="Deployment">
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
            <strong>Cron Jobs</strong> — Three scheduled tasks (snapshot, digest, uptime) running on
            Render&apos;s cron infrastructure
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
      <Head>
        <title>Architecture — Democracy Monitor</title>
        <meta
          name="description"
          content="System architecture and technical design of Democracy Monitor."
        />
      </Head>

      <Link href="/" className="text-xs text-dm-accent hover:underline">
        &larr; Back to overview
      </Link>

      <h1 className="text-xl font-bold text-dm-text-primary mt-4 mb-6">System Architecture</h1>

      <div className="max-w-3xl space-y-2">
        {readingLevel === 'summary' ? <SummaryContent /> : <DetailedContent />}
      </div>
    </>
  );
}
