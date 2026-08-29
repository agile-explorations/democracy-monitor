import Link from 'next/link';
import { PASS2_PROMPT_VERSION } from '@/lib/ai/prompts/document-review-pass2';
import { ASSESSMENT_LABELS, EROSION_TYPE_LABELS } from '@/lib/data/assessment-labels';
import { BASELINE_CONFIGS } from '@/lib/data/baselines';
import { CATEGORIES } from '@/lib/data/categories';
import { keyToSlug } from '@/lib/data/category-slugs';
import {
  APPARATUS_CLOSE,
  APPARATUS_HEADING,
  APPARATUS_INTRO,
  APPARATUS_ITEMS,
} from '@/lib/data/charter-copy';
import { MODEL_ROLES, MODEL_ROSTER } from '@/lib/data/model-roster';
import { PASS2_INSTRUCTIONS_URL } from '@/lib/data/repo-links';

/**
 * The apparatus inventory (#812): what the site decided before reading a
 * single document, rendered from the instrument's own constants so the
 * charter cannot describe a lens the code no longer has. Framing prose is
 * owner-verbatim (lib/data/charter-copy.ts); every list is data.
 */

const link = 'text-dm-accent hover:underline';

function Item({ lead, children }: { lead: string; children: React.ReactNode }) {
  return (
    <li className="text-sm text-dm-text-secondary leading-relaxed">
      <strong className="text-dm-text-primary">{lead}</strong> {children}
    </li>
  );
}

function Categories() {
  const { lead, text, tail } = APPARATUS_ITEMS.categories;
  return (
    <Item lead={lead}>
      {text}{' '}
      {CATEGORIES.map((c, i) => (
        <span key={c.key}>
          <Link href={`/category/${keyToSlug(c.key)}`} className={link}>
            {c.title}
          </Link>
          {i < CATEGORIES.length - 1 ? ', ' : '. '}
        </span>
      ))}
      {tail}
    </Item>
  );
}

function Baselines() {
  const { lead, text, tail } = APPARATUS_ITEMS.baselines;
  const labels = [...BASELINE_CONFIGS].sort((a, b) => a.from.localeCompare(b.from));
  return (
    <Item lead={lead}>
      {text} {labels.map((b) => b.label).join(', ')}. {tail}
    </Item>
  );
}

function Reviewer() {
  const { lead, text } = APPARATUS_ITEMS.reviewer;
  const readings = Object.values(ASSESSMENT_LABELS).join(', ');
  const mechanisms = Object.values(EROSION_TYPE_LABELS).join(', ');
  return (
    <Item lead={lead}>
      {text} Screening: {MODEL_ROSTER.pass1Screen.name} ({MODEL_ROSTER.pass1Screen.provider},{' '}
      <code>{MODEL_ROSTER.pass1Screen.id}</code>). Review: {MODEL_ROSTER.pass2Review.name} (
      {MODEL_ROSTER.pass2Review.provider}, <code>{MODEL_ROSTER.pass2Review.id}</code>). The four
      readings: {readings}. The five mechanisms: {mechanisms}.{' '}
      <a href={PASS2_INSTRUCTIONS_URL} target="_blank" rel="noopener noreferrer" className={link}>
        The instructions the reviewer receives
      </a>{' '}
      (version <code>{PASS2_PROMPT_VERSION}</code>).
    </Item>
  );
}

function Words() {
  const { lead, text } = APPARATUS_ITEMS.words;
  const stored = Object.keys(ASSESSMENT_LABELS).join(', ');
  return (
    <Item lead={lead}>
      {text} Stored readings: <code>{stored}</code>; stored mechanism field:{' '}
      <code>erosion_type</code>; stored weekly statuses:{' '}
      <code>Stable, Elevated, ConfirmedConcern</code>.
    </Item>
  );
}

function Prose() {
  const { lead, text } = APPARATUS_ITEMS.prose;
  const writers = MODEL_ROLES.filter((m) =>
    [
      'narrativeDraft',
      'narrativeCritique',
      'synthesisDraft',
      'synthesisSinglePass',
      'retrievalHelpers',
    ].includes(m.role),
  );
  return (
    <Item lead={lead}>
      {text}{' '}
      {writers.map((m, i) => (
        <span key={m.role}>
          {m.label}: {m.name} ({m.provider}, <code>{m.id}</code>)
          {i < writers.length - 1 ? '; ' : '.'}
        </span>
      ))}
    </Item>
  );
}

export function ApparatusInventory() {
  return (
    <section id="apparatus" className="max-w-3xl space-y-3 mb-10 scroll-mt-4">
      <h2 className="text-lg font-semibold text-dm-text-primary">{APPARATUS_HEADING}</h2>
      <p className="text-sm text-dm-text-secondary leading-relaxed">{APPARATUS_INTRO}</p>
      <ul className="list-disc list-outside ml-5 space-y-2">
        <Categories />
        <Item lead={APPARATUS_ITEMS.norms.lead}>{APPARATUS_ITEMS.norms.text}</Item>
        <Baselines />
        <Reviewer />
        <Words />
        <Prose />
      </ul>
      <p className="text-sm text-dm-text-secondary leading-relaxed">
        {APPARATUS_CLOSE.lead}{' '}
        <Link href="/system/reversals" className={link}>
          {APPARATUS_CLOSE.link}
        </Link>{' '}
        {APPARATUS_CLOSE.tail}
      </p>
    </section>
  );
}
