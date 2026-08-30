import Link from 'next/link';
import {
  APPARATUS_CLOSE,
  APPARATUS_HEADING,
  APPARATUS_INTRO,
  APPARATUS_LINES,
} from '@/lib/data/charter-copy';

/**
 * The apparatus, at a glance (#812; owner 2026-08-29): the six things decided
 * before any document was read, one line each, then the link to the full
 * inventory on /system/lens, which renders every table from the instrument's
 * own constants. Framing prose is owner-verbatim (lib/data/charter-copy.ts).
 */

const link = 'text-dm-accent hover:underline';

export function ApparatusInventory() {
  return (
    <section id="apparatus" className="max-w-3xl space-y-3 mb-10 scroll-mt-4">
      <h2 className="text-lg font-semibold text-dm-text-primary">{APPARATUS_HEADING}</h2>
      <p className="text-sm text-dm-text-secondary leading-relaxed">{APPARATUS_INTRO}</p>
      <ul className="list-disc list-outside ml-5 space-y-1">
        {APPARATUS_LINES.map((l) => (
          <li key={l.lead} className="text-sm text-dm-text-secondary leading-relaxed">
            <strong className="text-dm-text-primary">{l.lead}</strong> {l.text}
          </li>
        ))}
      </ul>
      <p className="text-sm text-dm-text-secondary leading-relaxed">
        {APPARATUS_CLOSE.lead}{' '}
        <Link href="/system/reversals" className={link}>
          {APPARATUS_CLOSE.link}
        </Link>{' '}
        {APPARATUS_CLOSE.tail} {APPARATUS_CLOSE.inventory}{' '}
        <Link href="/system/lens" className={link}>
          {APPARATUS_CLOSE.inventoryLink}
        </Link>
        .
      </p>
    </section>
  );
}
