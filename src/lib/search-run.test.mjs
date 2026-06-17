import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSearchRunArtifacts, buildSearchRunCompletionArtifacts } from './search-run.ts';

test('creates a queued keyword search run with a TASK_ENQUEUED-style event', () => {
  const artifacts = buildSearchRunArtifacts({
    project_id: 'project-1',
    platform: 'xhs',
    keyword: '郭永怀',
    now: '2026-06-17T17:00:00.000Z',
  });

  assert.deepEqual(artifacts.run, {
    project_id: 'project-1',
    platform: 'xhs',
    source: 'search',
    mode: 'keyword_search',
    initiator: 'ui',
    target_type: 'keyword',
    target_value: '郭永怀',
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
    created_at: '2026-06-17T17:00:00.000Z',
    updated_at: '2026-06-17T17:00:00.000Z',
  });

  assert.deepEqual(artifacts.event, {
    stage: 'queue',
    level: 'info',
    code: 'TASK_ENQUEUED',
    message: 'Keyword search queued',
    details_json: { keyword: '郭永怀', platform: 'xhs' },
    hint: null,
    created_at: '2026-06-17T17:00:00.000Z',
  });
});

test('marks search run completed with discovered result counts', () => {
  const run = {
    project_id: 'project-1',
    platform: 'xhs',
    source: 'search',
    mode: 'keyword_search',
    initiator: 'ui',
    target_type: 'keyword',
    target_value: '郭永怀',
    status: 'running',
    current_stage: 'crawl',
    failure_code: null,
    latest_error: null,
    latest_hint: null,
    received_count: 0,
    imported_count: 0,
    duplicate_count: 0,
    filtered_count: 0,
    failed_count: 0,
    heartbeat_at: '2026-06-17T17:00:00.000Z',
    started_at: '2026-06-17T17:00:00.000Z',
    finished_at: null,
  };

  const artifacts = buildSearchRunCompletionArtifacts({
    run,
    result_count: 20,
    total_comments: 300,
    total_likes: 900,
    now: '2026-06-17T17:05:00.000Z',
  });

  assert.deepEqual(artifacts.event, {
    stage: 'finalize',
    level: 'info',
    code: 'IMPORT_COMPLETED',
    message: 'Keyword search completed',
    details_json: { result_count: 20, total_comments: 300, total_likes: 900 },
    hint: null,
    created_at: '2026-06-17T17:05:00.000Z',
  });

  assert.deepEqual(artifacts.runUpdate, {
    project_id: 'project-1',
    platform: 'xhs',
    source: 'search',
    mode: 'keyword_search',
    initiator: 'ui',
    target_type: 'keyword',
    target_value: '郭永怀',
    status: 'completed',
    current_stage: 'finalize',
    failure_code: null,
    latest_error: null,
    latest_hint: null,
    received_count: 20,
    imported_count: 0,
    duplicate_count: 0,
    filtered_count: 0,
    failed_count: 0,
    heartbeat_at: '2026-06-17T17:05:00.000Z',
    started_at: '2026-06-17T17:00:00.000Z',
    finished_at: '2026-06-17T17:05:00.000Z',
  });
});
