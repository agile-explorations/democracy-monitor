import { useState } from 'react';

interface EmailSignupProps {
  variant?: 'card' | 'inline' | 'badge';
}

export function EmailSignup({ variant = 'card' }: EmailSignupProps) {
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [message, setMessage] = useState('');
  const [expanded, setExpanded] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;

    setStatus('loading');
    try {
      const res = await fetch('/api/subscribers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim() }),
      });
      const data = await res.json();
      if (res.ok) {
        setStatus('success');
        setMessage(data.message);
        setEmail('');
      } else {
        setStatus('error');
        setMessage(data.error || 'Something went wrong');
      }
    } catch {
      setStatus('error');
      setMessage('Network error — please try again');
    }
  }

  // Header badge (#540): a compact pill matching the Sponsor badge that
  // expands into the inline form on click.
  if (variant === 'badge') {
    if (!expanded) {
      return (
        <button
          onClick={() => setExpanded(true)}
          className="px-2 py-0.5 mb-1.5 rounded border border-dm-accent/60 text-[10px] text-dm-accent hover:bg-dm-accent/10 transition-colors"
          aria-expanded={false}
          aria-label="Subscribe to weekly updates"
        >
          ✉ Subscribe
        </button>
      );
    }
    return (
      <form onSubmit={handleSubmit} className="flex items-center gap-1.5 mb-1.5">
        {status === 'success' ? (
          <span className="text-[10px] text-green-400">{message}</span>
        ) : (
          <>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="your@email.com"
              required
              autoFocus
              className="px-2 py-0.5 text-[10px] rounded border border-dm-border bg-dm-bg text-dm-text-primary w-40"
            />
            <button
              type="submit"
              disabled={status === 'loading'}
              className="px-2 py-0.5 text-[10px] font-medium rounded border border-dm-accent text-dm-accent hover:bg-dm-accent/10 transition-colors disabled:opacity-50"
            >
              {status === 'loading' ? '…' : 'Subscribe'}
            </button>
            <button
              type="button"
              onClick={() => setExpanded(false)}
              aria-label="Close subscribe form"
              className="text-[10px] text-dm-muted hover:text-dm-text-secondary"
            >
              ✕
            </button>
            {status === 'error' && <span className="text-[10px] text-red-400">{message}</span>}
          </>
        )}
      </form>
    );
  }

  if (variant === 'inline') {
    return (
      <form onSubmit={handleSubmit} className="flex items-center gap-2">
        {status === 'success' ? (
          <span className="text-xs text-green-400">{message}</span>
        ) : (
          <>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="your@email.com"
              required
              className="px-2 py-1 text-xs rounded border border-dm-border bg-dm-bg text-dm-text-primary w-48"
            />
            <button
              type="submit"
              disabled={status === 'loading'}
              className="px-3 py-1 text-xs font-medium rounded border border-dm-accent text-dm-accent hover:bg-dm-accent/10 transition-colors disabled:opacity-50"
            >
              {status === 'loading' ? 'Sending...' : 'Subscribe'}
            </button>
            {status === 'error' && <span className="text-xs text-red-400">{message}</span>}
          </>
        )}
      </form>
    );
  }

  return (
    <div className="rounded-lg border border-dm-border bg-dm-card p-5">
      <h3 className="text-sm font-semibold text-dm-text-primary mb-1">Weekly updates</h3>
      <p className="text-xs text-dm-text-secondary mb-3">
        Get the weekly summary delivered to your inbox every Monday.
      </p>
      {status === 'success' ? (
        <p className="text-xs text-green-400">{message}</p>
      ) : (
        <form onSubmit={handleSubmit} className="flex items-center gap-2">
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="your@email.com"
            required
            className="flex-1 px-3 py-1.5 text-xs rounded border border-dm-border bg-dm-bg text-dm-text-primary"
          />
          <button
            type="submit"
            disabled={status === 'loading'}
            className="px-4 py-1.5 text-xs font-medium rounded-md bg-dm-accent text-white hover:bg-dm-accent/90 transition-colors disabled:opacity-50"
          >
            {status === 'loading' ? 'Sending...' : 'Subscribe'}
          </button>
        </form>
      )}
      {status === 'error' && <p className="text-xs text-red-400 mt-2">{message}</p>}
    </div>
  );
}
