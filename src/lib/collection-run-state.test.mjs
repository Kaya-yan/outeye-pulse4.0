import test from 'node:test';
import assert from 'node:assert/strict';
import { createQueuedRun, createRunEvent, finalizeImportRun, getFailureHint, markRunRunning } from './collection-run-state.ts';

test('marks run failed with IMPORT_ZERO_INSERTED when import completes without inserted rows', () => {
  const now = '2026-06-17T10:00:00.000Z';
  const run = {
    status: 'importing',
    current_stage: 'import',
    failure_code: null,
    latest_error: null,
    latest_hint: null,
    received_count: 12,
    imported_count: 0,
    duplicate_count: 0,
    filtered_count: 0,
    failed_count: 0,
    heartbeat_at: null,
    started_at: '2026-06-17T09:50:00.000Z',
    finished_at: null,
  };

  const updated = finalizeImportRun(run, {
    imported: 0,
    duplicates: 7,
    filtered: 3,
    failed: 2,
    now,
  });

  assert.equal(updated.status, 'failed');
  assert.equal(updated.current_stage, 'finalize');
  assert.equal(updated.failure_code, 'IMPORT_ZERO_INSERTED');
  assert.equal(updated.imported_count, 0);
  assert.equal(updated.duplicate_count, 7);
  assert.equal(updated.filtered_count, 3);
  assert.equal(updated.failed_count, 2);
  assert.equal(updated.heartbeat_at, now);
  assert.equal(updated.finished_at, now);
  assert.match(updated.latest_hint ?? '', /去重|帖子|原始数据/);
});

test('marks run partial_success when import completes with inserted and failed rows', () => {
  const now = '2026-06-17T11:00:00.000Z';
  const run = {
    status: 'importing',
    current_stage: 'import',
    failure_code: 'OLD_ERROR',
    latest_error: 'old error',
    latest_hint: 'old hint',
    received_count: 20,
    imported_count: 0,
    duplicate_count: 0,
    filtered_count: 0,
    failed_count: 0,
    heartbeat_at: null,
    started_at: '2026-06-17T10:30:00.000Z',
    finished_at: null,
  };

  const updated = finalizeImportRun(run, {
    imported: 9,
    duplicates: 4,
    filtered: 2,
    failed: 5,
    now,
  });

  assert.equal(updated.status, 'partial_success');
  assert.equal(updated.current_stage, 'finalize');
  assert.equal(updated.failure_code, null);
  assert.equal(updated.latest_error, null);
  assert.equal(updated.latest_hint, null);
  assert.equal(updated.imported_count, 9);
  assert.equal(updated.duplicate_count, 4);
  assert.equal(updated.filtered_count, 2);
  assert.equal(updated.failed_count, 5);
  assert.equal(updated.heartbeat_at, now);
  assert.equal(updated.finished_at, now);
});

test('marks run completed when import completes with inserted rows and no failures', () => {
  const now = '2026-06-17T12:00:00.000Z';
  const run = {
    status: 'importing',
    current_stage: 'import',
    failure_code: 'OLD_ERROR',
    latest_error: 'old error',
    latest_hint: 'old hint',
    received_count: 15,
    imported_count: 0,
    duplicate_count: 0,
    filtered_count: 0,
    failed_count: 0,
    heartbeat_at: null,
    started_at: '2026-06-17T11:45:00.000Z',
    finished_at: null,
  };

  const updated = finalizeImportRun(run, {
    imported: 11,
    duplicates: 2,
    filtered: 1,
    failed: 0,
    now,
  });

  assert.equal(updated.status, 'completed');
  assert.equal(updated.current_stage, 'finalize');
  assert.equal(updated.failure_code, null);
  assert.equal(updated.latest_error, null);
  assert.equal(updated.latest_hint, null);
  assert.equal(updated.imported_count, 11);
  assert.equal(updated.duplicate_count, 2);
  assert.equal(updated.filtered_count, 1);
  assert.equal(updated.failed_count, 0);
  assert.equal(updated.heartbeat_at, now);
  assert.equal(updated.finished_at, now);
});

test('returns a stable hint for IMPORT_ZERO_INSERTED', () => {
  assert.match(getFailureHint('IMPORT_ZERO_INSERTED') ?? '', /去重|帖子|原始数据/);
});

test('creates an error run event and infers hint from failure code', () => {
  const event = createRunEvent({
    stage: 'import',
    level: 'error',
    code: 'IMPORT_ZERO_INSERTED',
    message: 'Import completed without inserted rows',
    details_json: { imported: 0, duplicates: 7 },
    now: '2026-06-17T12:30:00.000Z',
  });

  assert.deepEqual(event, {
    stage: 'import',
    level: 'error',
    code: 'IMPORT_ZERO_INSERTED',
    message: 'Import completed without inserted rows',
    details_json: { imported: 0, duplicates: 7 },
    hint: '检查去重、帖子归属和原始数据是否为空',
    created_at: '2026-06-17T12:30:00.000Z',
  });
});

test('creates a queued run with zeroed counters and queue stage', () => {
  const run = createQueuedRun({
    project_id: 'project-1',
    platform: 'bilibili',
    source: 'agent',
    mode: 'direct_url',
    initiator: 'ui',
    target_type: 'url',
    target_value: 'https://www.bilibili.com/video/BV1234567890',
    now: '2026-06-17T13:00:00.000Z',
  });

  assert.deepEqual(run, {
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
    created_at: '2026-06-17T13:00:00.000Z',
    updated_at: '2026-06-17T13:00:00.000Z',
  });
});

test('marks a queued run as running at claim stage and starts heartbeat', () => {
  const run = createQueuedRun({
    project_id: 'project-1',
    platform: 'bilibili',
    source: 'agent',
    mode: 'direct_url',
    initiator: 'ui',
    target_type: 'url',
    target_value: 'https://www.bilibili.com/video/BV1234567890',
    now: '2026-06-17T13:00:00.000Z',
  });

  const updated = markRunRunning(run, {
    stage: 'claim',
    now: '2026-06-17T13:05:00.000Z',
  });

  assert.equal(updated.status, 'running');
  assert.equal(updated.current_stage, 'claim');
  assert.equal(updated.started_at, '2026-06-17T13:05:00.000Z');
  assert.equal(updated.heartbeat_at, '2026-06-17T13:05:00.000Z');
  assert.equal(updated.finished_at, null);
  assert.equal(updated.failure_code, null);
  assert.equal(updated.latest_error, null);
  assert.equal(updated.latest_hint, null);
});
