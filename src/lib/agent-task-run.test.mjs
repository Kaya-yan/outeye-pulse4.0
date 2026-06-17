import test from 'node:test';
import assert from 'node:assert/strict';
import { buildAgentTaskCreationArtifacts } from './agent-task-run.ts';

test('builds run, event, and task payload for an agent task created from the UI', () => {
  const artifacts = buildAgentTaskCreationArtifacts({
    project_id: 'project-1',
    platform: 'bilibili',
    target_url: 'https://www.bilibili.com/video/BV1234567890',
    task_type: 'comments',
    max_comments: 2000,
    config_json: { include_replies: true },
    priority: 5,
    scheduled_at: null,
    now: '2026-06-17T14:00:00.000Z',
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
    created_at: '2026-06-17T14:00:00.000Z',
    updated_at: '2026-06-17T14:00:00.000Z',
  });

  assert.deepEqual(artifacts.event, {
    stage: 'queue',
    level: 'info',
    code: 'TASK_ENQUEUED',
    message: 'Agent task created and queued',
    details_json: {
      task_type: 'comments',
      max_comments: 2000,
      priority: 5,
    },
    hint: null,
    created_at: '2026-06-17T14:00:00.000Z',
  });

  assert.deepEqual(artifacts.taskPayload, {
    platform: 'bilibili',
    target_url: 'https://www.bilibili.com/video/BV1234567890',
    task_type: 'comments',
    max_comments: 2000,
    config_json: { include_replies: true },
    priority: 5,
    scheduled_at: '2026-06-17T14:00:00.000Z',
  });
});
