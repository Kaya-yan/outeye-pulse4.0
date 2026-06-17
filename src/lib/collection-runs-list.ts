export interface CollectionRunListRow {
  id: string;
  [key: string]: unknown;
}

export interface CollectionRunEventRow {
  collection_run_id: string;
  created_at: string;
  [key: string]: unknown;
}

export function mergeRunsWithLatestEvents(
  runs: CollectionRunListRow[],
  events: CollectionRunEventRow[]
) {
  const latestByRunId = new Map<string, CollectionRunEventRow>();

  for (const event of events) {
    const existing = latestByRunId.get(event.collection_run_id);
    if (!existing || existing.created_at < event.created_at) {
      latestByRunId.set(event.collection_run_id, event);
    }
  }

  return runs.map(run => ({
    ...run,
    latest_event: latestByRunId.get(run.id) ?? null,
  }));
}
