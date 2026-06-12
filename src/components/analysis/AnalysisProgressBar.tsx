'use client';

import { useEffect, useRef } from 'react';
import { useAppStore } from '@/stores/useAppStore';
import Link from 'next/link';

export function AnalysisProgressBar() {
  const { activeAnalysisLogId, setActiveAnalysisLogId, analysisProgress, setAnalysisProgress } = useAppStore();
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startTimeRef = useRef<number>(0);
  const errorCountRef = useRef<number>(0);

  useEffect(() => {
    if (!activeAnalysisLogId) {
      if (intervalRef.current) clearInterval(intervalRef.current);
      return;
    }

    startTimeRef.current = Date.now();
    errorCountRef.current = 0;
    const TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes
    const MAX_ERRORS = 5;

    const poll = async () => {
      // Timeout: stop polling if running too long
      if (Date.now() - startTimeRef.current > TIMEOUT_MS) {
        setAnalysisProgress({ processed: 0, total: 0, status: 'failed' });
        setActiveAnalysisLogId(null);
        if (intervalRef.current) clearInterval(intervalRef.current);
        return;
      }

      try {
        const res = await fetch(`/api/analysis?logId=${activeAnalysisLogId}`);
        const data = await res.json();
        errorCountRef.current = 0; // reset on success
        if (data.log) {
          setAnalysisProgress({
            processed: data.log.processed_comments,
            total: data.log.total_comments,
            status: data.log.status,
          });
          if (data.log.status === 'completed' || data.log.status === 'failed') {
            setActiveAnalysisLogId(null);
            if (intervalRef.current) clearInterval(intervalRef.current);
          }
        }
      } catch {
        errorCountRef.current++;
        if (errorCountRef.current >= MAX_ERRORS) {
          setAnalysisProgress({ processed: 0, total: 0, status: 'failed' });
          setActiveAnalysisLogId(null);
          if (intervalRef.current) clearInterval(intervalRef.current);
        }
      }
    };

    poll();
    intervalRef.current = setInterval(poll, 3000);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [activeAnalysisLogId, setActiveAnalysisLogId, setAnalysisProgress]);

  if (!analysisProgress || analysisProgress.status === 'completed' || analysisProgress.status === 'failed') {
    return null;
  }

  const pct = analysisProgress.total > 0
    ? Math.round((analysisProgress.processed / analysisProgress.total) * 100)
    : 0;

  return (
    <div className="fixed top-14 left-0 right-0 z-40 bg-[var(--color-bg-card)] border-b border-[var(--color-border-subtle)] px-6 py-2 animate-fade-in">
      <div className="max-w-7xl mx-auto flex items-center gap-4">
        <span className="text-xs text-[var(--color-text-secondary)] flex-shrink-0">
          正在分析 {analysisProgress.total} 条评论...
        </span>
        <div className="flex-1 h-1.5 bg-[var(--color-bg-deep)] rounded-full overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-500"
            style={{
              width: `${pct}%`,
              background: `linear-gradient(90deg, var(--color-accent-blue), var(--color-accent-purple))`
            }}
          />
        </div>
        <span className="text-xs text-[var(--color-accent-blue)] font-mono flex-shrink-0">
          {pct}%
        </span>
        <span className="text-xs text-[var(--color-text-muted)] flex-shrink-0">
          {analysisProgress.processed}/{analysisProgress.total}
        </span>
      </div>
    </div>
  );
}
