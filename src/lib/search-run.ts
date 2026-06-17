export interface CreateSearchRunInput {
  project_id: string | null;
  platform: 'xhs' | 'bilibili';
  keyword: string;
  now: string;
}

export interface CompleteSearchRunInput {
  run: Record<string, unknown>;
  result_count: number;
  total_comments: number;
  total_likes: number;
  now: string;
}

export function buildSearchRunArtifacts(input: CreateSearchRunInput) {
  return {
    run: {
      project_id: input.project_id,
      platform: input.platform,
      source: 'search',
      mode: 'keyword_search',
      initiator: 'ui',
      target_type: 'keyword',
      target_value: input.keyword,
      status: 'queued',
      current_stage: 'queue',
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
      stage: 'queue',
      level: 'info',
      code: 'TASK_ENQUEUED',
      message: 'Keyword search queued',
      details_json: { keyword: input.keyword, platform: input.platform },
      hint: null,
      created_at: input.now,
    },
  };
}

export function buildSearchRunCompletionArtifacts(input: CompleteSearchRunInput) {
  return {
    event: {
      stage: 'finalize',
      level: 'info',
      code: 'IMPORT_COMPLETED',
      message: 'Keyword search completed',
      details_json: {
        result_count: input.result_count,
        total_comments: input.total_comments,
        total_likes: input.total_likes,
      },
      hint: null,
      created_at: input.now,
    },
    runUpdate: {
      ...input.run,
      status: 'completed',
      current_stage: 'finalize',
      failure_code: null,
      latest_error: null,
      latest_hint: null,
      received_count: input.result_count,
      imported_count: 0,
      duplicate_count: 0,
      filtered_count: 0,
      failed_count: 0,
      heartbeat_at: input.now,
      finished_at: input.now,
    },
  };
}
