import Link from 'next/link';
import { useRouter } from 'next/router';
import { useEffect } from 'react';
import { SEOHead } from '@/components/shared/SEOHead';
import { AccountabilityDiagram } from '@/components/why/AccountabilityDiagram';
import { CATEGORIES } from '@/lib/data/categories';
import { keyToSlug } from '@/lib/data/category-slugs';
import { COMMON_QUESTIONS, WHY_PILLARS } from '@/lib/data/why-this-matters';
import type { WhyPillar } from '@/lib/data/why-this-matters';

const CATEGORY_TITLES = new Map(CATEGORIES.map((c) => [c.key, c.title]));

/** Anchors that lived on /why-this-matters before the R-CHARTER-2 split
 *  (#820) and now resolve on other pages. Hash fragments never reach the
 *  server, so the 301 from /why-this-matters lands here with the old anchor
 *  intact and this forwarder finishes the trip. Pillar ids stay on this page. */
const CHARTER_HASHES = new Set(['charter', 'apparatus', 'stops-at-the-record', 'how-to-catch-us']);
const QUESTION_HASHES = new Set(COMMON_QUESTIONS.map((q) => q.id));

function useSplitAnchorForwarder() {
  const router = useRouter();
  useEffect(() => {
    const hash = window.location.hash.slice(1);
    if (CHARTER_HASHES.has(hash)) void router.replace(`/charter#${hash}`);
    else if (QUESTION_HASHES.has(hash)) void router.replace(`/questions#${hash}`);
  }, [router]);
}

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
        <span className="font-semibold text-dm-text-secondary">Precedent: </span>
        {pillar.historyAnchor}
      </p>
    </section>
  );
}

export default function NormsPage() {
  useSplitAnchorForwarder();
  return (
    <>
      <SEOHead
        title="The Historical Norms of U.S. Democracy"
        description="The long-standing rules and practices that bind every president, whichever party holds the office — the norms Democracy Monitor measures departure from."
        canonicalPath="/norms"
      />

      <Link href="/" className="text-xs text-dm-accent hover:underline">
        &larr; Back to overview
      </Link>

      <h1 className="text-xl font-bold text-dm-text-primary mt-4 mb-2">
        The Historical Norms of U.S. Democracy
      </h1>

      <div className="max-w-3xl space-y-2 mb-8">
        <p className="text-sm text-dm-text-secondary leading-relaxed">
          What this site is, what it claims, and how to catch us being wrong is its own page:{' '}
          <Link href="/charter" className="text-dm-accent hover:underline">
            the charter
          </Link>
          .
        </p>
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
          identical instructions — and its rates for each era are published side by side in{' '}
          <Link href="/system/self-tests#era-rates" className="text-dm-accent hover:underline">
            the self-tests
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

      <div className="max-w-3xl mt-10 rounded-lg border border-dm-border bg-dm-card p-5">
        <p className="text-sm text-dm-text-secondary leading-relaxed">
          Everything this site reports traces back to government documents you can read yourself —
          every assessment links to its sources, and the{' '}
          <Link href="/data" className="text-dm-accent hover:underline">
            full dataset is downloadable
          </Link>
          . Don&apos;t take our word for any of it. The questions readers actually ask are answered
          on{' '}
          <Link href="/questions" className="text-dm-accent hover:underline">
            common questions
          </Link>
          .
        </p>
      </div>
    </>
  );
}
