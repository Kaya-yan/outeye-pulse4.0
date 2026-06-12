'use client';

import { useAppStore } from '@/stores/useAppStore';

export function AnalysisProgressBar() {
  const { analysisProgress } = useAppStore();

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
