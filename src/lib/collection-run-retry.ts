export function buildRetryRunArtifacts(input: {
  run: Record<string, unknown>;
  now: string;
}) {
  const isBookmarklet = input.run.source === 'bookmarklet' && input.run.mode === 'raw_intake';
  const status = isBookmarklet ? 'awaiting_input' : 'queued';
  const currentStage = isBookmarklet ? 'init' : 'queue';

  return {
    run: {
      project_id: input.run.project_id,
      platform: input.run.platform,
      source: input.run.source,
      mode: input.run.mode,
      initiator: input.run.initiator,
      target_type: input.run.target_type,
      target_value: input.run.target_value,
      status,
      current_stage: currentStage,
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
      stage: currentStage,
      level: 'info',
      code: 'RUN_RETRIED',
      message: 'Retry created from previous run',
      details_json: { previous_run_id: input.run.id },
      hint: null,
      created_at: input.now,
    },
  };
}
