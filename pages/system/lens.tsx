import Link from 'next/link';
import { SEOHead } from '@/components/shared/SEOHead';
import { DataTable, Section } from '@/components/system/ContentHelpers';
import { PASS1_PROMPT_VERSION } from '@/lib/ai/prompts/document-review-pass1';
import { PASS2_PROMPT_VERSION } from '@/lib/ai/prompts/document-review-pass2';
import { ASSESSMENT_LABELS, EROSION_TYPE_LABELS } from '@/lib/data/assessment-labels';
import { BASELINE_CONFIGS } from '@/lib/data/baselines';
import { CATEGORIES } from '@/lib/data/categories';
import { keyToSlug } from '@/lib/data/category-slugs';
import { APPARATUS_HEADING, APPARATUS_INTRO, GOOD_REPAIR_PHRASE } from '@/lib/data/charter-copy';
import { CONCERN_LEVEL_LABELS } from '@/lib/data/concern-level-explanations';
import { MODEL_ROLES } from '@/lib/data/model-roster';
import { PASS2_INSTRUCTIONS_URL, repoBlobUrl } from '@/lib/data/repo-links';

/**
 * The lens (#812, copy review 2026-08-29): the full apparatus inventory —
 * every table the charter's six bullets summarize — rendered from the same
 * constants the instrument runs on. The charter keeps the bullets; this page
 * keeps the detail. Nothing here is prose except the framing lines.
 */

const link = 'text-dm-accent hover:underline';

function Categories() {
  return (
    <ul className="columns-2 gap-6 text-sm text-dm-text-secondary">
      {CATEGORIES.map((c) => (
        <li key={c.key}>
          <Link href={`/category/${keyToSlug(c.key)}`} className={link}>
            {c.title}
          </Link>{' '}
          <code className="text-[11px] text-dm-muted">{c.key}</code>
        </li>
      ))}
    </ul>
  );
}

function Baselines() {
  const rows = [...BASELINE_CONFIGS]
    .sort((a, b) => a.from.localeCompare(b.from))
    .map((b) => [b.label, `${b.from} → ${b.to}`, `year ${b.cycleYear} of term`, b.id]);
  return <DataTable headers={['Baseline', 'Window', 'Cycle', 'Stored id']} rows={rows} />;
}

function Vocabulary() {
  const readings = Object.entries(ASSESSMENT_LABELS).map(([stored, shown]) => [shown, stored]);
  const mechanisms = Object.entries(EROSION_TYPE_LABELS).map(([stored, shown]) => [shown, stored]);
  const statuses = Object.entries(CONCERN_LEVEL_LABELS).map(([stored, shown]) => [shown, stored]);
  return (
    <>
      <h3 className="text-sm font-semibold text-dm-text-primary">The four readings</h3>
      <DataTable headers={['On the screen', 'Stored as (assessment)']} rows={readings} />
      <h3 className="text-sm font-semibold text-dm-text-primary">The five mechanisms</h3>
      <DataTable headers={['On the screen', 'Stored as (erosion_type)']} rows={mechanisms} />
      <h3 className="text-sm font-semibold text-dm-text-primary">Weekly statuses</h3>
      <DataTable headers={['On the screen', 'Stored as (status)']} rows={statuses} />
    </>
  );
}

function Models() {
  const rows = MODEL_ROLES.map((m) => [m.label, m.name, m.provider, m.id]);
  return <DataTable headers={['Role', 'Model', 'Provider', 'Exact id']} rows={rows} />;
}

export default function LensPage() {
  return (
    <>
      <SEOHead
        title="The lens"
        description="Everything Democracy Monitor decided before reading a single document — categories, baselines, readings, mechanisms, models, and prompt versions — rendered from the code that runs."
        canonicalPath="/system/lens"
      />
      <Link href="/why-this-matters#apparatus" className="text-xs text-dm-accent hover:underline">
        &larr; The charter
      </Link>
      <h1 className="text-xl font-bold text-dm-text-primary mt-4 mb-1">{APPARATUS_HEADING}</h1>
      <p className="text-sm text-dm-text-secondary mb-6">
        <span className="text-dm-text-primary font-medium">{GOOD_REPAIR_PHRASE}</span>{' '}
        {APPARATUS_INTRO} Every list on this page is generated from the constants the instrument
        runs on; when the code changes, this page changes with it.
      </p>
      <div className="max-w-3xl space-y-2">
        <Section title="Fourteen categories" id="categories">
          <Categories />
        </Section>
        <Section title="Eight baseline years" id="baselines">
          <Baselines />
          <p>There is no baseline before 2017.</p>
        </Section>
        <Section title="The words on the screen, and the words in the data" id="vocabulary">
          <p>
            The stored names predate the charter and remain in every export; the display names
            describe departure from documented practice without valence.
          </p>
          <Vocabulary />
        </Section>
        <Section title="Every model, by role" id="models">
          <p>
            Two companies&apos; models, on purpose. Neither model&apos;s priors are inspectable by
            us.
          </p>
          <Models />
        </Section>
        <Section title="The instructions the models receive" id="prompts">
          <ul className="list-disc list-inside space-y-1">
            <li>
              <a
                href={repoBlobUrl('lib/ai/prompts/document-review-pass1.ts')}
                className={link}
                target="_blank"
                rel="noopener noreferrer"
              >
                Pass 1 screening instructions
              </a>{' '}
              (version <code>{PASS1_PROMPT_VERSION}</code>)
            </li>
            <li>
              <a
                href={PASS2_INSTRUCTIONS_URL}
                className={link}
                target="_blank"
                rel="noopener noreferrer"
              >
                Pass 2 review instructions
              </a>{' '}
              (version <code>{PASS2_PROMPT_VERSION}</code>)
            </li>
            <li>
              <Link href="/system/methodology#ai-prompt-transparency" className={link}>
                Every prompt, rendered with an example
              </Link>
            </li>
          </ul>
        </Section>
        <Section title="When any of this was wrong" id="repair">
          <p>
            <Link href="/system/reversals" className={link}>
              The reversals ledger
            </Link>{' '}
            records every correction, status change after repair, held publication, regeneration,
            and audit — with dates and evidence.
          </p>
        </Section>
      </div>
    </>
  );
}
