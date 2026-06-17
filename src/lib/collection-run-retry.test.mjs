import test from 'node:test';
import assert from 'node:assert/strict';
import { buildRetryRunArtifacts } from './collection-run-retry.ts';

test('clones a failed agent run into a fresh queued run and emits RUN_RETRIED', () => {
  const run = {
    id: 'run-old',
    project_id: 'project-1',
    platform: 'bilibili',
    source: 'agent',
    mode: 'direct_url',
    initiator: 'ui',
    target_type: 'url',
    target_value: 'https://www.bilibili.com/video/BV1234567890',
    status: 'failed',
    current_stage: 'finalize',
    failure_code: 'IMPORT_ZERO_INSERTED',
    latest_error: 'Import completed without inserted rows',
    latest_hint: '检查去重、帖子归属和原始数据是否为空',
    received_count: 12,
    imported_count: 0,
    duplicate_count: 7,
    filtered_count: 3,
    failed_count: 2,
    heartbeat_at: '2026-06-17T18:00:00.000Z',
    started_at: '2026-06-17T17:50:00.000Z',
    finished_at: '2026-06-17T18:00:00.000Z',
  };

  const artifacts = buildRetryRunArtifacts({
    run,
    now: '2026-06-17T18:10:00.000Z',
  });

  assert.deepEqual(artifacts.run, {
    project_id: 'project-1',
    platform: 'bilibili',
    source: 'agent',
    mode: 'direct_url',
    initiator: 'ui',
    target_type: 'url',
    target_value: 'https://www.bilibili.com/video/BV1234567890',
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
    created_at: '2026-06-17T18:10:00.000Z',
    updated_at: '2026-06-17T18:10:00.000Z',
  });

  assert.deepEqual(artifacts.event, {
    stage: 'queue',
    level: 'info',
    code: 'RUN_RETRIED',
    message: 'Retry created from previous run',
    details_json: { previous_run_id: 'run-old' },
    hint: null,
    created_at: '2026-06-17T18:10:00.000Z',
  });
});

test('clones a bookmarklet run into a fresh awaiting_input run', () => {
  const run = {
    id: 'run-bookmarklet',
    project_id: 'project-1',
    platform: 'bilibili',
    source: 'bookmarklet',
    mode: 'raw_intake',
    initiator: 'ui',
    target_type: 'mixed',
    target_value: null,
    status: 'cancelled',
    current_stage: 'finalize',
    failure_code: null,
    latest_error: 'cancelled from P0 run panel',
    latest_hint: null,
    received_count: 0,
    imported_count: 0,
    duplicate_count: 0,
    filtered_count: 0,
    failed_count: 0,
    heartbeat_at: '2026-06-17T18:00:00.000Z',
    started_at: null,
    finished_at: '2026-06-17T18:00:00.000Z',
  };

  const artifacts = buildRetryRunArtifacts({
    run,
    now: '2026-06-17T18:15:00.000Z',
  });

  assert.equal(artifacts.run.status, 'awaiting_input');
  assert.equal(artifacts.run.current_stage, 'init');
  assert.equal(artifacts.run.source, 'bookmarklet');
  assert.equal(artifacts.run.mode, 'raw_intake');
  assert.equal(artifacts.event.stage, 'init');
});
