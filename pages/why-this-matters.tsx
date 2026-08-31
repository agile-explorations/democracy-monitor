import Link from 'next/link';
import { SEOHead } from '@/components/shared/SEOHead';
import { AccountabilityDiagram } from '@/components/why/AccountabilityDiagram';
import { ApparatusInventory } from '@/components/why/ApparatusInventory';
import { CATEGORIES } from '@/lib/data/categories';
import { keyToSlug } from '@/lib/data/category-slugs';
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
import { COMMON_QUESTIONS, WHY_PILLARS } from '@/lib/data/why-this-matters';
import type { CommonQuestion, WhyPillar } from '@/lib/data/why-this-matters';

const CATEGORY_TITLES = new Map(CATEGORIES.map((c) => [c.key, c.title]));

function CategoryChip({ categoryKey }: { categoryKey: string }) {
  const title = CATEGORY_TITLES.get(categoryKey) ?? categoryKey;
  return (
    <Link
      href={`/category/${keyToSlug(categoryKey)}`}
      className="inline-block px-2 py-0.5 rounded border border-dm-accent/40 text-[11px] text-dm-accent hover:bg-dm-accent/10 transition-colors"
    >
      {title}
    </Link>
  );
}

function PillarCard({ pillar }: { pillar: WhyPillar }) {
  return (
    <section
      id={pillar.id}
      className="rounded-lg border border-dm-border bg-dm-card p-5 scroll-mt-4 space-y-3"
    >
      <h3 className="text-base font-bold text-dm-text-primary">{pillar.question}</h3>
      <div className="flex flex-wrap gap-1.5">
        {pillar.categoryKeys.map((key) => (
          <CategoryChip key={key} categoryKey={key} />
        ))}
      </div>
      <p className="text-sm text-dm-text-secondary leading-relaxed">{pillar.answer}</p>
      <p className="text-sm text-dm-text-secondary leading-relaxed">
        <span className="font-semibold text-dm-text-primary">Why it binds both sides: </span>
        {pillar.bindsBothSides}
      </p>
      <p className="text-sm text-dm-text-secondary leading-relaxed">
        <span className="font-semibold text-dm-text-primary">What a departure looks like: </span>
        {pillar.erosionLooksLike}
      </p>
      <p className="text-sm text-dm-muted leading-relaxed border-l-2 border-dm-accent/30 pl-3">
        {pillar.historyAnchor}
      </p>
    </section>
  );
}

/** The stopping point and the conduct list, two sections (editorial
 *  guidance 2026-08-30). Owner-verbatim text in lib/data/charter-copy.ts. */
function WhyThisStops() {
  return (
    <section id="stops-at-the-record" className="space-y-3 scroll-mt-4">
      <h3 className="text-base font-semibold text-dm-text-primary">{STOPS_HEADING}</h3>
      <p className="text-sm text-dm-text-secondary leading-relaxed">{STOPS_WHY}</p>
      <p className="text-sm text-dm-text-secondary leading-relaxed">{STOPS_KEEPING}</p>
    </section>
  );
}

