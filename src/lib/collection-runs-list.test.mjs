import test from 'node:test';
import assert from 'node:assert/strict';
import { mergeRunsWithLatestEvents } from './collection-runs-list.ts';

test('merges runs with the latest event for each run', () => {
  const runs = [
    { id: 'run-1', status: 'running', current_stage: 'claim', created_at: '2026-06-17T15:00:00.000Z' },
    { id: 'run-2', status: 'completed', current_stage: 'finalize', created_at: '2026-06-17T14:00:00.000Z' },
  ];

  const events = [
    { collection_run_id: 'run-1', code: 'TASK_ENQUEUED', message: 'queued', created_at: '2026-06-17T15:00:00.000Z' },
    { collection_run_id: 'run-1', code: 'TASK_CLAIMED', message: 'claimed', created_at: '2026-06-17T15:01:00.000Z' },
    { collection_run_id: 'run-2', code: 'IMPORT_COMPLETED', message: 'done', created_at: '2026-06-17T14:05:00.000Z' },
  ];

  assert.deepEqual(mergeRunsWithLatestEvents(runs, events), [
    {
      id: 'run-1',
      status: 'running',
      current_stage: 'claim',
      created_at: '2026-06-17T15:00:00.000Z',
      latest_event: {
        collection_run_id: 'run-1',
        code: 'TASK_CLAIMED',
        message: 'claimed',
        created_at: '2026-06-17T15:01:00.000Z',
      },
    },
    {
      id: 'run-2',
      status: 'completed',
      current_stage: 'finalize',
      created_at: '2026-06-17T14:00:00.000Z',
      latest_event: {
        collection_run_id: 'run-2',
        code: 'IMPORT_COMPLETED',
        message: 'done',
        created_at: '2026-06-17T14:05:00.000Z',
      },
    },
  ]);
});
