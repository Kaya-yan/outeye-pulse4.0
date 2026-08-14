export interface ResearchTraceRun {
  id: string;
  status: string;
  source: string;
  mode: string;
}

export interface ResearchTraceComment {
  id: string;
  platform?: string | null;
}

export interface ResearchTraceEvent {
  collection_run_id?: string | null;
  stage?: string | null;
  code?: string | null;
}

export interface ResearchTraceInput {
  runs: ReadonlyArray<ResearchTraceRun>;
  events?: ReadonlyArray<ResearchTraceEvent>;
  comments: ReadonlyArray<ResearchTraceComment>;
}

export interface ResearchTrace {
  runCount: number;
  completedCount: number;
  failedCount: number;
  partialCount: number;
  hasBackfill: boolean;
  backfillSource: string | null;
  platformCounts: Record<string, number>;
  traceCompleteness: 'full' | 'partial' | 'none';
}

export function buildResearchTrace(input: ResearchTraceInput): ResearchTrace {
  const runs = input.runs;
  let completed = 0;
  let failed = 0;
  let partial = 0;
  let hasBackfill = false;
  let backfillSource: string | null = null;

  for (const r of runs) {
    if (r.status === 'completed') completed += 1;
    else if (r.status === 'failed') failed += 1;
    else if (r.status === 'partial_success') partial += 1;

    if (r.source === 'bookmarklet' || r.mode === 'raw_intake') {
      hasBackfill = true;
      if (!backfillSource) backfillSource = r.source;
    }
  }

  const platformCounts: Record<string, number> = {};
  for (const c of input.comments) {
    const p = c.platform || 'unknown';
    platformCounts[p] = (platformCounts[p] || 0) + 1;
  }

  let traceCompleteness: ResearchTrace['traceCompleteness'] = 'none';
  if (runs.length > 0) {
    if (failed === 0 && partial === 0) traceCompleteness = 'full';
    else traceCompleteness = 'partial';
  }

  return {
    runCount: runs.length,
    completedCount: completed,
    failedCount: failed,
    partialCount: partial,
    hasBackfill,
    backfillSource,
    platformCounts,
    traceCompleteness,
  };
}
