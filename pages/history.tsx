import dynamic from 'next/dynamic';
import Head from 'next/head';

const HistorySection = dynamic(
  () => import('@/components/history/HistorySection').then((m) => m.HistorySection),
  { ssr: false },
);

export default function HistoryPage() {
  return (
    <>
      <Head>
        <title>Historical Trajectory | Democracy Monitor</title>
      </Head>
      <div className="min-h-screen bg-slate-50 py-6 px-4 md:px-8">
        <div className="max-w-6xl mx-auto space-y-6">
          <header>
            <h1 className="text-2xl font-bold text-slate-900">Historical Trajectory</h1>
            <p className="text-sm text-slate-500 mt-1">
              Institutional health assessment from inauguration day (Jan 20, 2025) to present
            </p>
          </header>

          <nav className="flex gap-4 text-xs text-slate-500">
            <a href="/" className="hover:text-blue-600 underline">
              Dashboard
            </a>
            <a href="/methodology" className="hover:text-blue-600 underline">
              Methodology
            </a>
            <a href="/sources" className="hover:text-blue-600 underline">
              Data Sources
            </a>
            <a href="/digest" className="hover:text-blue-600 underline">
              Daily Digests
            </a>
          </nav>

          <HistorySection />
        </div>
      </div>
    </>
  );
}
