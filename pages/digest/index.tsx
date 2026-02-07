import Head from 'next/head';
import Link from 'next/link';
import React, { useEffect, useState } from 'react';

interface DigestSummary {
  date: string;
  summary: string;
  provider: string;
}

export default function DigestArchive() {
  const [digests, setDigests] = useState<DigestSummary[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Load last 7 days of digests
    const loadDigests = async () => {
      const results: DigestSummary[] = [];
      const today = new Date();

      for (let i = 0; i < 7; i++) {
        const date = new Date(today);
        date.setDate(date.getDate() - i);
        const dateStr = date.toISOString().split('T')[0];

        try {
          const res = await fetch(`/api/digest/${dateStr}`);
          if (res.ok) {
            const data = await res.json();
            results.push({
              date: data.date,
              summary: data.summary,
              provider: data.provider,
            });
          }
        } catch {
          // Skip unavailable digests
        }
      }

      setDigests(results);
      setLoading(false);
    };

    loadDigests();
  }, []);

  return (
    <>
      <Head>
        <title>Daily Digest Archive — Democracy Monitor</title>
        <meta
          name="description"
          content="Archive of daily digest summaries from the Democracy Monitor."
        />
      </Head>
      <main className="min-h-screen bg-slate-50 py-6 px-4 md:px-8">
        <div className="max-w-4xl mx-auto space-y-6">
          <div className="flex items-center justify-between">
            <h1 className="text-2xl font-bold text-slate-900">Daily Digest Archive</h1>
            <Link href="/" className="text-sm text-blue-600 hover:underline">
              Back to Dashboard
            </Link>
          </div>

          {loading && <p className="text-sm text-slate-500 italic">Loading digests...</p>}

          {!loading && digests.length === 0 && (
            <div className="bg-white border border-slate-200 rounded-lg p-6 text-center">
              <p className="text-sm text-slate-500">
                No digests available yet. Digests are generated daily when AI providers are
                configured.
              </p>
            </div>
          )}

          <div className="space-y-3">
            {digests.map((digest) => (
              <Link
                key={digest.date}
                href={`/digest/${digest.date}`}
                className="block bg-white border border-slate-200 rounded-lg p-4 hover:border-blue-300 transition-colors"
              >
                <div className="flex items-center justify-between mb-2">
                  <h2 className="text-sm font-semibold text-slate-900">{digest.date}</h2>
                  <span className="text-xs text-slate-400">{digest.provider}</span>
                </div>
                <p className="text-xs text-slate-600 line-clamp-2">{digest.summary}</p>
              </Link>
            ))}
          </div>
        </div>
      </main>
    </>
  );
}
