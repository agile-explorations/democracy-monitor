import Link from 'next/link';
import { FaqJsonLd } from '@/components/shared/JsonLd';
import { SEOHead } from '@/components/shared/SEOHead';
import { COMMON_QUESTIONS } from '@/lib/data/why-this-matters';
import type { CommonQuestion } from '@/lib/data/why-this-matters';

/**
 * The FAQ, on its own page (R-CHARTER-2 #821): it was invisible at the
 * bottom of /why-this-matters and has independent search value —
 * "isn't making government more efficient a good thing" is a query people
 * type. Question ids are stable anchors; old /why-this-matters#<id> links
 * arrive via the 301 plus the hash forwarder on /norms.
 */

function QuestionCard({ item }: { item: CommonQuestion }) {
  return (
    <section id={item.id} className="scroll-mt-4">
      <h2 className="text-base font-bold text-dm-text-primary mb-2">{item.question}</h2>
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

export default function QuestionsPage() {
  return (
    <>
      <SEOHead
        title="Common questions"
        description="Straight answers to the questions readers actually ask — isn't the president in charge of the executive branch, is there a deep state, isn't efficiency good, why trust any of this."
        canonicalPath="/questions"
      />
      <FaqJsonLd items={COMMON_QUESTIONS} />

      <Link href="/" className="text-xs text-dm-accent hover:underline">
        &larr; Back to overview
      </Link>

      <h1 className="text-xl font-bold text-dm-text-primary mt-4 mb-2">Common questions</h1>

      <div className="max-w-3xl space-y-6">
        <p className="text-sm text-dm-text-secondary leading-relaxed">
          Straight answers to the questions readers actually ask. If yours isn&apos;t here,{' '}
          <Link href="/feedback?type=question" className="text-dm-accent hover:underline">
            ask it
          </Link>
          .
        </p>

        {COMMON_QUESTIONS.map((item) => (
          <QuestionCard key={item.id} item={item} />
        ))}

        <div className="rounded-lg border border-dm-border bg-dm-card p-5">
          <p className="text-sm text-dm-text-secondary leading-relaxed">
            The norms these questions test are on{' '}
            <Link href="/norms" className="text-dm-accent hover:underline">
              the historical norms page
            </Link>
            ; what this site is — and is not — is{' '}
            <Link href="/charter" className="text-dm-accent hover:underline">
              the charter
            </Link>
            .
          </p>
        </div>
      </div>
    </>
  );
}
