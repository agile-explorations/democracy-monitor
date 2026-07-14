import Link from 'next/link';
import { SEOHead } from '@/components/shared/SEOHead';
import {
  GITHUB_SPONSORS_URL,
  isPlaceholderLink,
  MONTHLY_OPERATING_COST_USD,
  MONTHLY_SUPPORT_TIERS,
  ONE_TIME_SUPPORT_URL,
} from '@/lib/data/support-links';

const paymentLinksReady =
  !isPlaceholderLink(ONE_TIME_SUPPORT_URL) &&
  MONTHLY_SUPPORT_TIERS.every((tier) => !isPlaceholderLink(tier.url));

function SupportButton({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center justify-center px-4 py-2 rounded-md border border-dm-accent text-sm font-medium text-dm-accent hover:bg-dm-accent/10 transition-colors"
    >
      {children}
    </a>
  );
}

function OneTimeSection() {
  return (
    <section className="rounded-lg border border-dm-border bg-dm-card p-5">
      <h2 className="text-sm font-semibold text-dm-text-primary mb-2">One-time contribution</h2>
      <p className="text-sm text-dm-text-secondary mb-4">
        Give any amount you like — many supporters choose $10, $25, or $100. Checkout is handled by
        Stripe; card, Apple Pay, and Google Pay are accepted, and no account is required.
      </p>
      <SupportButton href={ONE_TIME_SUPPORT_URL}>Support with a one-time amount</SupportButton>
    </section>
  );
}

function MonthlySection() {
  return (
    <section className="rounded-lg border border-dm-border bg-dm-card p-5">
      <h2 className="text-sm font-semibold text-dm-text-primary mb-2">Monthly support</h2>
      <p className="text-sm text-dm-text-secondary mb-4">
        Recurring support is what keeps the monitor running month to month. Ten supporters at
        $25/month — or fifty at $5 — cover the entire operating cost.
      </p>
      <div className="flex flex-wrap gap-3">
        {MONTHLY_SUPPORT_TIERS.map((tier) => (
          <SupportButton key={tier.amountUsd} href={tier.url}>
            ${tier.amountUsd}/month
          </SupportButton>
        ))}
      </div>
    </section>
  );
}

function WhereTheMoneyGoes() {
  return (
    <section>
      <h2 className="text-sm font-semibold text-dm-text-primary mb-2">Where the money goes</h2>
      <p className="text-sm text-dm-text-secondary">
        Democracy Monitor costs about ${MONTHLY_OPERATING_COST_USD}/month to run: hosting for the
        web service and database, and AI review of every new government document each week. The
        code, methodology, and data are all open — anyone can inspect how assessments are made or
        download the full document repository. Contributions go toward these operating costs and,
        beyond them, toward building out the{' '}
        <Link href="/system/roadmap" className="text-dm-accent hover:underline">
          roadmap
        </Link>
        .
      </p>
    </section>
  );
}

function DeveloperSection() {
  return (
    <section>
      <h2 className="text-sm font-semibold text-dm-text-primary mb-2">For developers</h2>
      <p className="text-sm text-dm-text-secondary">
        If you already have a GitHub account, you can also support the project through{' '}
        <a
          href={GITHUB_SPONSORS_URL}
          className="text-dm-accent hover:underline"
          target="_blank"
          rel="noopener noreferrer"
        >
          GitHub Sponsors
        </a>
        , or contribute code directly — the project is{' '}
        <a
          href="https://github.com/agile-explorations/democracy-monitor"
          className="text-dm-accent hover:underline"
          target="_blank"
          rel="noopener noreferrer"
        >
          open source
        </a>
        .
      </p>
    </section>
  );
}

export default function SupportPage() {
  return (
    <>
      <SEOHead
        title="Support the Project"
        description="Help cover the operating costs of Democracy Monitor — open-source, open-methodology monitoring of democratic institutions."
        canonicalPath="/support"
      />

      <Link href="/" className="text-xs text-dm-accent hover:underline">
        &larr; Back to overview
      </Link>

      <h1 className="text-xl font-bold text-dm-text-primary mt-4 mb-2">Support the Project</h1>
      <p className="text-sm text-dm-text-secondary mb-6 max-w-2xl">
        Democracy Monitor is free to use, open source, and open data. Reader support covers the cost
        of keeping it running.
      </p>

      <div className="max-w-2xl space-y-6">
        {paymentLinksReady ? (
          <>
            <OneTimeSection />
            <MonthlySection />
          </>
        ) : (
          <section className="rounded-lg border border-dm-border bg-dm-card p-5">
            <p className="text-sm text-dm-text-secondary">
              Payment links are being set up and will be available here shortly. In the meantime,
              you can support the project through{' '}
              <a
                href={GITHUB_SPONSORS_URL}
                className="text-dm-accent hover:underline"
                target="_blank"
                rel="noopener noreferrer"
              >
                GitHub Sponsors
              </a>
              .
            </p>
          </section>
        )}

        <WhereTheMoneyGoes />
        <DeveloperSection />

        <p className="text-sm text-dm-muted">
          Democracy Monitor is built and operated by Agile Explorations LLC, a for-profit company.
          Contributions support the project directly and are not tax-deductible charitable
          donations.
        </p>
      </div>
    </>
  );
}
