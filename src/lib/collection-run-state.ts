export interface CollectionRunState {
  status: string;
  current_stage: string;
  failure_code: string | null;
  latest_error: string | null;
  latest_hint: string | null;
  received_count: number;
  imported_count: number;
  duplicate_count: number;
  filtered_count: number;
  failed_count: number;
  heartbeat_at: string | null;
  started_at: string | null;
  finished_at: string | null;
}

export interface CreateQueuedRunInput {
  project_id: string | null;
  platform: string;
  source: string;
  mode: string;
  initiator: string;
  target_type: string;
  target_value: string | null;
  now: string;
}

export interface ImportOutcome {
  imported: number;
  duplicates: number;
  filtered: number;
  failed: number;
  now: string;
}

const IMPORT_ZERO_INSERTED_HINT = '检查去重、帖子归属和原始数据是否为空';

export interface CollectionRunEvent {
  stage: string;
  level: string;
  code: string;
  message: string;
  details_json: Record<string, unknown> | null;
  hint: string | null;
  created_at: string;
}

export interface CreateRunEventInput {
  stage: string;
  level: string;
  code: string;
  message: string;
  details_json?: Record<string, unknown> | null;
  hint?: string | null;
  now: string;
}

export function getFailureHint(code?: string | null): string | null {
  if (code === 'IMPORT_ZERO_INSERTED') {
    return IMPORT_ZERO_INSERTED_HINT;
  }

  return null;
}

export function createRunEvent(input: CreateRunEventInput): CollectionRunEvent {
  return {
    stage: input.stage,
    level: input.level,
    code: input.code,
    message: input.message,
    details_json: input.details_json ?? null,
    hint: input.hint ?? getFailureHint(input.code),
    created_at: input.now,
  };
}

export function createQueuedRun(input: CreateQueuedRunInput) {
  return {
    project_id: input.project_id,
    platform: input.platform,
    source: input.source,
    mode: input.mode,
    initiator: input.initiator,
    target_type: input.target_type,
    target_value: input.target_value,
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
  };
}

export function markRunRunning<T extends CollectionRunState>(
  run: T,
  input: { stage: string; now: string }
) {
  return {
    ...run,
    status: 'running',
    current_stage: input.stage,
    failure_code: null,
    latest_error: null,
    latest_hint: null,
    started_at: input.now,
    heartbeat_at: input.now,
    finished_at: null,
  };
}

export function finalizeImportRun(run: CollectionRunState, outcome: ImportOutcome): CollectionRunState {
  const next = {
    ...run,
    current_stage: 'finalize',
    imported_count: outcome.imported,
    duplicate_count: outcome.duplicates,
    filtered_count: outcome.filtered,
    failed_count: outcome.failed,
    heartbeat_at: outcome.now,
    finished_at: outcome.now,
  };

  if (outcome.imported === 0) {
    return {
      ...next,
      status: 'failed',
      failure_code: 'IMPORT_ZERO_INSERTED',
      latest_error: 'Import completed without inserted rows',
      latest_hint: getFailureHint('IMPORT_ZERO_INSERTED'),
    };
  }

  if (outcome.failed > 0) {
    return {
      ...next,
      status: 'partial_success',
      failure_code: null,
      latest_error: null,
      latest_hint: null,
    };
  }

  return {
    ...next,
    status: 'completed',
    failure_code: null,
    latest_error: null,
    latest_hint: null,
  };
}
