export function attachCollectionRunIdToClaimedTask<T extends Record<string, unknown>>(
  task: T,
  collectionRunId: string | null
) {
  return {
    ...task,
    collection_run_id: collectionRunId,
  };
}
