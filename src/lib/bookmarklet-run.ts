export interface CreateBookmarkletRunInput {
  project_id: string | null;
  platform: 'bilibili' | 'xhs';
  now: string;
}

export function attachCollectionRunIdToRawRows(rows: Record<string, unknown>[], collectionRunId?: string | null) {
  if (!collectionRunId) return rows;
  return rows.map(row => ({ ...row, collection_run_id: collectionRunId }));
}

export function createBookmarkletRunArtifacts(input: CreateBookmarkletRunInput) {
  return {
    run: {
      project_id: input.project_id,
      platform: input.platform,
      source: 'bookmarklet',
      mode: 'raw_intake',
      initiator: 'ui',
      target_type: 'mixed',
      target_value: null,
      status: 'awaiting_input',
      current_stage: 'init',
      failure_code: null,
      latest_error: null,
      latest_hint: null,
      received_count: 0,
      imported_count: 0,
      duplicate_count: 0,
      filtered_count: 0,
      failed_count: 0,
      heartbeat_at: null,
      started_at: null,
      finished_at: null,
      created_at: input.now,
      updated_at: input.now,
    },
    event: {
      stage: 'init',
      level: 'info',
      code: 'RUN_CREATED',
      message: 'Bookmarklet collection run created',
      details_json: { platform: input.platform },
      hint: null,
      created_at: input.now,
    },
  };
}

export function buildBookmarkletLinkLifecycleArtifacts(input: {
  run: Record<string, unknown>;
  imported: number;
  duplicates: number;
  failed: number;
  now: string;
}) {
  return {
    events: [
      {
        stage: 'import',
        level: 'info',
        code: 'IMPORT_STARTED',
        message: 'Started linking bookmarklet raw comments',
        details_json: { received: input.run.received_count || 0 },
        hint: null,
        created_at: input.now,
      },
      {
        stage: 'finalize',
        level: 'info',
        code: 'IMPORT_COMPLETED',
        message: 'Completed linking bookmarklet raw comments',
        details_json: {
          imported: input.imported,
          duplicates: input.duplicates,
          failed: input.failed,
        },
        hint: null,
        created_at: input.now,
      },
    ],
    runUpdate: {
      ...input.run,
      status: input.imported === 0 ? 'failed' : 'completed',
      current_stage: 'finalize',
      failure_code: input.imported === 0 ? 'IMPORT_ZERO_INSERTED' : null,
      latest_error: input.imported === 0 ? 'Link completed without inserted rows' : null,
      latest_hint: input.imported === 0 ? '检查去重、帖子归属和原始数据是否为空' : null,
      imported_count: input.imported,
      duplicate_count: input.duplicates,
      failed_count: input.failed,
      heartbeat_at: input.now,
      finished_at: input.now,
    },
  };
}
