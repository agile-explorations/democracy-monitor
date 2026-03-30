import Link from 'next/link';
import { useRouter } from 'next/router';
import { useCallback, useEffect, useState } from 'react';
import { FeedbackForm } from '@/components/shared/FeedbackForm';
import { SEOHead } from '@/components/shared/SEOHead';

interface FeedbackItem {
  id: number;
  type: string;
  category: string | null;
  message: string;
  createdAt: string;
}

const TYPE_LABELS: Record<string, string> = {
  suggestion: 'Suggestion',
  'data-issue': 'Data issue',
  question: 'Question',
  other: 'Other',
};

export default function FeedbackPage() {
  const router = useRouter();
  const category = router.query.category as string | undefined;
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

      <h1 className="text-xl font-bold text-dm-text-primary mt-4 mb-2">Feedback</h1>
      <p className="text-sm text-dm-text-secondary mb-6 max-w-2xl">
        Democracy Monitor is an open-source project and we welcome your input. Report missing data,
        suggest features, ask questions, or share any other feedback. All feedback is public.
      </p>

      <div className="max-w-2xl space-y-8">
        <FeedbackForm
          initialCategory={category}
          initialPageUrl={typeof window !== 'undefined' ? window.location.href : undefined}
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
      <p className="text-xs text-dm-text-secondary whitespace-pre-wrap">{item.message}</p>
    </div>
  );
}
