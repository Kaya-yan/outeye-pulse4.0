import test from 'node:test';
import assert from 'node:assert/strict';
import { collectXhsComments } from './collect-xhs.ts';

const initPayload = {
  success: true,
  postId: 'post-1',
  project_id: 'project-1',
  sourceUrl: 'https://www.xiaohongshu.com/explore/6895d55c000000001d03f65b',
  noteId: '6895d55c000000001d03f65b',
  note_title: '郭永怀相关笔记',
  metadata_completeness: 'high',
  has_author_context: true,
  has_topics: true,
};

const queuedTaskPayload = {
  success: true,
  task: { id: 'task-1' },
  collection_run_id: 'run-1',
};

test('collectXhsComments initializes xhs, creates an agent task, polls the run, and returns a completed summary', async () => {
  const calls = [];
  const fetchImpl = async (url, options = {}) => {
    calls.push({ url, options });

    if (url === '/api/collect/xhs') {
      return { async json() { return initPayload; } };
    }

    if (url === '/api/agent/tasks') {
      return { async json() { return queuedTaskPayload; } };
    }

    if (typeof url === 'string' && url.startsWith('/api/collection/runs?')) {
      const pollIndex = calls.filter(c => typeof c.url === 'string' && c.url.startsWith('/api/collection/runs?')).length;
      return {
        async json() {
          return {
            runs: [
              pollIndex === 1
                ? {
                    id: 'run-1',
                    status: 'running',
                    current_stage: 'crawl',
                    received_count: 40,
                    imported_count: 0,
                    duplicate_count: 0,
                    filtered_count: 0,
                    failed_count: 0,
                    latest_hint: null,
                    latest_error: null,
                    latest_event: { code: 'CRAWL_PROGRESS' },
                  }
                : {
                    id: 'run-1',
                    status: 'completed',
                    current_stage: 'finalize',
                    received_count: 100,
                    imported_count: 82,
                    duplicate_count: 9,
                    filtered_count: 5,
                    failed_count: 4,
                    latest_hint: null,
                    latest_error: null,
                    latest_event: { code: 'ANALYSIS_TRIGGERED' },
                  },
            ],
          };
        },
      };
    }

    throw new Error(`Unexpected fetch call: ${url}`);
  };

  const progress = [];
  const result = await collectXhsComments(
    {
      url: 'https://www.xiaohongshu.com/explore/6895d55c000000001d03f65b',
      projectId: 'project-1',
      maxComments: 5000,
    },
    p => progress.push(p),
    { fetchImpl, sleepImpl: async () => {} }
  );

  assert.equal(result.success, true);
  assert.equal(result.postId, 'post-1');
  assert.equal(result.imported, 82);
  assert.equal(result.coverageScore, 'high');
  assert.equal(result.needBackfill, false);
  assert.equal(result.analysisTriggered, true);
  assert.equal(progress[0].phase, 'init');
  assert.equal(progress.at(-1)?.phase, 'done');
});

test('collectXhsComments returns a queued placeholder summary when the run does not finish quickly', async () => {
  const fetchImpl = async (url) => {
    if (url === '/api/collect/xhs') {
      return { async json() { return initPayload; } };
    }
    if (url === '/api/agent/tasks') {
      return { async json() { return queuedTaskPayload; } };
    }
    if (typeof url === 'string' && url.startsWith('/api/collection/runs?')) {
      return {
        async json() {
          return {
            runs: [{
              id: 'run-1',
              status: 'queued',
              current_stage: 'queue',
              received_count: 0,
              imported_count: 0,
              duplicate_count: 0,
              filtered_count: 0,
              failed_count: 0,
              latest_hint: null,
              latest_error: null,
              latest_event: { code: 'TASK_ENQUEUED' },
            }],
          };
        },
      };
    }
    throw new Error(`Unexpected fetch call: ${url}`);
  };

  const result = await collectXhsComments(
    {
      url: 'https://www.xiaohongshu.com/explore/6895d55c000000001d03f65b',
      projectId: 'project-1',
      maxComments: 5000,
    },
    () => {},
    { fetchImpl, sleepImpl: async () => {} }
  );

  assert.equal(result.success, false);
  assert.equal(result.error, null);
  assert.equal(result.queued, true);
  assert.equal(result.needBackfill, false);
  assert.equal(result.coverageScore, 'low');
  assert.equal(result.noteTitle, '郭永怀相关笔记');
});
