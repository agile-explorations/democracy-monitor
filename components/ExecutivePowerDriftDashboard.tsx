import React, {useEffect, useMemo, useRef, useState} from 'react';

const MIN = 60 * 1000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;
const WEEK = 7 * DAY;

function fmtDate(d?: Date | string | number) {
  if (!d) return '—';
  const dt = typeof d === 'string' || typeof d === 'number' ? new Date(d) : d;
  return dt.toLocaleString();
}

function useLocalStorage<T>(key: string, initial: T) {
  const [value, setValue] = useState<T>(() => {
    try { const raw = localStorage.getItem(key); return raw ? JSON.parse(raw) as T : initial; } catch { return initial; }
  });
  useEffect(() => { try { localStorage.setItem(key, JSON.stringify(value)); } catch {} }, [key, value]);
  return [value, setValue] as const;
}

// ---- Source catalog ----
const CATEGORIES: Array<{
  key: string;
  title: string;
  description: string;
  signals: Array<{ name: string; url: string; type: 'json' | 'rss' | 'html' | 'federal_register' | 'tracker_scrape'; note?: string }>;
}> = [
  {
    key: 'civilService',
    title: 'Government Worker Protections',
    description: "Are career government workers protected from being fired for political reasons? 'Schedule F' is a rule that could let the President fire thousands of workers who aren't loyal to him.",
    signals: [
      { name: 'Office of Personnel Management (OPM)', url: '/api/federal-register?agency=personnel-management-office', type: 'federal_register', note: 'The office that makes rules about government jobs' },
      { name: 'Schedule F Rules Search', url: '/api/federal-register?term=schedule+f+civil+service', type: 'federal_register', note: 'Looking for rules that could let the President fire career workers' }
    ]
  },
  {
    key: 'fiscal',
    title: 'Spending Money Congress Approved',
    description: 'Can the President refuse to spend money that Congress already approved? This is called "impoundment" and it\'s usually illegal.',
    signals: [
      { name: 'GAO Reports (Government Watchdog)', url: 'https://www.gao.gov/rss/reports.xml', type: 'rss', note: 'GAO checks if the government is following money rules' },
      { name: 'Impoundment News', url: '/api/federal-register?term=impoundment', type: 'federal_register', note: 'Reports about the President refusing to spend approved money' }
    ]
  },
  {
    key: 'igs',
    title: 'Government Watchdogs (Inspectors General)',
    description: 'Inspectors General (IGs) are like detectives who check if government agencies are doing their jobs correctly. Can they do their work without being fired or blocked?',
    signals: [
      { name: '⚠️ Oversight.gov - CURRENTLY DOWN', url: 'https://www.oversight.gov/', type: 'html', note: 'IMPORTANT: The main website for all government watchdog reports shut down in October 2025 because its funding was blocked.' },
      { name: 'Social Security Watchdog', url: 'https://oig.ssa.gov/feed.xml', type: 'rss', note: 'Reports from the Social Security Inspector General (still working)' }
    ]
  },
  {
    key: 'hatch',
    title: 'Keeping Politics Out of Government',
    description: 'Government workers should serve all Americans, not just one political party. The Hatch Act is a law that stops them from campaigning while at work.',
    signals: [
      { name: 'Hatch Act News', url: '/api/federal-register?term=hatch+act', type: 'federal_register', note: 'Reports about government workers breaking the rule against campaigning' },
      { name: 'Special Counsel Office', url: '/api/federal-register?agency=special-counsel-office', type: 'federal_register', note: 'The office that investigates Hatch Act violations' }
    ]
  },
  {
    key: 'courts',
    title: 'Following Court Orders',
    description: 'When a judge orders the government to do something (or stop doing something), does the President follow those orders? This is a key part of our system of checks and balances.',
    signals: [
      { name: 'Supreme Court Orders', url: 'https://www.supremecourt.gov/rss/orders.xml', type: 'rss', note: 'Orders from the highest court in America' },
      { name: 'Court Compliance Reports', url: '/api/federal-register?term=injunction+compliance', type: 'federal_register', note: 'Looking for reports about following (or not following) court orders' }
    ]
  },
  {
    key: 'military',
    title: 'Using Military Inside the U.S.',
    description: 'The military is supposed to fight foreign enemies, not police American citizens. There are strict laws about when troops can be used inside the U.S.',
    signals: [
      { name: 'Department of Defense News', url: 'https://www.defense.gov/DesktopModules/ArticleCS/RSS.ashx?ContentType=1&Site=945', type: 'rss', note: 'Official news from the Pentagon' },
      { name: 'Military Contracts', url: 'https://www.defense.gov/DesktopModules/ArticleCS/RSS.ashx?ContentType=9&Site=945', type: 'rss', note: 'What the military is buying (can show unusual activity)' }
    ]
  },
  {
    key: 'rulemaking',
    title: 'Independent Agency Rules',
    description: 'Some government agencies (like the FDA or EPA) are supposed to make decisions based on science and law, not politics. Can the President control what rules they write?',
    signals: [
      { name: 'New Government Rules', url: '/api/federal-register?type=RULE', type: 'federal_register', note: 'Rules that agencies just published' },
      { name: 'Proposed Government Rules', url: '/api/federal-register?type=PRORULE', type: 'federal_register', note: 'Rules that agencies want to create' }
    ]
  },
  {
    key: 'indices',
    title: 'Overall Democracy Health',
    description: 'Looking at the big picture: Are democratic institutions getting stronger or weaker? This tracks overall government activity.',
    signals: [
      { name: 'Presidential Actions', url: '/api/federal-register?type=PRESDOCU', type: 'federal_register', note: 'Executive orders and other actions by the President' },
      { name: 'All New Regulations', url: '/api/federal-register?type=RULE', type: 'federal_register', note: 'All new rules from government agencies' }
    ]
  }
];

