import test from 'node:test';
import assert from 'node:assert/strict';
import { buildCancelRunArtifacts } from './collection-run-cancel.ts';

test('marks a non-terminal run as cancelled and emits RUN_CANCELLED', () => {
  const run = {
    project_id: 'project-1',
    platform: 'bilibili',
    source: 'agent',
    mode: 'direct_url',
    initiator: 'ui',
    target_type: 'url',
    target_value: 'https://www.bilibili.com/video/BV1234567890',
    status: 'running',
    current_stage: 'crawl',
    failure_code: null,
    latest_error: null,
    latest_hint: null,
    received_count: 12,
    imported_count: 0,
    duplicate_count: 0,
    filtered_count: 0,
    failed_count: 0,
    heartbeat_at: '2026-06-17T18:00:00.000Z',
    started_at: '2026-06-17T17:50:00.000Z',
    finished_at: null,
  };

  const artifacts = buildCancelRunArtifacts({
    run,
    reason: 'user requested cancellation',
    now: '2026-06-17T18:05:00.000Z',
  });

  assert.deepEqual(artifacts.runUpdate, {
    project_id: 'project-1',
    platform: 'bilibili',
    source: 'agent',
    mode: 'direct_url',
    initiator: 'ui',
    target_type: 'url',
    target_value: 'https://www.bilibili.com/video/BV1234567890',
    status: 'cancelled',
    current_stage: 'finalize',
    failure_code: null,
    latest_error: 'user requested cancellation',
    latest_hint: null,
    received_count: 12,
    imported_count: 0,
    duplicate_count: 0,
    filtered_count: 0,
    failed_count: 0,
    heartbeat_at: '2026-06-17T18:05:00.000Z',
    started_at: '2026-06-17T17:50:00.000Z',
    finished_at: '2026-06-17T18:05:00.000Z',
  });

  assert.deepEqual(artifacts.event, {
    stage: 'finalize',
    level: 'warning',
    code: 'RUN_CANCELLED',
    message: 'Run cancelled by operator',
    details_json: { reason: 'user requested cancellation' },
    hint: null,
    created_at: '2026-06-17T18:05:00.000Z',
  });
});
