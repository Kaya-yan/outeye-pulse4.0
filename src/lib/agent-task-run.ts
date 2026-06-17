export interface AgentTaskCreationInput {
  project_id: string | null;
  platform: 'bilibili' | 'xhs';
  target_url: string;
  task_type: string;
  max_comments: number;
  config_json: Record<string, unknown>;
  priority: number;
  scheduled_at: string | null;
  now: string;
}

export function buildAgentTaskCreationArtifacts(input: AgentTaskCreationInput) {
  const run = {
    project_id: input.project_id,
    platform: input.platform,
    source: 'agent',
    mode: 'direct_url',
    initiator: 'ui',
    target_type: 'url',
    target_value: input.target_url,
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

  const event = {
    stage: 'queue',
    level: 'info',
    code: 'TASK_ENQUEUED',
    message: 'Agent task created and queued',
    details_json: {
      task_type: input.task_type,
      max_comments: input.max_comments,
      priority: input.priority,
    },
    hint: null,
    created_at: input.now,
  };

  const taskPayload = {
    platform: input.platform,
    target_url: input.target_url,
    task_type: input.task_type,
    max_comments: input.max_comments,
    config_json: input.config_json,
    priority: input.priority,
    scheduled_at: input.scheduled_at || input.now,
  };

  return { run, event, taskPayload };
}
