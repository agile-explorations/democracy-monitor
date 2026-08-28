import Link from 'next/link';
import { SEOHead } from '@/components/shared/SEOHead';
import { AccountabilityDiagram } from '@/components/why/AccountabilityDiagram';
import { CATEGORIES } from '@/lib/data/categories';
import { keyToSlug } from '@/lib/data/category-slugs';
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
        <span className="font-semibold text-dm-text-primary">What erosion looks like: </span>
        {pillar.erosionLooksLike}
      </p>
      <p className="text-sm text-dm-muted leading-relaxed border-l-2 border-dm-accent/30 pl-3">
        {pillar.historyAnchor}
      </p>
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
          How we measure &ldquo;normal&rdquo; is a separate, narrower thing: a two-party baseline of
          government documents from the Trump 2017–18 and Biden 2021–22 administrations, described
          in the{' '}
          <Link href="/system/methodology" className="text-dm-accent hover:underline">
            methodology
          </Link>
          . The baseline is how we tell ordinary boundary-pushing from a departure; the norms on
          this page are what that baseline exists to protect.
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

      {/* Epistemic charter (owner-approved verbatim 2026-08-17): the witness
          stance — document the shift, pass no judgment on it. */}
      <section id="charter" className="max-w-3xl space-y-3 mb-10 scroll-mt-4">
        <h2 className="text-lg font-semibold text-dm-text-primary">
          What this site is — and is not
        </h2>
        <p className="text-sm text-dm-text-secondary leading-relaxed">
          America is changing how it governs itself. Across the documentary record — executive
          orders, court filings, agency rules, inspector-general reports, congressional debate — you
          can watch authority moving: toward the presidency, past the referees, out of institutions
          that once checked it. This site exists to make that movement visible. Nothing more.
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
        <p className="text-sm text-dm-text-secondary leading-relaxed">
          Why keep watch at all, if we pass no judgment? Because some of what is changing took two
          and a half centuries to build and may not be rebuildable on any timeline that matters to
          the people alive now. A country is free to renovate its institutions. But renovation done
          quickly, without a record of what stood before, forecloses the option of changing course.
          This site is that record.
        </p>
        <p className="text-sm text-dm-text-secondary leading-relaxed border-l-2 border-dm-accent/30 pl-3">
          One commitment above the rest: the same instruments point at every administration. The
          same review reads Biden-era and Trump-era documents under identical rules; our baselines,
          our self-tests, and the flags we raised under previous administrations are all public. If
          we ever fail that standard, the{' '}
          <Link href="/system/methodology" className="text-dm-accent hover:underline">
            methodology page
          </Link>{' '}
          shows you how to catch us.
        </p>
      </section>

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
