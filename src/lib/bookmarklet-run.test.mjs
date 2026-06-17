import test from 'node:test';
import assert from 'node:assert/strict';
import { attachCollectionRunIdToRawRows, buildBookmarkletLinkLifecycleArtifacts, createBookmarkletRunArtifacts } from './bookmarklet-run.ts';

test('creates an awaiting_input run for bookmarklet collection', () => {
  const artifacts = createBookmarkletRunArtifacts({
    project_id: 'project-1',
    platform: 'bilibili',
    now: '2026-06-17T16:00:00.000Z',
  });

  assert.deepEqual(artifacts.run, {
    project_id: 'project-1',
    platform: 'bilibili',
    source: 'bookmarklet',
    mode: 'raw_intake',
    initiator: 'ui',
    target_type: 'mixed',
    target_value: null,
    status: 'awaiting_input',
    current_stage: 'init',
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
    created_at: '2026-06-17T16:00:00.000Z',
    updated_at: '2026-06-17T16:00:00.000Z',
  });

  assert.deepEqual(artifacts.event, {
    stage: 'init',
    level: 'info',
    code: 'RUN_CREATED',
    message: 'Bookmarklet collection run created',
    details_json: { platform: 'bilibili' },
    hint: null,
    created_at: '2026-06-17T16:00:00.000Z',
  });
});

test('attaches collection_run_id to bookmarklet raw rows when provided', () => {
  const rows = attachCollectionRunIdToRawRows([
    { platform: 'bilibili', source_id: 'BV123', text: '评论1', likes: 3 },
    { platform: 'bilibili', source_id: 'BV123', text: '评论2', likes: 1 },
  ], 'run-1');

  assert.deepEqual(rows, [
    { platform: 'bilibili', source_id: 'BV123', text: '评论1', likes: 3, collection_run_id: 'run-1' },
    { platform: 'bilibili', source_id: 'BV123', text: '评论2', likes: 1, collection_run_id: 'run-1' },
  ]);
});

test('builds import events and completed run summary when bookmarklet rows are linked', () => {
  const run = {
    project_id: 'project-1',
    platform: 'bilibili',
    source: 'bookmarklet',
    mode: 'raw_intake',
    initiator: 'ui',
    target_type: 'mixed',
    target_value: null,
    status: 'awaiting_input',
    current_stage: 'receive',
    failure_code: null,
    latest_error: null,
    latest_hint: null,
    received_count: 12,
    imported_count: 0,
    duplicate_count: 0,
    filtered_count: 0,
    failed_count: 0,
    heartbeat_at: '2026-06-17T16:05:00.000Z',
    started_at: null,
    finished_at: null,
  };

  const artifacts = buildBookmarkletLinkLifecycleArtifacts({
    run,
    imported: 9,
    duplicates: 3,
    failed: 0,
    now: '2026-06-17T16:10:00.000Z',
  });

  assert.deepEqual(artifacts.events, [
    {
      stage: 'import',
      level: 'info',
      code: 'IMPORT_STARTED',
      message: 'Started linking bookmarklet raw comments',
      details_json: { received: 12 },
      hint: null,
      created_at: '2026-06-17T16:10:00.000Z',
    },
    {
      stage: 'finalize',
      level: 'info',
      code: 'IMPORT_COMPLETED',
      message: 'Completed linking bookmarklet raw comments',
      details_json: { imported: 9, duplicates: 3, failed: 0 },
      hint: null,
      created_at: '2026-06-17T16:10:00.000Z',
    },
  ]);

  assert.deepEqual(artifacts.runUpdate, {
    project_id: 'project-1',
    platform: 'bilibili',
    source: 'bookmarklet',
    mode: 'raw_intake',
    initiator: 'ui',
    target_type: 'mixed',
    target_value: null,
    status: 'completed',
    current_stage: 'finalize',
    failure_code: null,
    latest_error: null,
    latest_hint: null,
    received_count: 12,
    imported_count: 9,
    duplicate_count: 3,
    filtered_count: 0,
    failed_count: 0,
    heartbeat_at: '2026-06-17T16:10:00.000Z',
    started_at: null,
    finished_at: '2026-06-17T16:10:00.000Z',
  });
});
