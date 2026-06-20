import test from 'node:test';
import assert from 'node:assert/strict';
import { buildXhsCollectSummary, buildXhsTaskRequest, isTerminalRunStatus } from './collect-xhs.ts';

test('recognizes completed, failed, and cancelled runs as terminal', () => {
  assert.equal(isTerminalRunStatus('completed'), true);
  assert.equal(isTerminalRunStatus('failed'), true);
  assert.equal(isTerminalRunStatus('cancelled'), true);
  assert.equal(isTerminalRunStatus('running'), false);
  assert.equal(isTerminalRunStatus('awaiting_input'), false);
});

test('builds a high-value collect summary from a completed xhs run', () => {
  const summary = buildXhsCollectSummary({
    init: {
      postId: 'post-1',
      note_title: '郭永怀相关笔记',
      metadata_completeness: 'high',
      has_author_context: true,
      has_topics: true,
    },
    run: {
      status: 'completed',
      current_stage: 'finalize',
      received_count: 120,
      imported_count: 96,
      duplicate_count: 10,
      filtered_count: 8,
      failed_count: 6,
      latest_hint: null,
      latest_error: null,
    },
  });

  assert.deepEqual(summary, {
    success: true,
    postId: 'post-1',
    noteTitle: '郭永怀相关笔记',
    collectedMainComments: 120,
    collectedSubComments: 0,
    imported: 96,
    duplicates: 10,
    filtered: 8,
    failed: 6,
    metadataCompleteness: 'high',
    coverageScore: 'high',
    needBackfill: false,
    error: null,
  });
});

test('marks xhs collect result as needing backfill when run finishes with low import ratio', () => {
  const summary = buildXhsCollectSummary({
    init: {
      postId: 'post-2',
      note_title: '小红书笔记 123',
      metadata_completeness: 'low',
      has_author_context: false,
      has_topics: false,
    },
    run: {
      status: 'completed',
      current_stage: 'finalize',
      received_count: 100,
      imported_count: 20,
      duplicate_count: 50,
      filtered_count: 10,
      failed_count: 20,
      latest_hint: '建议补录',
      latest_error: null,
    },
  });

  assert.equal(summary.coverageScore, 'low');
  assert.equal(summary.needBackfill, true);
});

test('builds the XHS task request from init data for the deep collection engine', () => {
  const request = buildXhsTaskRequest({
    init: {
      postId: 'post-1',
      note_title: '郭永怀相关笔记',
      metadata_completeness: 'high',
      has_author_context: true,
      has_topics: true,
      sourceUrl: 'https://www.xiaohongshu.com/explore/6895d55c000000001d03f65b',
      project_id: 'project-1',
      noteId: '6895d55c000000001d03f65b',
    },
    maxComments: 5000,
  });

  assert.deepEqual(request, {
    platform: 'xhs',
    target_url: 'https://www.xiaohongshu.com/explore/6895d55c000000001d03f65b',
    max_comments: 5000,
    project_id: 'project-1',
    config_json: {
      post_id: 'post-1',
      note_id: '6895d55c000000001d03f65b',
      source: 'collect-xhs',
      metadata_completeness: 'high',
    },
  });
});
