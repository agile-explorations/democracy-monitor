import Link from 'next/link';
import { SEOHead } from '@/components/shared/SEOHead';

const VANCE_REMARKS_URL = 'https://www.youtube.com/watch?v=VfMKrkpNmxU';

/**
 * About/mission page (owner-requested 2026-07-28). The epigraph is quoted in
 * full — including "I joked that" — with date, venue, and source link, so the
 * site's use of it cannot be read as a misleading edit.
 */
export default function AboutPage() {
  return (
    <>
      <SEOHead
        title="About"
        description="What Democracy Monitor is, what it measures, and who built it. Government documents, 14 pillars of American democracy, and conclusions left to the reader."
        canonicalPath="/about"
      />

      <Link href="/" className="text-xs text-dm-accent hover:underline">
        &larr; Back to overview
      </Link>

      <h1 className="text-xl font-bold text-dm-text-primary mt-4 mb-6">About Democracy Monitor</h1>

      <div className="max-w-3xl space-y-8">
        <figure className="rounded-lg border border-dm-border bg-dm-card p-5">
          <blockquote className="text-base text-dm-text-primary leading-relaxed italic">
            &ldquo;I joked that if Watergate happened tomorrow, it would be like a 12-hour news
            story. The idea that it took down a presidency is crazy.&rdquo;
          </blockquote>
          <figcaption className="mt-3 text-xs text-dm-muted">
            — Vice President JD Vance,{' '}
            <a
              href={VANCE_REMARKS_URL}
              className="text-dm-accent hover:underline"
              target="_blank"
              rel="noopener noreferrer"
            >
              remarks at the Richard Nixon Presidential Library
            </a>
            , Yorba Linda, California, June 26, 2026
          </figcaption>
          <p className="mt-3 text-sm text-dm-text-secondary leading-relaxed">
            Joke or not, the Vice President is right about the news cycle. The half-life of news
            touching on democracy in America is now measured in hours. This project exists to
            measure and hold onto what the news cycle no longer can.
          </p>
        </figure>

        <section className="space-y-3">
          <h2 className="text-lg font-semibold text-dm-text-primary">What this site is</h2>
          <p className="text-sm text-dm-text-secondary leading-relaxed">
            The news and commentary are full of warnings about the decline of democracy in America
            and the rise of authoritarianism. This site does not take a stand on that question.
          </p>
          <p className="text-sm text-dm-text-secondary leading-relaxed">
            What it does instead is narrower, and checkable: it reads what the government says about
            itself — executive orders, Federal Register rules, court opinions, agency press
            releases, inspector-general reports, congressional records — and asks whether those
            documents indicate erosion of{' '}
            <Link href="/why-this-matters" className="text-dm-accent hover:underline">
              the historical norms of U.S. democracy
            </Link>
            . The same{' '}
            <Link href="/system/methodology" className="text-dm-accent hover:underline">
              methodology
            </Link>{' '}
            is applied to every administration, and every assessment links to the documents behind
            it.
          </p>
          <p className="text-sm text-dm-text-secondary leading-relaxed">
            What we claim is narrow, and we stake everything on it:{' '}
            <strong className="text-dm-text-primary">
              the shift in how America governs itself is happening, it is visible in the
              government&apos;s own records, and you can see exactly where.
            </strong>{' '}
            Some of what is changing took two and a half centuries to build and may not be
            rebuildable on any timeline that matters to the people alive now — this site is the{' '}
            <Link href="/why-this-matters#charter" className="text-dm-accent hover:underline">
              record of what stood before
            </Link>
            .
          </p>
          <p className="text-sm text-dm-text-secondary leading-relaxed">
            Whether erosion of democracy in America is underway is not this site&apos;s call to make
            — it is for the American people to decide, from the{' '}
            <Link href="/data" className="text-dm-accent hover:underline">
              evidence
            </Link>
            , which is all public and all downloadable.
          </p>
          <p className="text-sm text-dm-text-secondary leading-relaxed">
            Is any of it at the level of the high crimes and misdemeanors Nixon was accused of? That
            is a question the Constitution assigns to Congress, not to a website.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-semibold text-dm-text-primary">Who is behind this</h2>
          <p className="text-sm text-dm-text-secondary leading-relaxed">
            Democracy Monitor is built and run by one person: a semi-retired software engineer who
            had an idea about putting AI to work in a way that might serve the public good. It is
            not backed by a party, a campaign, or an advocacy organization. The code, the
            methodology, and the data are all open —{' '}
            <a
              href="https://github.com/agile-explorations/democracy-monitor"
              className="text-dm-accent hover:underline"
              target="_blank"
              rel="noopener noreferrer"
            >
              read the source
            </a>
            ,{' '}
            <Link href="/data" className="text-dm-accent hover:underline">
              download the data
            </Link>
            , check the work, and{' '}
            <Link href="/feedback" className="text-dm-accent hover:underline">
              tell me where it&apos;s wrong
            </Link>
            .
          </p>
        </section>
      </div>
    </>
  );
}
