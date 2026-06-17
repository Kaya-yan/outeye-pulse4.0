export function buildCancelRunArtifacts(input: {
  run: Record<string, unknown>;
  reason: string;
  now: string;
}) {
  return {
    runUpdate: {
      ...input.run,
      status: 'cancelled',
      current_stage: 'finalize',
      failure_code: null,
      latest_error: input.reason,
      latest_hint: null,
      heartbeat_at: input.now,
      finished_at: input.now,
    },
    event: {
      stage: 'finalize',
      level: 'warning',
      code: 'RUN_CANCELLED',
      message: 'Run cancelled by operator',
      details_json: { reason: input.reason },
      hint: null,
      created_at: input.now,
    },
  };
}
