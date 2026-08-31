import Link from 'next/link';
import { SEOHead } from '@/components/shared/SEOHead';
import { ApparatusInventory } from '@/components/why/ApparatusInventory';
import {
  CATCH_BULLETS,
  CATCH_HEADING,
  CATCH_INTRO,
  STOPS_HEADING,
  STOPS_KEEPING,
  STOPS_WHY,
  VISIBLE_THROUGH_A_LENS,
} from '@/lib/data/charter-copy';
import { READER_INVITE_HREF } from '@/lib/data/reader-audits';

/**
 * Epistemic charter (owner-approved verbatim 2026-08-17; apparatus and
 * stopping-point sections 2026-08-29, #812; its own page 2026-08-30, #820):
 * a record kept in good repair — document the shift, publish the lens,
 * correct the record. One screen: what this site is, what it claims, the
 * lens, why it stops at the record, and how to catch us. The norms live on
 * /norms; the FAQ on /questions; old /why-this-matters#charter deep links
 * arrive here via the 301 plus the hash forwarder on /norms.
 */

/** The stopping point and the conduct list, two sections (editorial
 *  guidance 2026-08-30). Owner-verbatim text in lib/data/charter-copy.ts. */
function WhyThisStops() {
  return (
    <section id="stops-at-the-record" className="space-y-3 scroll-mt-4">
      <h2 className="text-lg font-semibold text-dm-text-primary">{STOPS_HEADING}</h2>
      <p className="text-sm text-dm-text-secondary leading-relaxed">{STOPS_WHY}</p>
      <p className="text-sm text-dm-text-secondary leading-relaxed">{STOPS_KEEPING}</p>
    </section>
  );
}

function HowToCatchUs() {
  const link = 'text-dm-accent hover:underline';
  return (
    <section id="how-to-catch-us" className="space-y-3 scroll-mt-4">
      <h2 className="text-lg font-semibold text-dm-text-primary">{CATCH_HEADING}</h2>
      <p className="text-sm text-dm-text-secondary leading-relaxed">{CATCH_INTRO}</p>
      <ul className="list-disc list-outside ml-5 space-y-1">
        {CATCH_BULLETS.map((b) => (
          <li key={b.text.slice(0, 24)} className="text-sm text-dm-text-secondary leading-relaxed">
            {b.text}
            {b.href && (
              <>
                {' '}
                <Link
                  href={b.href === 'READER_INVITE' ? READER_INVITE_HREF : b.href}
                  className={link}
                >
                  {b.linkText}
                </Link>
              </>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

export default function CharterPage() {
  return (
    <>
      <SEOHead
        title="The charter"
        description="What Democracy Monitor is, what it claims, the lens every measurement passes through, why it stops at the record — and how to catch us being wrong."
        canonicalPath="/charter"
      />

      <Link href="/" className="text-xs text-dm-accent hover:underline">
        &larr; Back to overview
      </Link>

      <h1 className="text-xl font-bold text-dm-text-primary mt-4 mb-2">
        What this site is — and is not
      </h1>

      <section id="charter" className="max-w-3xl space-y-3 mb-10 scroll-mt-4">
        <p className="text-sm text-dm-text-secondary leading-relaxed">
          America is changing how it governs itself. Across the documentary record — executive
          orders, court filings, agency rules, inspector-general reports, congressional debate — you
          can watch authority moving: toward the presidency, past the referees, out of institutions
          that once checked it. {VISIBLE_THROUGH_A_LENS}
        </p>
        <p className="text-sm text-dm-text-secondary leading-relaxed">
          We do not claim the shift is good or bad. The reasons for it are complex — some of it
          answers real frustrations with how government has worked — and where it leads cannot be
          known from here. Reasonable people disagree about whether the design America has carried
          for 250 years still serves the country. That debate belongs to voters, and this site does
          not take a side in it.
        </p>
        <p className="text-sm text-dm-text-secondary leading-relaxed">
          What we do claim is narrower, and we stake everything on it:{' '}
          <strong className="text-dm-text-primary">
            the shift is happening, it is visible in the government&apos;s own records, and you can
            see exactly where.
          </strong>{' '}
          Every status on this site traces to specific public documents — quoted, linked, and
          machine-checked. Where the record shows a departure from long-standing practice, we say so
          plainly. Where it doesn&apos;t, we say that too.
        </p>
        <ApparatusInventory />
        <WhyThisStops />
        <HowToCatchUs />
      </section>
    </>
  );
}
