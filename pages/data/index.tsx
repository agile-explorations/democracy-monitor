import Link from 'next/link';
import { SEOHead } from '@/components/shared/SEOHead';
import { DataTable, Section } from '@/components/system/ContentHelpers';

const GITHUB_REPO = 'https://github.com/michaelkelly322/democracy-monitor';

function DownloadCard({
  title,
  description,
  href,
  filename,
}: {
  title: string;
  description: string;
  href: string;
  filename: string;
}) {
  return (
    <div className="border border-dm-border rounded-lg p-4 bg-dm-card">
      <h3 className="text-sm font-semibold text-dm-text-primary mb-1">{title}</h3>
      <p className="text-xs text-dm-text-secondary mb-3">{description}</p>
      <a
        href={href}
        download={filename}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md border border-dm-accent text-dm-accent hover:bg-dm-accent/10 transition-colors"
      >
        Download CSV
      </a>
    </div>
  );
}

export default function DataPage() {
  return (
    <>
      <SEOHead
        title="Data"
        description="Download Democracy Monitor datasets as CSV or PostgreSQL dump. API endpoint documentation for researchers."
        canonicalPath="/data"
      />

      <Link href="/" className="text-xs text-dm-accent hover:underline">
        &larr; Back to overview
      </Link>

      <h1 className="text-xl font-bold text-dm-text-primary mt-4 mb-2">Data</h1>
      <p className="text-sm text-dm-text-secondary mb-6 max-w-3xl">
        Democracy Monitor is open data. All assessment results, source documents, and computed
        metrics are available for download and programmatic access.
      </p>

      <div className="max-w-3xl space-y-2">
        <Section title="CSV Downloads">
          <div className="grid gap-4 sm:grid-cols-2">
            <DownloadCard
              title="Weekly Aggregates"
              description="One row per category-week with flattened structural, AI, thematic, and concern metrics."
              href="/api/export/weekly?format=csv"
              filename="weekly-aggregates.csv"
            />
            <DownloadCard
              title="Document Scores"
              description="One row per scored document with keyword matches, severity scores, and document class."
              href="/api/export/scores?format=csv"
              filename="document-scores.csv"
            />
          </div>
        </Section>

        <Section title="Full Database">
          <p>
            For developers and researchers who need the complete dataset, a PostgreSQL dump is
            available for download. The dump is a single{' '}
            <code className="text-xs bg-dm-card px-1 py-0.5 rounded">pg_dump -Fc</code> file
            including all tables (~2 GB): source documents, AI assessments, weekly aggregates,
            baselines, narratives, and vector embeddings. Updated weekly.
          </p>

          <div className="mt-3">
            <a
              href="/api/data/dump"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md border border-dm-accent text-dm-accent hover:bg-dm-accent/10 transition-colors"
            >
              Download PostgreSQL dump
            </a>
          </div>

          <h3 className="text-sm font-semibold text-dm-text-primary mt-4 mb-2">
            Key tables for researchers
          </h3>
          <DataTable
            headers={['Table', 'Description']}
            rows={[
              ['documents', 'Source documents with metadata, content, source type'],
              [
                'ai_document_assessments',
                'Per-document AI review (P1 flag, P2 classification, reasoning)',
              ],
              [
                'weekly_aggregates',
                'Category-week rollups with structural/AI/thematic/concern scores',
              ],
              ['baselines', 'Biden-era baseline statistics for comparison'],
              ['narratives', 'AI-generated weekly and term summaries'],
              ['document_scores', 'Per-document keyword assessment scores'],
            ]}
          />

          <h3 className="text-sm font-semibold text-dm-text-primary mt-4 mb-2">Setup</h3>
          <div className="bg-dm-bg border border-dm-border rounded-lg p-3 text-xs font-mono space-y-1">
            <p># Automatic (recommended)</p>
            <p>createdb democracy_monitor</p>
            <p>pnpm db:init --force</p>
            <p></p>
            <p># Manual</p>
            <p>curl -LO https://democracymonitor.us/api/data/dump</p>
            <p>pg_restore --clean --if-exists --no-owner -d democracy_monitor dump</p>
            <p>pnpm db:migrate</p>
          </div>
          <p className="mt-2">
            See{' '}
            <a
              href={`${GITHUB_REPO}/blob/main/DEPLOYMENT.md`}
              className="text-dm-accent hover:underline"
              target="_blank"
              rel="noopener noreferrer"
            >
              DEPLOYMENT.md
            </a>{' '}
            for full setup instructions. Schema is defined in{' '}
            <a
              href={`${GITHUB_REPO}/blob/main/lib/db/schema.ts`}
              className="text-dm-accent hover:underline"
              target="_blank"
              rel="noopener noreferrer"
            >
              lib/db/schema.ts
            </a>
            .
          </p>
        </Section>

        <Section title="API Endpoints">
          <DataTable
            headers={['Endpoint', 'Params', 'Description']}
            rows={[
              [
                '/api/export/weekly',
                'format (csv|json), category, from, to',
                'Weekly aggregate data per category with structural/AI/thematic scores',
              ],
              [
                '/api/export/scores',
                'format (csv|json), category, from, to',
                'Per-document keyword assessment scores with match details',
              ],
            ]}
          />
          <p>
            All endpoints default to JSON. Add{' '}
            <code className="text-xs bg-dm-card px-1 py-0.5 rounded">?format=csv</code> for CSV
            output with flattened columns (no JSON blobs).
          </p>
        </Section>

        <Section title="CSV Column Reference">
          <p>
            CSV exports flatten nested JSON fields into individual columns. Weekly aggregates
            include prefixed columns for each detection layer:
          </p>
          <ul className="list-disc list-inside space-y-1 ml-2">
            <li>
              <strong>structural_*</strong> — Composite score, per-dimension z-scores with raw
              values, baseline means, and baseline standard deviations (volume, type composition,
              functional distribution, agency activity, publication tempo, source convergence),
              anomalous flag, drift trend, long-horizon cumulative deviation/window, functional
              shifts (bucket:direction pairs)
            </li>
            <li>
              <strong>ai_*</strong> — Flag count, total documents, flag/concern rates, P2
              classification distribution (routine, novel, potentially/clearly concerning), audit
              false negative rate
            </li>
            <li>
              <strong>thematic_*</strong> — Centroid distance, z-score, novel document rate,
              variance ratio, cross-admin distance, rolling window metadata (weeks, mean distance,
              std dev), cross-admin baseline period, bootstrap flag
            </li>
            <li>
              <strong>concern_*</strong> — Status, pattern description, per-layer elevation flags
            </li>
          </ul>
          <p>
            Document scores flatten{' '}
            <code className="text-xs bg-dm-card px-1 py-0.5 rounded">matches</code> and{' '}
            <code className="text-xs bg-dm-card px-1 py-0.5 rounded">suppressed</code> arrays into
            count + comma-joined keyword columns.
          </p>
        </Section>

        <Section title="Rate Limits">
          <p>
            Export endpoints are rate-limited to 1 request per second per IP address. Responses
            include a <code className="text-xs bg-dm-card px-1 py-0.5 rounded">Retry-After</code>{' '}
            header when throttled.
          </p>
        </Section>
      </div>
    </>
  );
}
