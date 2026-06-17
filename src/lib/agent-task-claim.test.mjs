import test from 'node:test';
import assert from 'node:assert/strict';
import { attachCollectionRunIdToClaimedTask } from './agent-task-claim.ts';

test('attaches collection_run_id to a claimed task payload', () => {
  const task = {
    id: 'task-1',
    platform: 'bilibili',
    target_url: 'https://www.bilibili.com/video/BV1234567890',
    task_type: 'comments',
    max_comments: 2000,
    priority: 0,
    config_json: {},
  };

  assert.deepEqual(attachCollectionRunIdToClaimedTask(task, 'run-1'), {
    id: 'task-1',
    platform: 'bilibili',
    target_url: 'https://www.bilibili.com/video/BV1234567890',
    task_type: 'comments',
    max_comments: 2000,
    priority: 0,
    config_json: {},
    collection_run_id: 'run-1',
  });
});