function HowToCatchUs() {
  const link = 'text-dm-accent hover:underline';
  return (
    <section id="how-to-catch-us" className="space-y-3 scroll-mt-4">
      <h3 className="text-base font-semibold text-dm-text-primary">{CATCH_HEADING}</h3>
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

function QuestionCard({ item }: { item: CommonQuestion }) {
  return (
    <section id={item.id} className="scroll-mt-4">
      <h3 className="text-base font-bold text-dm-text-primary mb-2">{item.question}</h3>
      <div className="space-y-2">
        {item.answer.map((paragraph, i) => (
          <p key={i} className="text-sm text-dm-text-secondary leading-relaxed">
            {paragraph}
          </p>
        ))}
      </div>
    </section>
  );
}

export default function WhyThisMattersPage() {
  return (
    <>
      <SEOHead
        title="The Historical Norms of U.S. Democracy"
        description="The long-standing rules and practices that bind every president, whichever party holds the office — the norms Democracy Monitor measures departure from."
        canonicalPath="/why-this-matters"
      />

      <Link href="/" className="text-xs text-dm-accent hover:underline">
        &larr; Back to overview
      </Link>

      <h1 className="text-xl font-bold text-dm-text-primary mt-4 mb-2">
        The Historical Norms of U.S. Democracy
      </h1>
      {/* Epistemic charter (owner-approved verbatim 2026-08-17; apparatus and
          stopping-point sections 2026-08-29, #812): a record kept in good
          repair — document the shift, publish the lens, correct the record. */}
      <section id="charter" className="max-w-3xl space-y-3 mb-10 scroll-mt-4">
        <h2 className="text-lg font-semibold text-dm-text-primary">
          What this site is — and is not
        </h2>
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

      <div className="max-w-3xl space-y-2 mb-8">
        <p className="text-sm text-dm-text-secondary leading-relaxed">
          Every status on this site — <em>consistent with norms</em>, <em>notable departure</em>,{' '}
          <em>sustained departure</em> — measures against something. This page is what. The norms
          below are the long-standing rules and practices that have bound every president, whichever
          party held the office. Some were written into law by both parties after an abuse; others
          are customs presidents of both parties kept, usually because each expected to be out of
          power one day.
        </p>
        <p className="text-sm text-dm-text-secondary leading-relaxed">
          How we measure &ldquo;normal&rdquo; is a separate, narrower thing. The same reviewer that
          reads this administration&apos;s documents has read every year of the two before it, under
          identical instructions — and its rates for each era are published side by side in the{' '}
          <Link
            href="/system/methodology#ai-document-review"
            className="text-dm-accent hover:underline"
          >
            methodology
          </Link>
          . The norms on this page are what those comparisons exist to protect.
        </p>
        <p className="text-sm text-dm-text-secondary leading-relaxed">
          Democracy Monitor tracks 14 categories of government activity. None of them is about
          whether the current administration&apos;s policies are good or bad — that debate belongs
          to voters. Every one of them is about the same question:{' '}
          <strong className="text-dm-text-primary">
            are the rules that bind every president — whichever party holds the office — still
            holding?
          </strong>
        </p>
        <p className="text-sm text-dm-text-secondary leading-relaxed">
          Each rule below exists because, at some point in American history, both parties agreed
          they did not trust the other side with unchecked power. That is the test worth applying to
          everything on this page: a power claimed by a president you support will be inherited,
          intact, by a president you oppose.
        </p>
        <p className="text-sm text-dm-text-secondary leading-relaxed border-l-2 border-dm-accent/30 pl-3">
          We apply the same methodology to every administration — the same AI review reads Biden-era
          documents and Trump-era documents under identical rules. How it works is public:{' '}
          <Link href="/system/methodology" className="text-dm-accent hover:underline">
            methodology
          </Link>
          .
        </p>
      </div>

      <AccountabilityDiagram />

      <div className="max-w-3xl space-y-4">
        {WHY_PILLARS.map((pillar) => (
          <PillarCard key={pillar.id} pillar={pillar} />
        ))}
      </div>

      <div className="max-w-3xl mt-10">
        <h2 className="text-lg font-semibold text-dm-text-primary mb-4">Common questions</h2>
        <div className="space-y-6">
          {COMMON_QUESTIONS.map((item) => (
            <QuestionCard key={item.id} item={item} />
          ))}
        </div>
      </div>

      <div className="max-w-3xl mt-10 rounded-lg border border-dm-border bg-dm-card p-5">
        <p className="text-sm text-dm-text-secondary leading-relaxed">
          Everything this site reports traces back to government documents you can read yourself —
          every assessment links to its sources, and the{' '}
          <Link href="/data" className="text-dm-accent hover:underline">
            full dataset is downloadable
          </Link>
          . Don&apos;t take our word for any of it.
        </p>
      </div>
    </>
  );
}
