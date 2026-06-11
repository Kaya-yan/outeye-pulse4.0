'use client';

import { useEffect, useRef } from 'react';
import { useAppStore } from '@/stores/useAppStore';
import Link from 'next/link';

export function AnalysisProgressBar() {
  const { activeAnalysisLogId, setActiveAnalysisLogId, analysisProgress, setAnalysisProgress } = useAppStore();
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!activeAnalysisLogId) {
      if (intervalRef.current) clearInterval(intervalRef.current);
      return;
    }

    const poll = async () => {
      try {
        const res = await fetch(`/api/analysis?logId=${activeAnalysisLogId}`);
        const data = await res.json();
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
        // ignore polling errors
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
    <div className="fixed top-14 left-0 right-0 z-40 bg-[#0B1221] border-b border-[#1E293B] px-6 py-2">
      <div className="max-w-7xl mx-auto flex items-center gap-4">
        <span className="text-xs text-[#94A3B8] flex-shrink-0">
          正在分析 {analysisProgress.total} 条评论...
        </span>
        <div className="flex-1 h-2 bg-[#1E293B] rounded-full overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-[#3B82F6] to-[#8B5CF6] rounded-full transition-all duration-500"
            style={{ width: `${pct}%` }}
          />
        </div>
        <span className="text-xs text-[#60A5FA] font-mono flex-shrink-0">
          {pct}%
        </span>
        <span className="text-xs text-[#64748B] flex-shrink-0">
          {analysisProgress.processed}/{analysisProgress.total}
        </span>
      </div>
    </div>
  );
}
