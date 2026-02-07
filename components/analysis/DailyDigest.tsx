import React, { useEffect, useState } from 'react';
import type { DigestEntry } from '@/lib/types/trends';
import { Card } from '@/components/ui/Card';

interface DailyDigestProps {
  date?: string;
}

export function DailyDigest({ date }: DailyDigestProps) {
  const [digest, setDigest] = useState<DigestEntry | null>(null);
  const [loading, setLoading] = useState(true);

  const targetDate = date || new Date().toISOString().split('T')[0];

  useEffect(() => {
    fetchDigest();
  }, [targetDate]);

  const fetchDigest = async () => {
    try {
      const res = await fetch(`/api/digest/${targetDate}`);
      if (res.ok) {
        setDigest(await res.json());
      }
    } catch {
      // Digest not available
    } finally {
      setLoading(false);
    }
  };

  if (loading) return null;
  if (!digest) return null;

  return (
    <Card>
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-900">
            Daily Digest — {digest.date}
          </h3>
          <span className="text-xs text-slate-500">
            {digest.provider} ({digest.model})
          </span>
        </div>

        <p className="text-sm text-slate-700">{digest.summary}</p>

        {digest.highlights.length > 0 && (
          <div>
            <h4 className="text-xs font-semibold text-slate-800 mb-1">Highlights</h4>
            <ul className="space-y-1">
              {digest.highlights.map((h, i) => (
                <li key={i} className="text-xs text-slate-600">{'•'} {h}</li>
              ))}
            </ul>
          </div>
        )}

        {Object.keys(digest.categorySummaries).length > 0 && (
          <div>
            <h4 className="text-xs font-semibold text-slate-800 mb-1">By Category</h4>
            <div className="space-y-1">
              {Object.entries(digest.categorySummaries).map(([cat, summary]) => (
                <div key={cat} className="text-xs">
                  <span className="font-medium text-slate-700">{cat}:</span>{' '}
                  <span className="text-slate-600">{summary}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {digest.overallAssessment && (
          <div className="pt-2 border-t border-slate-200">
            <p className="text-xs text-slate-700 italic">{digest.overallAssessment}</p>
          </div>
        )}
      </div>
    </Card>
  );
}
