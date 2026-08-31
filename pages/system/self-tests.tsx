import Link from 'next/link';
import { SEOHead } from '@/components/shared/SEOHead';
import { Section } from '@/components/system/ContentHelpers';
import { ReaderAuditPanel } from '@/components/system/ReaderAuditPanel';
import { VerdictRatesTable } from '@/components/system/VerdictRatesTable';
import { SELF_TESTS_HEADING, SELF_TESTS_INTRO } from '@/lib/data/charter-copy';

/**
 * The self-tests, on their own page (R-CHARTER-2 #822, editorial guidance
 * §3.2): the swap audit "is the most persuasive thing on this site" and sat
 * at 60% depth inside the methodology. The era rates, the swap audit, and
 * the outside-reader audit are published together here; the methodology
 * keeps a two-sentence pointer. Prose moved verbatim from
 * pages/system/methodology.tsx (v1.17.x, #772/#816); intro is owner-verbatim
 * in lib/data/charter-copy.ts.
 */

export default function SelfTestsPage() {
  return (
    <>
      <SEOHead
        title="Self-tests"
        description="What happens when Democracy Monitor tests itself: the reviewer's verdict rates for every era side by side, the administration-swap audit, and the outside-reader audit."
        canonicalPath="/system/self-tests"
      />

      <Link href="/charter#how-to-catch-us" className="text-xs text-dm-accent hover:underline">
        &larr; How to catch us
      </Link>

      <h1 className="text-xl font-bold text-dm-text-primary mt-4 mb-1">{SELF_TESTS_HEADING}</h1>
      <p className="text-sm text-dm-text-secondary leading-relaxed mb-6 max-w-3xl">
        {SELF_TESTS_INTRO}
      </p>

      <div className="max-w-3xl space-y-2">
        <Section title="The same review, every era, side by side" id="era-rates">
          <p>
            The rates below are the same two-pass review applied to every analysis period. They
            differ by era — that is the record and the reviewer combined, and the difference is not
            a finding on its own. Two things are published so a reader can interrogate it: the
            numbers themselves, and a <strong>swap audit</strong> — reviewed documents with the
            administration-identifying names mechanically exchanged and re-reviewed, alongside an
            unchanged re-run that measures the model&apos;s own draw-to-draw noise. A verdict that
            flips on names alone is a reviewer effect; the audit&apos;s flip rate, net of that
            noise, is reported on this page once each run completes. The two passes use different
            providers (OpenAI screens, Anthropic reviews) precisely so that no single model&apos;s
            disposition decides a status.
          </p>
          <VerdictRatesTable />
        </Section>

        <Section title="The swap audit" id="swap-audit">
          <p>
            <strong>Swap audit, 2026-08-28.</strong> We took 200 documents from the current term
            that the reviewer had already judged and that name the administration, changed only the
            names — Trump to Biden, Vance to Harris, the party names — and asked the reviewer to
            judge them again. Everything else stayed the same: the actions, the dates, the agencies,
            the quotations. If the reviewer judged actions and not names, the verdicts should not
            have moved.
          </p>
          <p>
            They moved in about one document in nine (11.6%; the plausible range is 8–17%). Judging
            the same unchanged text twice moves a verdict only 1.5% of the time, so the swap itself
            accounts for roughly 10 points. The movement was one-directional:{' '}
            <strong>
              when a current-term document was made to read as the other administration&apos;s, the
              reviewer usually found it <em>less</em> concerning
            </strong>{' '}
            (19 verdicts down, 3 up), almost entirely in the borderline &quot;possible
            departure&quot; tier — clear departures were judged the same either way.
          </p>
          <p>
            We then ran the mirror test: 190 documents from the Biden 2021–22 baseline, renamed to
            the current administration. Those verdicts moved in 4.2% of documents (range 2–8%), four
            up and four down, with zero movement on the unchanged re-run. Renaming a document to the
            current administration did <em>not</em> make the reviewer harsher. So this is not a
            general tilt against one party&apos;s name: the effect is specific to current-term
            documents, which lose their borderline verdicts once the names no longer fit the events
            they describe.
          </p>
          <p>
            In both tests, a borderline &quot;possible departure&quot; verdict had about a
            one-in-four chance of becoming &quot;routine&quot; once the names were changed (24% and
            25%); routine verdicts almost never moved (2–3%). The current term has many more
            borderline documents — 71 of 199 in the sample, against 8 of 189 in the Biden-era sample
            — which is why the effect shows there. The lesson is about the borderline tier: those
            verdicts carry a wide margin of error, and a name change is one of the things that can
            tip them. It is not about one administration&apos;s name. The effect is smaller than the
            difference in departure rates between eras shown in the table, and it sits in the tier
            that decides &quot;notable departure&quot; weeks, not the clear-departure counts behind
            &quot;sustained departure&quot;. We publish it rather than adjust the reviewer quietly:
            every status on this site was produced by the reviewer as it is, and any calibration
            will be its own documented change. The full ledger is on issue #772.
          </p>
        </Section>

        <Section title="Read by people who are not us" id="reader-audit">
          <p>
            Each quarter, fifty of the reviewer&apos;s readings are drawn at random and read by two
            outside readers who see the document, the reading, and the reviewer&apos;s reasoning,
            and record whether they agree — and if not, what they would have said. Agreement is
            reported as-is; the readings both readers reject go to the reversals ledger.
          </p>
          <ReaderAuditPanel />
        </Section>
      </div>
    </>
  );
}
