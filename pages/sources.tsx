import Head from 'next/head';
import Link from 'next/link';
import { CATEGORIES } from '@/lib/data/categories';
import { MONITORED_SITES } from '@/lib/data/monitored-sites';

export default function Sources() {
  return (
    <>
      <Head>
        <title>Data Sources — Executive Power Drift Dashboard</title>
        <meta name="description" content="All data sources used by the Executive Power Drift Dashboard." />
      </Head>
      <main className="min-h-screen bg-slate-50 py-6 px-4 md:px-8">
        <div className="max-w-4xl mx-auto space-y-6">
          <div className="flex items-center justify-between">
            <h1 className="text-2xl font-bold text-slate-900">Data Sources</h1>
            <Link href="/" className="text-sm text-blue-600 hover:underline">Back to Dashboard</Link>
          </div>

          <div className="bg-white border border-slate-200 rounded-lg p-6 space-y-6 text-sm text-slate-700">
            <section>
              <h2 className="text-lg font-semibold text-slate-900 mb-3">Category Sources</h2>
              <p className="mb-4">Each category monitors specific data signals from government agencies, watchdog organizations, and official publications.</p>

              <div className="space-y-4">
                {CATEGORIES.map(cat => (
                  <div key={cat.key} className="border border-slate-200 rounded p-3">
                    <h3 className="font-semibold text-slate-800 mb-1">{cat.title}</h3>
                    <p className="text-xs text-slate-500 mb-2">{cat.description}</p>
                    <div className="space-y-1">
                      {cat.signals.map((signal, i) => (
                        <div key={i} className="flex items-start gap-2 text-xs">
                          <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${
                            signal.type === 'rss' ? 'bg-blue-100 text-blue-700' :
                            signal.type === 'federal_register' ? 'bg-green-100 text-green-700' :
                            signal.type === 'html' ? 'bg-purple-100 text-purple-700' :
                            signal.type === 'json' ? 'bg-amber-100 text-amber-700' :
                            'bg-slate-100 text-slate-700'
                          }`}>
                            {signal.type}
                          </span>
                          <div>
                            <span className="font-medium">{signal.name}</span>
                            {signal.note && <span className="text-slate-400 ml-1">— {signal.note}</span>}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-slate-900 mb-3">Monitored Government Sites</h2>
              <p className="mb-4">The dashboard monitors {MONITORED_SITES.length} government websites for availability, checking each site hourly.</p>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                {MONITORED_SITES.map(site => (
                  <div key={site.hostname} className="flex items-center gap-2 text-xs p-2 bg-slate-50 rounded">
                    <span className={`w-2 h-2 rounded-full ${site.critical ? 'bg-red-400' : 'bg-slate-400'}`} />
                    <span className="font-medium">{site.name}</span>
                    <span className="text-slate-400 ml-auto">{site.hostname}</span>
                  </div>
                ))}
              </div>
              <p className="text-xs text-slate-400 mt-2">Red dots indicate critical sites whose downtime significantly impacts assessments.</p>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-slate-900 mb-3">Source Types</h2>
              <div className="space-y-2 text-xs">
                <div className="flex items-start gap-2">
                  <span className="px-1.5 py-0.5 rounded bg-blue-100 text-blue-700 font-medium">rss</span>
                  <span>RSS/Atom feeds from government agencies and watchdog organizations</span>
                </div>
                <div className="flex items-start gap-2">
                  <span className="px-1.5 py-0.5 rounded bg-green-100 text-green-700 font-medium">federal_register</span>
                  <span>Federal Register API queries for official government documents</span>
                </div>
                <div className="flex items-start gap-2">
                  <span className="px-1.5 py-0.5 rounded bg-purple-100 text-purple-700 font-medium">html</span>
                  <span>Web pages scraped for structured data and link extraction</span>
                </div>
                <div className="flex items-start gap-2">
                  <span className="px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 font-medium">json</span>
                  <span>Direct JSON API endpoints from government data services</span>
                </div>
                <div className="flex items-start gap-2">
                  <span className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-700 font-medium">tracker_scrape</span>
                  <span>Custom scrapers for democracy watchdog trackers (Brookings, NAACP LDF, etc.)</span>
                </div>
              </div>
            </section>
          </div>
        </div>
      </main>
    </>
  );
}
