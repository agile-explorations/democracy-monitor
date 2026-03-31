import { useRouter } from 'next/router';
import { useEffect, useState } from 'react';

export default function AdminLoginPage() {
  const router = useRouter();
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  // Redirect if already authenticated
  useEffect(() => {
    const check = async () => {
      try {
        const r = await fetch('/api/admin/login');
        const data = await r.json();
        if (data.authenticated) router.replace('/admin/feedback');
        else setLoading(false);
      } catch {
        setLoading(false);
      }
    };
    check();
  }, [router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    const res = await fetch('/api/admin/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password }),
    });
    if (res.ok) {
      router.replace('/admin/feedback');
    } else {
      setError('Invalid password');
    }
  };

  if (loading) return null;

  return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <form onSubmit={handleSubmit} className="w-full max-w-sm space-y-4">
        <h1 className="text-lg font-bold text-dm-text-primary">Admin Login</h1>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Password"
          autoFocus
          className="w-full px-3 py-2 rounded-lg border border-dm-border bg-dm-card text-dm-text-primary text-sm focus:outline-none focus:ring-2 focus:ring-dm-accent/50"
        />
        {error && <p className="text-xs text-red-400">{error}</p>}
        <button
          type="submit"
          disabled={!password}
          className="w-full px-4 py-2 rounded-lg bg-dm-accent text-white text-sm font-medium hover:opacity-90 disabled:opacity-50"
        >
          Log in
        </button>
      </form>
    </div>
  );
}
