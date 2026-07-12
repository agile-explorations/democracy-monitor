import Link from 'next/link';
import { SEOHead } from '@/components/shared/SEOHead';
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
      <h3 className="text-sm font-bold text-dm-text-primary">{pillar.question}</h3>
      <div className="flex flex-wrap gap-1.5">
        {pillar.categoryKeys.map((key) => (
          <CategoryChip key={key} categoryKey={key} />
        ))}
      </div>
      <p className="text-xs text-dm-text-secondary leading-relaxed">{pillar.answer}</p>
      <p className="text-xs text-dm-text-secondary leading-relaxed">
        <span className="font-semibold text-dm-text-primary">Why it binds both sides: </span>
        {pillar.bindsBothSides}
      </p>
      <p className="text-xs text-dm-text-secondary leading-relaxed">
        <span className="font-semibold text-dm-text-primary">What erosion looks like: </span>
        {pillar.erosionLooksLike}
      </p>
      <p className="text-xs text-dm-muted leading-relaxed border-l-2 border-dm-accent/30 pl-3">
        {pillar.historyAnchor}
      </p>
    </section>
  );
}

function QuestionCard({ item }: { item: CommonQuestion }) {
  return (
    <section id={item.id} className="scroll-mt-4">
      <h3 className="text-sm font-bold text-dm-text-primary mb-2">{item.question}</h3>
      <div className="space-y-2">
        {item.answer.map((paragraph, i) => (
          <p key={i} className="text-xs text-dm-text-secondary leading-relaxed">
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
        title="Why These Matter"
        description="Why the 14 categories Democracy Monitor tracks matter — the checks that bind every president, whichever party holds the office."
        canonicalPath="/why-this-matters"
      />

      <Link href="/" className="text-xs text-dm-accent hover:underline">
        &larr; Back to overview
      </Link>

      <h1 className="text-xl font-bold text-dm-text-primary mt-4 mb-2">Why These Matter</h1>
      <div className="max-w-3xl space-y-2 mb-8">
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
        <p className="text-xs text-dm-muted leading-relaxed">
          We apply the same methodology to every administration — the same AI review reads Biden-era
          documents and Trump-era documents under identical rules. How it works is public:{' '}
          <Link href="/system/methodology" className="text-dm-accent hover:underline">
            methodology
          </Link>
          .
        </p>
      </div>

      <div className="max-w-3xl space-y-4">
        {WHY_PILLARS.map((pillar) => (
          <PillarCard key={pillar.id} pillar={pillar} />
        ))}
      </div>

      <div className="max-w-3xl mt-10">
        <h2 className="text-base font-semibold text-dm-text-primary mb-4">Common questions</h2>
        <div className="space-y-6">
          {COMMON_QUESTIONS.map((item) => (
            <QuestionCard key={item.id} item={item} />
          ))}
        </div>
      </div>

      <div className="max-w-3xl mt-10 rounded-lg border border-dm-border bg-dm-card p-5">
        <p className="text-xs text-dm-text-secondary leading-relaxed">
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