async function fetchData(url: string, type: string) {
  // Direct fetch for internal APIs
  if (url.startsWith('/api/')) {
    const r = await fetch(url);
    if (!r.ok) throw new Error(`API ${r.status}`);
    return r.json();
  }

  // Proxy for external URLs
  const r = await fetch(`/api/proxy?url=${encodeURIComponent(url)}`);
  if (!r.ok) throw new Error(`Proxy ${r.status}`);
  return r.json();
}

function parseResult(payload: any, signalType: string, baseUrl: string) {
  // Handle Federal Register API responses
  if (signalType === 'federal_register' || payload?.type === 'federal_register') {
    const items = payload?.items || [];
    if (items.length === 0) {
      return [{ title: 'No recent documents found', link: baseUrl, isWarning: true }];
    }
    return items.slice(0, 8).map((it: any) => ({
      title: it.title || '(document)',
      link: it.link,
      pubDate: it.pubDate,
      agency: it.agency
    }));
  }

  // Handle tracker scrape responses
  if (signalType === 'tracker_scrape' || payload?.type === 'tracker_scrape') {
    const items = payload?.items || [];
    if (items.length === 0) {
      return [{ title: 'No items found - tracker may have changed structure', link: payload?.sourceUrl || baseUrl, isWarning: true }];
    }
    return items.slice(0, 10).map((it: any) => ({
      title: it.title,
      link: it.link,
      date: it.date
    }));
  }

  const d = payload?.data || {};

  if (d.type === 'error') {
    return [{ title: `Error: ${d.error || 'Unknown error'}`, link: baseUrl, isError: true }];
  }

  if (d.type === 'rss') {
    const items = d.items || [];
    return items.slice(0, 8).map((it: any) => {
      // Handle nested title/link objects (common in Atom feeds)
      const title = typeof it.title === 'string' ? it.title : it.title?._ || it.title;
      const link = typeof it.link === 'string' ? it.link : it.link?.href || it.link?._ || it.id;
      const pubDate = it.pubDate || it.published || it.updated;

      return {
        title: title || '(item)',
        link: link,
        pubDate: pubDate
      };
    });
  }

  if (d.type === 'html') {
    const anchors = d.anchors || [];
    if (anchors.length === 0) {
      return [{ title: 'No links found - site may be blocking requests', link: baseUrl, isWarning: true }];
    }
    return anchors.slice(0, 10).map((a: any) => ({
      title: a.text || a.href,
      link: a.href
    }));
  }

  if (d.type === 'json') {
    return Array.isArray(d.json) ? d.json : [{ title: '(json data)', link: baseUrl }];
  }

  return [{ title: 'No data available', link: baseUrl, isWarning: true }];
}

