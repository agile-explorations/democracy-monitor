import Link from 'next/link';
import { useRouter } from 'next/router';
import { useCallback, useEffect, useState } from 'react';

interface FeedbackResponse {
  id: number;
  message: string;
  createdAt: string;
}

interface AdminFeedbackItem {
  id: number;
  email: string | null;
  type: string;
  category: string | null;
  message: string;
  pageUrl: string | null;
  createdAt: string;
  responses: FeedbackResponse[];
}

const TYPE_LABELS: Record<string, string> = {
  suggestion: 'Suggestion',
  'data-issue': 'Data issue',
  question: 'Question',
  other: 'Other',
};

export default function AdminFeedbackPage() {
  const router = useRouter();
  const [items, setItems] = useState<AdminFeedbackItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [authed, setAuthed] = useState(false);

  const fetchFeedback = useCallback(async () => {
    const res = await fetch('/api/admin/feedback');
    if (res.status === 401) {
      router.replace('/admin/login');
      return;
    }
    if (res.ok) {
      setAuthed(true);
      setItems(await res.json());
    }
    setLoading(false);
  }, [router]);

  useEffect(() => {
    fetchFeedback();
  }, [fetchFeedback]);

  const handleLogout = async () => {
    await fetch('/api/admin/logout', { method: 'POST' });
    router.replace('/admin/login');
  };

  if (loading || !authed) return null;

  return (
    <>
      <div className="flex items-center justify-between mb-6">
        <div>
          <Link href="/" className="text-xs text-dm-accent hover:underline">
            &larr; Back to overview
          </Link>
          <h1 className="text-xl font-bold text-dm-text-primary mt-2">Admin: Feedback</h1>
        </div>
        <button
          onClick={handleLogout}
          className="text-xs text-dm-muted hover:text-dm-text-secondary"
        >
          Log out
        </button>
      </div>

      {items.length === 0 ? (
        <p className="text-sm text-dm-muted">No feedback yet.</p>
      ) : (
        <div className="space-y-4 max-w-3xl">
          {items.map((item) => (
            <AdminFeedbackEntry key={item.id} item={item} onResponded={fetchFeedback} />
          ))}
        </div>
      )}
    </>
  );
}

function AdminFeedbackEntry({
  item,
  onResponded,
}: {
  item: AdminFeedbackItem;
  onResponded: () => void;
}) {
  const [showForm, setShowForm] = useState(false);
  const [response, setResponse] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{ emailed: boolean } | null>(null);

  const date = new Date(item.createdAt).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    const res = await fetch(`/api/admin/feedback/${item.id}/respond`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: response }),
    });
    if (res.ok) {
      const data = await res.json();
      setResult(data);
      setResponse('');
      setShowForm(false);
      onResponded();
    }
    setSubmitting(false);
  };

  return (
    <div className="rounded-lg border border-dm-border bg-dm-card p-4">
      <div className="flex items-center gap-2 mb-2 flex-wrap">
        <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-dm-border/50 text-dm-text-secondary">
          {TYPE_LABELS[item.type] || item.type}
        </span>
        {item.category && <span className="text-[10px] text-dm-muted">{item.category}</span>}
        {item.email && (
          <span className="text-[10px] text-dm-accent" title={item.email}>
            {item.email}
          </span>
        )}
        <span className="text-[10px] text-dm-muted ml-auto">{date}</span>
      </div>

      <p className="text-xs text-dm-text-secondary whitespace-pre-wrap mb-2">{item.message}</p>

      {item.pageUrl && (
        <p className="text-[10px] text-dm-muted mb-2 truncate" title={item.pageUrl}>
          Page: {item.pageUrl}
        </p>
      )}

      {/* Existing responses */}
      {item.responses.map((r) => (
        <div key={r.id} className="mt-2 ml-4 pl-3 border-l-2 border-dm-accent/30">
          <p className="text-[10px] text-dm-muted mb-1">
            Response &mdash;{' '}
            {new Date(r.createdAt).toLocaleDateString('en-US', {
              month: 'short',
              day: 'numeric',
            })}
          </p>
          <p className="text-xs text-dm-text-secondary whitespace-pre-wrap">{r.message}</p>
        </div>
      ))}

      {/* Result flash */}
      {result && (
        <p className="text-[10px] text-green-400 mt-2">
          Response saved{result.emailed ? ' and emailed to user' : ''}.
        </p>
      )}

      {/* Respond button / form */}
      {!showForm ? (
        <button
          onClick={() => setShowForm(true)}
          className="mt-2 text-[10px] text-dm-accent hover:underline"
        >
          Respond
        </button>
      ) : (
        <form onSubmit={handleSubmit} className="mt-3 space-y-2">
          <textarea
            value={response}
            onChange={(e) => setResponse(e.target.value)}
            rows={3}
            placeholder="Write a response..."
            className="w-full px-2 py-1.5 rounded border border-dm-border bg-dm-card text-dm-text-primary text-xs focus:outline-none focus:ring-1 focus:ring-dm-accent/50"
          />
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={!response.trim() || submitting}
              className="px-3 py-1 rounded bg-dm-accent text-white text-[10px] font-medium hover:opacity-90 disabled:opacity-50"
            >
              {submitting ? 'Sending...' : item.email ? 'Send response' : 'Save response'}
            </button>
            <button
              type="button"
              onClick={() => setShowForm(false)}
              className="px-3 py-1 rounded border border-dm-border text-dm-muted text-[10px] hover:text-dm-text-secondary"
            >
              Cancel
            </button>
          </div>
          {item.email && (
            <p className="text-[10px] text-dm-muted">Will also email response to {item.email}</p>
          )}
        </form>
      )}
    </div>
  );
}
