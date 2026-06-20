import test from 'node:test';
import assert from 'node:assert/strict';
import { buildXhsInitArtifacts, parseXhsNoteId } from './xhs-init.ts';

test('extracts note id from canonical xiaohongshu explore url', () => {
  assert.equal(
    parseXhsNoteId('https://www.xiaohongshu.com/explore/6895d55c000000001d03f65b'),
    '6895d55c000000001d03f65b'
  );
});

test('builds a high-completeness init payload when note detail is available', () => {
  const artifacts = buildXhsInitArtifacts({
    sourceUrl: 'https://www.xiaohongshu.com/explore/6895d55c000000001d03f65b',
    projectId: 'project-1',
    noteId: '6895d55c000000001d03f65b',
    detail: {
      title: '郭永怀相关笔记',
      description: '这是正文',
      author: '研究者A',
      likes: 120,
      comments_count: 36,
      cover_url: 'https://example.com/cover.jpg',
      published_at: '2026-06-17T10:00:00.000Z',
      topics: ['郭永怀', '两弹一星'],
    },
  });

  assert.deepEqual(artifacts.postInsert, {
    project_id: 'project-1',
    platform: 'xhs',
    url: 'https://www.xiaohongshu.com/explore/6895d55c000000001d03f65b',
    title: '郭永怀相关笔记',
    content: '这是正文',
    creator_name: '研究者A',
    author_name_mask: '研究者A',
    likes: 120,
    comments_count: 36,
    collected_by: 'xhs-init',
    is_aigc: false,
  });

  assert.equal(artifacts.response.noteId, '6895d55c000000001d03f65b');
  assert.equal(artifacts.response.note_title, '郭永怀相关笔记');
  assert.equal(artifacts.response.metadata_completeness, 'high');
  assert.equal(artifacts.response.has_author_context, true);
  assert.equal(artifacts.response.has_topics, true);
  assert.equal(artifacts.response.note_stats.comments, 36);
});

test('builds a low-completeness fallback payload when detail is unavailable', () => {
  const artifacts = buildXhsInitArtifacts({
    sourceUrl: 'https://www.xiaohongshu.com/explore/6895d55c000000001d03f65b',
    projectId: null,
    noteId: '6895d55c000000001d03f65b',
    detail: null,
  });

  assert.equal(artifacts.postInsert.title, '小红书笔记 6895d55c000000001d03f65b');
  assert.equal(artifacts.postInsert.content, undefined);
  assert.equal(artifacts.response.metadata_completeness, 'low');
  assert.equal(artifacts.response.has_author_context, false);
  assert.equal(artifacts.response.has_topics, false);
  assert.equal(artifacts.response.note_stats.comments, 0);
});
