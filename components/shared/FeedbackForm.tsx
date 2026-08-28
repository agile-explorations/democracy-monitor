import Script from 'next/script';
import { useEffect, useRef, useState } from 'react';
// Window.turnstile typing lives with the shared loader (#792).
import '@/lib/hooks/useTurnstile';

interface FeedbackFormProps {
  initialCategory?: string;
  initialPageUrl?: string;
  onSubmitted?: () => void;
}

/** Public Turnstile site key; absent in dev/local, where the check is skipped. */
const TURNSTILE_SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;

const FEEDBACK_TYPES = [
  { value: 'data-issue', label: 'Missing or incorrect data' },
  { value: 'suggestion', label: 'Feature suggestion' },
  { value: 'question', label: 'Question' },
  { value: 'other', label: 'Other' },
] as const;

export function FeedbackForm({ initialCategory, initialPageUrl, onSubmitted }: FeedbackFormProps) {
  const [type, setType] = useState<string>(initialCategory ? 'data-issue' : 'suggestion');
  const [message, setMessage] = useState('');
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState('');
  const [turnstileToken, setTurnstileToken] = useState('');
  const widgetRef = useRef<HTMLDivElement>(null);
  const widgetIdRef = useRef<string | null>(null);

  function renderTurnstile() {
    if (!TURNSTILE_SITE_KEY || !widgetRef.current || !window.turnstile || widgetIdRef.current)
      return;
    widgetIdRef.current = window.turnstile.render(widgetRef.current, {
      sitekey: TURNSTILE_SITE_KEY,
      callback: (token) => setTurnstileToken(token),
      'expired-callback': () => setTurnstileToken(''),
      'error-callback': () => setTurnstileToken(''),
    });
  }

  // The api.js may already be loaded (e.g. re-mount) — try rendering on mount too.
  useEffect(() => {
    renderTurnstile();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!message.trim()) return;

    setStatus('loading');
    try {
      const res = await fetch('/api/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type,
          message: message.trim(),
          email: email.trim() || undefined,
          category: initialCategory || undefined,
          pageUrl: initialPageUrl || undefined,
          turnstileToken: turnstileToken || undefined,
        }),
      });
      if (res.ok) {
        setStatus('success');
        onSubmitted?.();
      } else {
        const data = await res.json();
        setStatus('error');
        setErrorMessage(data.error || 'Something went wrong');
        // Turnstile tokens are single-use — reset so a retry gets a fresh one.
        if (widgetIdRef.current && window.turnstile) {
          window.turnstile.reset(widgetIdRef.current);
          setTurnstileToken('');
        }
      }
    } catch {
      setStatus('error');
      setErrorMessage('Network error — please try again');
      if (widgetIdRef.current && window.turnstile) {
        window.turnstile.reset(widgetIdRef.current);
        setTurnstileToken('');
      }
    }
  }

  if (status === 'success') {
    return (
      <div className="rounded-lg border border-dm-border bg-dm-card p-5">
        <p className="text-sm text-green-400 font-medium">Thank you for your feedback!</p>
        <p className="text-xs text-dm-text-secondary mt-1">
          We review all submissions and use them to improve the project.
        </p>
      </div>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-lg border border-dm-border bg-dm-card p-5 space-y-4"
    >
      <div>
        <label
          htmlFor="feedback-type"
          className="block text-xs font-medium text-dm-text-primary mb-1"
        >
          Type
        </label>
        <select
          id="feedback-type"
          value={type}
          onChange={(e) => setType(e.target.value)}
          className="w-full px-3 py-1.5 text-xs rounded border border-dm-border bg-dm-bg text-dm-text-primary"
        >
          {FEEDBACK_TYPES.map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label
          htmlFor="feedback-message"
          className="block text-xs font-medium text-dm-text-primary mb-1"
        >
          Message
        </label>
        <textarea
          id="feedback-message"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          required
          rows={5}
          maxLength={5000}
          placeholder={
            initialCategory
              ? `Know of a government action in this category that we missed? Describe it here...`
              : 'Describe your feedback, suggestion, or question...'
          }
          className="w-full px-3 py-1.5 text-xs rounded border border-dm-border bg-dm-bg text-dm-text-primary resize-y"
        />
      </div>

      <div>
        <label
          htmlFor="feedback-email"
          className="block text-xs font-medium text-dm-text-primary mb-1"
        >
          Email{' '}
          <span className="text-dm-text-secondary font-normal">
            (optional — if you&apos;d like a response)
          </span>
        </label>
        <input
          id="feedback-email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="your@email.com"
          className="w-full px-3 py-1.5 text-xs rounded border border-dm-border bg-dm-bg text-dm-text-primary"
        />
      </div>

      {status === 'error' && <p className="text-xs text-red-400">{errorMessage}</p>}

      {TURNSTILE_SITE_KEY && (
        <>
          <Script
            src="https://challenges.cloudflare.com/turnstile/v0/api.js"
            strategy="afterInteractive"
            onLoad={renderTurnstile}
          />
          <div ref={widgetRef} />
        </>
      )}

      <button
        type="submit"
        disabled={
          status === 'loading' ||
          !message.trim() ||
          (Boolean(TURNSTILE_SITE_KEY) && !turnstileToken)
        }
        className="px-4 py-1.5 text-xs font-medium rounded-md bg-dm-accent text-white hover:bg-dm-accent/90 transition-colors disabled:opacity-50"
      >
        {status === 'loading' ? 'Submitting...' : 'Submit feedback'}
      </button>
    </form>
  );
}
