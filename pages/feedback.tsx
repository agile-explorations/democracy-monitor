import Link from 'next/link';
import { useRouter } from 'next/router';
import { useCallback, useEffect, useState } from 'react';
import { FeedbackForm } from '@/components/shared/FeedbackForm';
import { SEOHead } from '@/components/shared/SEOHead';
import { Linkified } from '@/components/ui/Linkified';
import { ASSESSMENT_LABELS } from '@/lib/data/assessment-labels';
import type { DisputeContext } from '@/lib/utils/dispute-link';
import { parseDisputeQuery } from '@/lib/utils/dispute-link';

interface FeedbackResponse {
  id: number;
  message: string;
  createdAt: string;
}

interface FeedbackItem {
  id: number;
  type: string;
  category: string | null;
  message: string;
  createdAt: string;
  responses?: FeedbackResponse[];
  metadata?: Partial<DisputeContext> | null;
}

const TYPE_LABELS: Record<string, string> = {
  suggestion: 'Suggestion',
  'data-issue': 'Data issue',
  question: 'Question',
  other: 'Other',
  dispute: 'Dispute',
};

export default function FeedbackPage() {
  const router = useRouter();
  const category = router.query.category as string | undefined;
  const dispute = parseDisputeQuery(router.query);
  const [items, setItems] = useState<FeedbackItem[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchFeedback = useCallback(async () => {
    try {
      const res = await fetch('/api/feedback');
      if (res.ok) setItems(await res.json());
    } catch {
      /* non-critical */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchFeedback();
  }, [fetchFeedback]);

  return (
    <>
      <SEOHead
        title="Feedback"
        description="Share feedback, report missing data, or suggest features for Democracy Monitor."
        canonicalPath="/feedback"
      />

      <Link href="/" className="text-xs text-dm-accent hover:underline">
        &larr; Back to overview
      </Link>

      <h1 className="text-xl font-bold text-dm-text-primary mt-4 mb-2">
        {dispute ? 'Dispute this reading' : 'Feedback'}
      </h1>
      <p className="text-sm text-dm-text-secondary mb-6 max-w-2xl">
        {dispute
          ? 'Every document the reviewer reads can be read differently. Say why this reading is wrong; a person reads every dispute, publishes it here, and answers it in the reversals ledger when it changes a reading.'
          : 'Democracy Monitor is an open-source project and we welcome your input. Report missing data, suggest features, ask questions, dispute a reading, or share any other feedback. All feedback is public.'}
      </p>

      <div className="max-w-2xl space-y-8">
        <FeedbackForm
          key={dispute ? `dispute-${dispute.documentId ?? dispute.title}` : 'feedback'}
          initialCategory={category}
          initialPageUrl={typeof window !== 'undefined' ? window.location.href : undefined}
          dispute={dispute}
          onSubmitted={fetchFeedback}
        />

        <section>
          <h2 className="text-sm font-semibold text-dm-text-primary mb-3">
            Recent feedback {!loading && items.length > 0 && `(${items.length})`}
          </h2>
          {loading ? (
            <p className="text-xs text-dm-muted">Loading...</p>
          ) : items.length === 0 ? (
            <p className="text-xs text-dm-muted">No feedback yet. Be the first!</p>
          ) : (
            <div className="space-y-3">
              {items.map((item) => (
                <FeedbackEntry key={item.id} item={item} />
              ))}
            </div>
          )}
        </section>
      </div>
    </>
  );
}

function FeedbackEntry({ item }: { item: FeedbackItem }) {
  const date = new Date(item.createdAt).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });

  return (
    <div className="rounded-lg border border-dm-border bg-dm-card p-4">
      <div className="flex items-center gap-2 mb-2">
        <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-dm-border/50 text-dm-text-secondary">
          {TYPE_LABELS[item.type] || item.type}
        </span>
        {item.category && <span className="text-[10px] text-dm-muted">{item.category}</span>}
        <span className="text-[10px] text-dm-muted ml-auto">{date}</span>
      </div>
      {item.type === 'dispute' && item.metadata?.title && (
        <p className="text-[11px] text-dm-muted mb-1">
          Disputes the reading of{' '}
          {item.metadata.url ? (
            <a
              href={item.metadata.url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-dm-accent hover:underline"
            >
              {item.metadata.title}
            </a>
          ) : (
            <span className="text-dm-text-secondary">{item.metadata.title}</span>
          )}
          {item.metadata.verdict
            ? ` as "${ASSESSMENT_LABELS[item.metadata.verdict] ?? item.metadata.verdict}"`
            : ''}
        </p>
      )}
      <p className="text-xs text-dm-text-secondary whitespace-pre-wrap">{item.message}</p>

      {item.responses &&
        item.responses.map((r) => (
          <div key={r.id} className="mt-3 ml-4 pl-3 border-l-2 border-dm-accent/30">
            <p className="text-[10px] text-dm-muted mb-1">
              Response from Democracy Monitor &mdash;{' '}
              {new Date(r.createdAt).toLocaleDateString('en-US', {
                month: 'short',
                day: 'numeric',
                year: 'numeric',
              })}
            </p>
            <p className="text-xs text-dm-text-secondary whitespace-pre-wrap">
              <Linkified text={r.message} />
            </p>
          </div>
        ))}
    </div>
  );
}
