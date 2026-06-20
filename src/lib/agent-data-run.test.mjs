import test from 'node:test';
import assert from 'node:assert/strict';
import { buildAgentImportLifecycleArtifacts, createAnalysisTriggerEvent, resolveImportProjectId } from './agent-data-run.ts';

test('builds receive/import/finalize events and completed run summary for agent import', () => {
  const run = {
    project_id: 'project-1',
    platform: 'bilibili',
    source: 'agent',
    mode: 'direct_url',
    initiator: 'ui',
    target_type: 'url',
    target_value: 'https://www.bilibili.com/video/BV1234567890',
    status: 'running',
    current_stage: 'claim',
    failure_code: null,
    latest_error: null,
    latest_hint: null,
    received_count: 0,
    imported_count: 0,
    duplicate_count: 0,
    filtered_count: 0,
    failed_count: 0,
    heartbeat_at: '2026-06-17T14:20:00.000Z',
    started_at: '2026-06-17T14:10:00.000Z',
    finished_at: null,
  };

  const artifacts = buildAgentImportLifecycleArtifacts({
    run,
    received: 12,
    imported: 9,
    duplicates: 1,
    filtered: 2,
    failed: 0,
    now: '2026-06-17T14:30:00.000Z',
  });

  assert.deepEqual(artifacts.events, [
    {
      stage: 'receive',
      level: 'info',
      code: 'RAW_RECEIVED',
      message: 'Agent payload received',
      details_json: { received: 12 },
      hint: null,
      created_at: '2026-06-17T14:30:00.000Z',
    },
    {
      stage: 'import',
      level: 'info',
      code: 'IMPORT_STARTED',
      message: 'Import started for agent payload',
      details_json: { received: 12 },
      hint: null,
      created_at: '2026-06-17T14:30:00.000Z',
    },
    {
      stage: 'finalize',
      level: 'info',
      code: 'IMPORT_COMPLETED',
      message: 'Import completed for agent payload',
      details_json: { imported: 9, duplicates: 1, filtered: 2, failed: 0 },
      hint: null,
      created_at: '2026-06-17T14:30:00.000Z',
    },
  ]);

  assert.deepEqual(artifacts.runUpdate, {
    project_id: 'project-1',
    platform: 'bilibili',
    source: 'agent',
    mode: 'direct_url',
    initiator: 'ui',
    target_type: 'url',
    target_value: 'https://www.bilibili.com/video/BV1234567890',
    status: 'completed',
    current_stage: 'finalize',
    failure_code: null,
    latest_error: null,
    latest_hint: null,
    received_count: 12,
    imported_count: 9,
    duplicate_count: 1,
    filtered_count: 2,
    failed_count: 0,
    heartbeat_at: '2026-06-17T14:30:00.000Z',
    started_at: '2026-06-17T14:10:00.000Z',
    finished_at: '2026-06-17T14:30:00.000Z',
  });
});

test('marks run failed but still emits the full lifecycle when agent import inserts zero rows', () => {
  const run = {
    project_id: 'project-1',
    platform: 'bilibili',
    source: 'agent',
    mode: 'direct_url',
    initiator: 'ui',
    target_type: 'url',
    target_value: 'https://www.bilibili.com/video/BV1234567890',
    status: 'running',
    current_stage: 'claim',
    failure_code: null,
    latest_error: null,
    latest_hint: null,
    received_count: 0,
    imported_count: 0,
    duplicate_count: 0,
    filtered_count: 0,
    failed_count: 0,
    heartbeat_at: '2026-06-17T14:20:00.000Z',
    started_at: '2026-06-17T14:10:00.000Z',
    finished_at: null,
  };

  const artifacts = buildAgentImportLifecycleArtifacts({
    run,
    received: 12,
    imported: 0,
    duplicates: 7,
    filtered: 3,
    failed: 2,
    now: '2026-06-17T14:35:00.000Z',
  });

  assert.equal(artifacts.events.length, 3);
  assert.equal(artifacts.events[0].code, 'RAW_RECEIVED');
  assert.equal(artifacts.events[1].code, 'IMPORT_STARTED');
  assert.equal(artifacts.events[2].code, 'IMPORT_COMPLETED');
  assert.equal(artifacts.runUpdate.status, 'failed');
  assert.equal(artifacts.runUpdate.failure_code, 'IMPORT_ZERO_INSERTED');
  assert.match(artifacts.runUpdate.latest_hint ?? '', /去重|帖子|原始数据/);
  assert.equal(artifacts.runUpdate.received_count, 12);
  assert.equal(artifacts.runUpdate.imported_count, 0);
  assert.equal(artifacts.runUpdate.duplicate_count, 7);
  assert.equal(artifacts.runUpdate.filtered_count, 3);
  assert.equal(artifacts.runUpdate.failed_count, 2);
});

test('creates ANALYSIS_TRIGGERED event when downstream analysis starts successfully', () => {
  const event = createAnalysisTriggerEvent({
    projectId: 'project-1',
    imported: 9,
    ok: true,
    now: '2026-06-17T14:40:00.000Z',
  });

  assert.deepEqual(event, {
    stage: 'finalize',
    level: 'info',
    code: 'ANALYSIS_TRIGGERED',
    message: 'Triggered downstream analysis for imported comments',
    details_json: { project_id: 'project-1', imported: 9 },
    hint: null,
    created_at: '2026-06-17T14:40:00.000Z',
  });
});

test('creates ANALYSIS_TRIGGER_FAILED event when downstream analysis call fails', () => {
  const event = createAnalysisTriggerEvent({
    projectId: 'project-1',
    imported: 9,
    ok: false,
    errorMessage: 'analysis API returned 500',
    now: '2026-06-17T14:41:00.000Z',
  });

  assert.deepEqual(event, {
    stage: 'finalize',
    level: 'error',
    code: 'ANALYSIS_TRIGGER_FAILED',
    message: 'analysis API returned 500',
    details_json: { project_id: 'project-1', imported: 9 },
    hint: '检查 /api/analysis 接口和项目配置',
    created_at: '2026-06-17T14:41:00.000Z',
  });
});

test('falls back to the run project id when agent callback does not send project_id', () => {
  assert.equal(resolveImportProjectId(undefined, 'project-from-run'), 'project-from-run');
  assert.equal(resolveImportProjectId('project-from-body', 'project-from-run'), 'project-from-body');
  assert.equal(resolveImportProjectId(undefined, null), null);
});
