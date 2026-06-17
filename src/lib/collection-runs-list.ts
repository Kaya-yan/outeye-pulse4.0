export interface CollectionRunListRow {
  id: string;
  [key: string]: unknown;
}

export interface CollectionRunEventRow {
  collection_run_id: string;
  created_at: string;
  stage?: string;
  [key: string]: unknown;
}

const STAGE_RANK: Record<string, number> = {
  init: 1,
  queue: 2,
  claim: 3,
  crawl: 4,
  receive: 5,
  import: 6,
  finalize: 7,
};

export function mergeRunsWithLatestEvents(
  runs: CollectionRunListRow[],
  events: CollectionRunEventRow[]
) {
  const latestByRunId = new Map<string, CollectionRunEventRow>();

  for (const event of events) {
    const existing = latestByRunId.get(event.collection_run_id);
    const eventRank = STAGE_RANK[event.stage || ''] || 0;
    const existingRank = STAGE_RANK[existing?.stage || ''] || 0;
    if (
      !existing ||
      existing.created_at < event.created_at ||
      (existing.created_at === event.created_at && existingRank <= eventRank)
    ) {
      latestByRunId.set(event.collection_run_id, event);
    }
  }

  return runs.map(run => ({
    ...run,
    latest_event: latestByRunId.get(run.id) ?? null,
  }));
}
