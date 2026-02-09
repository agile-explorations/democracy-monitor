import { useCallback, useEffect, useRef, useState } from 'react';
import type { FeedItem } from '@/lib/parsers/feed-parser';
import type { AutoStatus, EnhancedData } from '@/lib/types/category-card';

const SNAPSHOT_MAX_AGE_MS = 36 * 60 * 60 * 1000; // 36 hours

function timeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const hours = Math.floor(ms / (1000 * 60 * 60));
  if (hours < 1) return 'just now';
  if (hours === 1) return '1 hour ago';
  if (hours < 24) return `${hours} hours ago`;
  const days = Math.floor(hours / 24);
  return days === 1 ? '1 day ago' : `${days} days ago`;
}

export function useCategoryAssessment(
  categoryKey: string,
  signalCount: number,
  setStatus: (k: string, v: string) => void,
) {
  const [autoStatus, setAutoStatus] = useState<AutoStatus | null>(null);
  const [allItems, setAllItems] = useState<FeedItem[]>([]);
  const [loadedCount, setLoadedCount] = useState(0);
  const [enhancedData, setEnhancedData] = useState<EnhancedData | null>(null);
  const [snapshotAge, setSnapshotAge] = useState<string | null>(null);
  const [usedSnapshot, setUsedSnapshot] = useState(false);
  const usedSnapshotRef = useRef(false);

  const isAssessing = !autoStatus && loadedCount < signalCount;

  // Step 0: Try loading a snapshot on mount
  useEffect(() => {
    let cancelled = false;
    const loadSnapshot = async () => {
      try {
        const res = await fetch(`/api/snapshots/latest?category=${categoryKey}`);
        if (!res.ok) return;
        const snapshot = await res.json();
        if (cancelled) return;

        const age = Date.now() - new Date(snapshot.assessedAt).getTime();
        if (age > SNAPSHOT_MAX_AGE_MS) return;

        setAutoStatus({
          level: snapshot.status,
          reason: snapshot.reason,
          auto: true,
          matches: snapshot.matches || [],
          assessedAt: snapshot.assessedAt,
          detail: snapshot.keywordResult?.detail,
        });
        setStatus(categoryKey, snapshot.status);
        setEnhancedData({
          dataCoverage: snapshot.dataCoverage ?? 0,
          evidenceFor: snapshot.evidenceFor || [],
          evidenceAgainst: snapshot.evidenceAgainst || [],
          howWeCouldBeWrong: snapshot.howWeCouldBeWrong || [],
          aiResult: snapshot.aiResult,
          consensusNote: snapshot.consensusNote,
          debate: snapshot.debate,
          legalAnalysis: snapshot.legalAnalysis,
          trendAnomalies: snapshot.trendAnomalies,
        });
        setSnapshotAge(timeAgo(snapshot.assessedAt));
        usedSnapshotRef.current = true;
        setUsedSnapshot(true);
      } catch {
        // Snapshot fetch failed — will fall back to live assessment
      }
    };
    loadSnapshot();
    return () => {
      cancelled = true;
    };
  }, [categoryKey, setStatus]);

  // Step 1: Run keyword assessment after all feeds load
  useEffect(() => {
    if (usedSnapshot) return;
    if (loadedCount === signalCount && allItems.length > 0) {
      const assessStatus = async () => {
        try {
          const response = await fetch('/api/assess-status', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ category: categoryKey, items: allItems }),
          });
          if (usedSnapshotRef.current) return;
          const data = await response.json();
          setAutoStatus({
            level: data.status,
            reason: data.reason,
            auto: true,
            matches: data.matches || [],
            assessedAt: data.assessedAt,
            detail: data.detail,
          });
          setStatus(categoryKey, data.status);
        } catch (err) {
          console.error('Status assessment failed:', err);
        }
      };
      assessStatus();
    }
  }, [loadedCount, allItems, categoryKey, signalCount, setStatus, usedSnapshot]);

  // Step 2: Auto-run AI assessment after keyword assessment
  useEffect(() => {
    if (usedSnapshot) return;
    if (autoStatus?.auto && !enhancedData && allItems.length > 0) {
      const runAiAssessment = async () => {
        try {
          const response = await fetch('/api/assess-status?ai=true', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ category: categoryKey, items: allItems }),
          });
          if (usedSnapshotRef.current) return;
          const data = await response.json();

          if (data.dataCoverage !== undefined || data.confidence !== undefined) {
            setEnhancedData({
              dataCoverage: data.dataCoverage ?? data.confidence ?? 0,
              evidenceFor: data.evidenceFor || [],
              evidenceAgainst: data.evidenceAgainst || [],
              howWeCouldBeWrong: data.howWeCouldBeWrong || [],
              aiResult: data.aiResult,
              consensusNote: data.consensusNote,
            });
          }
        } catch (err) {
          console.error('AI assessment failed:', err);
        }
      };
      runAiAssessment();
    }
  }, [autoStatus?.auto, enhancedData, allItems, categoryKey, usedSnapshot]);

  const handleItemsLoaded = useCallback((items: FeedItem[]) => {
    setAllItems((prev) => [...prev, ...items]);
    setLoadedCount((prev) => prev + 1);
  }, []);

  return {
    autoStatus,
    enhancedData,
    snapshotAge,
    allItems,
    handleItemsLoaded,
    isAssessing,
  };
}
