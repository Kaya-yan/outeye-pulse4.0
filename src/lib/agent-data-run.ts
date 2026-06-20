export interface AgentImportLifecycleInput {
  run: Record<string, unknown>;
  received: number;
  imported: number;
  duplicates: number;
  filtered: number;
  failed: number;
  now: string;
}

const IMPORT_ZERO_INSERTED_HINT = '检查去重、帖子归属和原始数据是否为空';
const ANALYSIS_TRIGGER_FAILED_HINT = '检查 /api/analysis 接口和项目配置';

export function resolveImportProjectId(requestProjectId?: string | null, runProjectId?: string | null) {
  return requestProjectId || runProjectId || null;
}

export function createAnalysisTriggerEvent(input: {
  projectId: string;
  imported: number;
  ok: boolean;
  now: string;
  errorMessage?: string;
}) {
  if (input.ok) {
    return {
      stage: 'finalize',
      level: 'info',
      code: 'ANALYSIS_TRIGGERED',
      message: 'Triggered downstream analysis for imported comments',
      details_json: { project_id: input.projectId, imported: input.imported },
      hint: null,
      created_at: input.now,
    };
  }

  return {
    stage: 'finalize',
    level: 'error',
    code: 'ANALYSIS_TRIGGER_FAILED',
    message: input.errorMessage || 'Failed to trigger downstream analysis',
    details_json: { project_id: input.projectId, imported: input.imported },
    hint: ANALYSIS_TRIGGER_FAILED_HINT,
    created_at: input.now,
  };
}

export function buildAgentImportLifecycleArtifacts(input: AgentImportLifecycleInput) {
  const events = [
    {
      stage: 'receive',
      level: 'info',
      code: 'RAW_RECEIVED',
      message: 'Agent payload received',
      details_json: { received: input.received },
      hint: null,
      created_at: input.now,
    },
    {
      stage: 'import',
      level: 'info',
      code: 'IMPORT_STARTED',
      message: 'Import started for agent payload',
      details_json: { received: input.received },
      hint: null,
      created_at: input.now,
    },
    {
      stage: 'finalize',
      level: 'info',
      code: 'IMPORT_COMPLETED',
      message: 'Import completed for agent payload',
      details_json: {
        imported: input.imported,
        duplicates: input.duplicates,
        filtered: input.filtered,
        failed: input.failed,
      },
      hint: null,
      created_at: input.now,
    },
  ];

  const runUpdate = {
    ...input.run,
    status: input.imported === 0 ? 'failed' : 'completed',
    current_stage: 'finalize',
    failure_code: input.imported === 0 ? 'IMPORT_ZERO_INSERTED' : null,
    latest_error: input.imported === 0 ? 'Import completed without inserted rows' : null,
    latest_hint: input.imported === 0 ? IMPORT_ZERO_INSERTED_HINT : null,
    received_count: input.received,
    imported_count: input.imported,
    duplicate_count: input.duplicates,
    filtered_count: input.filtered,
    failed_count: input.failed,
    heartbeat_at: input.now,
    finished_at: input.now,
  };

  return { events, runUpdate };
}
