import React, { useEffect, useState } from 'react';
import type { Signal } from '@/lib/types';
import type { FeedItem, FeedPayload } from '@/lib/parsers/feed-parser';
import { fetchData } from '@/lib/services/feed-service';
import { parseResult } from '@/lib/parsers/feed-parser';

function fmtDate(d?: Date | string | number) {
  if (!d) return '\u2014';
  const dt = typeof d === 'string' || typeof d === 'number' ? new Date(d) : d;
  return dt.toLocaleString();
}

interface FeedBlockProps {
  signalDef: Signal;
  onItemsLoaded?: (items: FeedItem[]) => void;
}

export function FeedBlock({ signalDef, onItemsLoaded }: FeedBlockProps) {
  const [state, setState] = useState<{
    status: 'idle' | 'loading' | 'ok' | 'error';
    items?: FeedItem[];
    ts?: number;
  }>({ status: 'idle' });

  const load = async () => {
    setState({ status: 'loading' });
    try {
      const payload = (await fetchData(signalDef.url, signalDef.type)) as FeedPayload;
      const items = parseResult(payload, signalDef.type, signalDef.url);
      setState({ status: 'ok', items, ts: Date.now() });
      if (onItemsLoaded && items) {
        onItemsLoaded(items);
      }
    } catch {
      setState({ status: 'error', ts: Date.now() });
      if (onItemsLoaded) {
        onItemsLoaded([]);
      }
    }
  };

  useEffect(() => {
    load();
  }, []);

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <a
          href={signalDef.url}
          target="_blank"
          rel="noreferrer"
          className="font-medium text-slate-800 hover:underline"
        >
          {signalDef.name}
        </a>
        <span className="text-xs text-slate-400">({signalDef.type.toUpperCase()})</span>
        <button
          onClick={load}
          className="ml-auto text-xs px-2 py-1 rounded border bg-slate-50 hover:bg-slate-100"
        >
          Refresh
        </button>
      </div>
      {signalDef.note && <p className="text-xs text-slate-500">{signalDef.note}</p>}
      {state.status === 'loading' && <p className="text-xs text-slate-500">Loading...</p>}
      {state.status === 'ok' && (
        <ul className="text-sm list-disc pl-5 space-y-1">
          {state.items && state.items.length > 0 ? (
            state.items.slice(0, 6).map((it, idx) => {
              const itemClass = it.isError
                ? 'text-red-600'
                : it.isWarning
                  ? 'text-amber-600'
                  : 'text-slate-800';
              return (
                <li key={idx} className={itemClass}>
                  {it.link ? (
                    <a className="hover:underline" href={it.link} target="_blank" rel="noreferrer">
                      {it.title || it.link}
                    </a>
                  ) : (
                    <span>{it.title || '(item)'}</span>
                  )}
                  {it.pubDate && (
                    <span className="ml-2 text-xs text-slate-400">{fmtDate(it.pubDate)}</span>
                  )}
                  {it.isError && <span className="ml-2 text-xs text-red-500">(blocked)</span>}
                  {it.isWarning && (
                    <span className="ml-2 text-xs text-amber-500">(limited data)</span>
                  )}
                </li>
              );
            })
          ) : (
            <li className="text-slate-500">No parsed items</li>
          )}
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