function StatusPill({ level }: { level: 'Stable' | 'Warning' | 'Drift' | 'Capture' }) {
  const colors: Record<string, string> = {
    Stable: 'bg-green-100 text-green-800 border-green-200',
    Warning: 'bg-yellow-100 text-yellow-800 border-yellow-200',
    Drift: 'bg-orange-100 text-orange-800 border-orange-200',
    Capture: 'bg-red-100 text-red-800 border-red-200',
  };
  return <span className={`px-2 py-1 rounded-full border text-xs font-medium ${colors[level]}`}>{level}</span>;
}

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-slate-200 shadow-sm p-4 md:p-6 bg-white">
      {children}
    </div>
  );
}

function useAutoRefresh(intervalMs: number, tick: () => void) {
  const saved = useRef(tick);
  useEffect(() => { saved.current = tick; }, [tick]);
  useEffect(() => {
    if (!intervalMs) return;
    const id = setInterval(() => saved.current(), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
}

function FeedBlock({ signalDef, onItemsLoaded }: { signalDef: { name: string; url: string; type: string; note?: string }; onItemsLoaded?: (items: any[]) => void }) {
  const [state, setState] = useState<{ status: 'idle' | 'loading' | 'ok' | 'error'; items?: any[]; ts?: number }>({ status: 'idle' });

  const load = async () => {
    setState({ status: 'loading' });
    try {
      const payload = await fetchData(signalDef.url, signalDef.type);
      const items = parseResult(payload, signalDef.type, signalDef.url);
      setState({ status: 'ok', items, ts: Date.now() });
      if (onItemsLoaded && items) {
        onItemsLoaded(items);
      }
    } catch (e: any) {
      setState({ status: 'error', ts: Date.now() });
      if (onItemsLoaded) {
        onItemsLoaded([]);
      }
    }
  };

  useEffect(() => { load(); }, []);

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <a href={signalDef.url} target="_blank" rel="noreferrer" className="font-medium text-slate-800 hover:underline">{signalDef.name}</a>
        <span className="text-xs text-slate-400">({signalDef.type.toUpperCase()})</span>
        <button onClick={load} className="ml-auto text-xs px-2 py-1 rounded border bg-slate-50 hover:bg-slate-100">Refresh</button>
      </div>
      {signalDef.note && <p className="text-xs text-slate-500">{signalDef.note}</p>}
      {state.status === 'loading' && <p className="text-xs text-slate-500">Loading…</p>}
      {state.status === 'ok' && (
        <ul className="text-sm list-disc pl-5 space-y-1">
          {state.items && state.items.length > 0 ? state.items.slice(0, 6).map((it, idx) => {
            const itemClass = it.isError ? 'text-red-600' : it.isWarning ? 'text-amber-600' : 'text-slate-800';
            return (
              <li key={idx} className={itemClass}>
                {it.link ? (
                  <a className="hover:underline" href={it.link} target="_blank" rel="noreferrer">
                    {it.title || it.link}
                  </a>
                ) : (
                  <span>{it.title || '(item)'}</span>
                )}
                {it.pubDate && <span className="ml-2 text-xs text-slate-400">{fmtDate(it.pubDate)}</span>}
                {it.isError && <span className="ml-2 text-xs text-red-500">(blocked)</span>}
                {it.isWarning && <span className="ml-2 text-xs text-amber-500">(limited data)</span>}
              </li>
            );
          }) : <li className="text-slate-500">No parsed items</li>}
        </ul>
      )}
      {state.status === 'error' && (
        <div className="text-xs text-red-700 bg-red-50 border border-red-200 rounded p-2">
          Error loading from proxy. Open the source link above to view directly.
        </div>
      )}
      <div className="text-[10px] text-slate-400">Last check: {fmtDate(state.ts)}</div>
    </div>
  );
}

function CategoryCard({ cat, statusMap, setStatus }:{ cat: typeof CATEGORIES[number]; statusMap: Record<string, string>; setStatus: (k:string,v:string)=>void }){
  const [autoStatus, setAutoStatus] = useState<{ level: string; reason: string; auto: boolean; matches?: string[]; assessedAt?: string; detail?: any } | null>(null);
  const [allItems, setAllItems] = useState<any[]>([]);
  const [loadedCount, setLoadedCount] = useState(0);
  const [showDetails, setShowDetails] = useState(false);

  const level = autoStatus?.level || (statusMap[cat.key] as any) || 'Warning';

  // Assess status when all feeds are loaded
  useEffect(() => {
    if (loadedCount === cat.signals.length && allItems.length > 0) {
      assessStatus();
    }
  }, [loadedCount, allItems]);

  const assessStatus = async () => {
    try {
      const response = await fetch('/api/assess-status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ category: cat.key, items: allItems })
      });
      const data = await response.json();
      setAutoStatus({
        level: data.status,
        reason: data.reason,
        auto: true,
        matches: data.matches || [],
        assessedAt: data.assessedAt,
        detail: data.detail
      });
      setStatus(cat.key, data.status);
    } catch (err) {
      console.error('Status assessment failed:', err);
    }
  };

  const handleItemsLoaded = (items: any[]) => {
    setAllItems(prev => [...prev, ...items]);
    setLoadedCount(prev => prev + 1);
  };

  return (
    <Card>
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-3">
          <h3 className="text-lg font-semibold text-slate-900">{cat.title}</h3>
          <StatusPill level={level as any} />
          {autoStatus?.auto && <span className="text-xs text-slate-500 italic">auto-assessed</span>}
          {autoStatus?.auto && (
            <button
              onClick={() => setShowDetails(!showDetails)}
              className="text-xs text-blue-600 hover:text-blue-800 underline ml-auto"
            >
              {showDetails ? 'Hide Details' : 'View Assessment Details'}
            </button>
          )}
        </div>
        <p className="text-sm text-slate-600">{cat.description}</p>
        {autoStatus?.reason && (
          <p className="text-xs text-slate-700 bg-slate-50 border border-slate-200 rounded px-2 py-1">
            <strong>Assessment:</strong> {autoStatus.reason}
          </p>
        )}
        {showDetails && autoStatus && (
          <div className="mt-2 p-3 bg-blue-50 border border-blue-200 rounded text-xs space-y-2">
            <h4 className="font-semibold text-blue-900">How We Determined This Status</h4>
            <div className="space-y-2">
              <p><strong>Status:</strong> <span className={`font-semibold ${autoStatus.level === 'Capture' ? 'text-red-700' : autoStatus.level === 'Drift' ? 'text-orange-700' : autoStatus.level === 'Warning' ? 'text-yellow-700' : 'text-green-700'}`}>{autoStatus.level}</span></p>
              <p><strong>When checked:</strong> {fmtDate(autoStatus.assessedAt)}</p>
              <p><strong>Documents reviewed:</strong> {autoStatus.detail?.itemsReviewed || allItems.length} from {cat.signals.length} sources</p>

              {autoStatus.detail && (
                <div className="mt-3 p-2 bg-white rounded border border-blue-300">
                  <p className="font-semibold mb-2">What We Found:</p>
                  {autoStatus.detail.captureCount > 0 && (
                    <p className="text-red-700">• {autoStatus.detail.captureCount} serious violation{autoStatus.detail.captureCount !== 1 ? 's' : ''} found</p>
                  )}
                  {autoStatus.detail.driftCount > 0 && (
                    <p className="text-orange-700">• {autoStatus.detail.driftCount} concerning pattern{autoStatus.detail.driftCount !== 1 ? 's' : ''} detected</p>
                  )}
                  {autoStatus.detail.warningCount > 0 && (
                    <p className="text-yellow-700">• {autoStatus.detail.warningCount} minor issue{autoStatus.detail.warningCount !== 1 ? 's' : ''} noted</p>
                  )}
                  {autoStatus.detail.hasAuthoritative && (
                    <p className="text-red-700 font-semibold mt-1">⚠️ Violations confirmed by official sources (GAO, courts, or watchdogs)</p>
                  )}
                </div>
              )}

              {autoStatus.matches && autoStatus.matches.length > 0 && (
                <div className="mt-2">
                  <strong>Problem words we found:</strong>
                  <ul className="list-disc list-inside ml-2 mt-1 space-y-0.5">
                    {autoStatus.matches.slice(0, 5).map((match, idx) => (
                      <li key={idx} className="text-red-700">"{match}"</li>
                    ))}
                    {autoStatus.matches.length > 5 && (
                      <li className="text-slate-500">...and {autoStatus.matches.length - 5} more</li>
                    )}
                  </ul>
                </div>
              )}

              <div className="mt-3 pt-2 border-t border-blue-300 text-slate-600">
                <strong>How it works:</strong>
                <p className="mt-1">We search documents for specific words and phrases. Serious violations (like "violated the law" or "illegal") from official sources (GAO, courts, IGs) automatically trigger red flags.</p>
              </div>
            </div>
          </div>
        )}
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
        {cat.signals.map((s, i) => (
          <Card key={i}>
            <FeedBlock signalDef={s} onItemsLoaded={handleItemsLoaded} />
          </Card>
        ))}
      </div>
    </Card>
  );
}

export default function ExecutivePowerDriftDashboard(){
  const [refreshMs, setRefreshMs] = useLocalStorage<number>('epd.refresh', WEEK);
  const [statusMap, setStatusMap] = useLocalStorage<Record<string, string>>('epd.status', {});
  const [lastTick, setLastTick] = useState<number>(Date.now());

  const humanRefresh = useMemo(() => {
    if (refreshMs >= WEEK) return 'Weekly';
    if (refreshMs >= DAY) return `${Math.round(refreshMs / DAY)} day(s)`;
    if (refreshMs >= HOUR) return `${Math.round(refreshMs / HOUR)} hour(s)`;
    return `${Math.round(refreshMs / MIN)} min`;
  }, [refreshMs]);

  const setStatus = (k:string, v:string)=> setStatusMap({...statusMap, [k]: v});

  // Optional timed refresh if you want to re-pull via proxy on a schedule:
  const saved = useRef(() => setLastTick(Date.now()));
  useEffect(() => { saved.current = () => setLastTick(Date.now()); }, []);
  useEffect(() => {
    const id = setInterval(() => saved.current(), refreshMs);
    return () => clearInterval(id);
  }, [refreshMs]);

  return (
    <div className="min-h-screen bg-slate-50 py-6 px-4 md:px-8">
      <div className="max-w-6xl mx-auto space-y-6">
        <header className="flex flex-col md:flex-row md:items-end md:justify-between gap-3">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-slate-900">Is Democracy Working?</h1>
            <p className="text-sm text-slate-600 mt-1">This dashboard checks if the government is following the rules. It looks at official documents from courts, watchdogs, and government agencies to see if power is being used properly.</p>
          </div>
          <div className="flex items-center gap-3">
            <div className="text-xs text-slate-500">Updates: <span className="font-medium text-slate-700">{humanRefresh}</span></div>
            <select value={refreshMs} onChange={(e)=>setRefreshMs(parseInt(e.target.value))} className="text-sm border rounded px-2 py-1 bg-white">
              <option value={WEEK}>Weekly</option>
              <option value={DAY}>Daily</option>
              <option value={6*HOUR}>Every 6 hours</option>
              <option value={HOUR}>Every hour</option>
              <option value={15*MIN}>Every 15 minutes</option>
            </select>
          </div>
        </header>

        <Card>
          <h2 className="text-sm font-semibold text-slate-900 mb-3">What Do The Colors Mean?</h2>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3 text-xs">
            <div className="flex items-start gap-2">
              <StatusPill level="Stable" />
              <span className="text-slate-600">Everything is working normally - courts and watchdogs are doing their jobs</span>
            </div>
            <div className="flex items-start gap-2">
              <StatusPill level="Warning" />
              <span className="text-slate-600">Some problems detected, but institutions are still pushing back</span>
            </div>
            <div className="flex items-start gap-2">
              <StatusPill level="Drift" />
              <span className="text-slate-600">Multiple warning signs - power is becoming more centralized</span>
            </div>
            <div className="flex items-start gap-2">
              <StatusPill level="Capture" />
              <span className="text-slate-600">Serious violations found - the President is ignoring laws or court orders</span>
            </div>
          </div>
        </Card>

        <div className="grid grid-cols-1 gap-6">
          {CATEGORIES.map((cat) => (
            <div key={cat.key + '-' + lastTick}>
              <CategoryCard cat={cat} statusMap={statusMap} setStatus={setStatus} />
            </div>
          ))}
        </div>

        <footer className="text-xs text-slate-500 pt-4 pb-8">
          <p><strong>How this works:</strong> This website reads official government documents and looks for warning signs. The colors (green/yellow/orange/red) are decided automatically by searching for specific words and phrases. Last updated: <span className="text-slate-700">{fmtDate(lastTick)}</span>.</p>
          <p className="mt-2"><strong>About the data:</strong> All information comes directly from government websites. Click any link to see the original source.</p>
        </footer>
      </div>
    </div>
  );
}