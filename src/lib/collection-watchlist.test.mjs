import test from 'node:test';
import assert from 'node:assert/strict';
import { buildWatchlistEntry } from './collection-watchlist.ts';

test('builds a watchlist entry from an xhs candidate', () => {
  const entry = buildWatchlistEntry({
    projectId: 'project-1',
    candidate: {
      platform: 'xhs',
      platformId: '6895d55c000000001d03f65b',
      url: 'https://www.xiaohongshu.com/explore/6895d55c000000001d03f65b',
      title: '郭永怀相关笔记',
      author: '研究者A',
      summary: '人物纪念内容',
      tags: [],
      views: 32000,
      likes: 2100,
      commentsCount: 360,
      favorites: 0,
      publishedAt: null,
      recallSource: 'mcp',
    },
  });

  assert.deepEqual(entry, {
    project_id: 'project-1',
    platform: 'xhs',
    target_type: 'content',
    target_value: '6895d55c000000001d03f65b',
    url: 'https://www.xiaohongshu.com/explore/6895d55c000000001d03f65b',
    title: '郭永怀相关笔记',
    author: '研究者A',
    summary: '人物纪念内容',
    recall_source: 'mcp',
    status: 'active',
  });
});

test('builds a watchlist entry from a bilibili candidate', () => {
  const entry = buildWatchlistEntry({
    projectId: null,
    candidate: {
      platform: 'bilibili',
      platformId: 'BV1234567890',
      url: 'https://www.bilibili.com/video/BV1234567890',
      title: '郭永怀纪录片',
      author: '央视纪录',
      summary: '讲述郭永怀生平',
      tags: ['郭永怀'],
      views: 120000,
      likes: 8600,
      commentsCount: 580,
      favorites: 4300,
      publishedAt: '2026-06-17T12:00:00.000Z',
      recallSource: 'wbi-search',
    },
  });

  assert.equal(entry.platform, 'bilibili');
  assert.equal(entry.target_value, 'BV1234567890');
  assert.equal(entry.recall_source, 'wbi-search');
});
