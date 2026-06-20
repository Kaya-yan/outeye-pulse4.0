import test from 'node:test';
import assert from 'node:assert/strict';
import { buildBilibiliCandidate, buildXhsCandidate, scoreCollectionCandidate } from './collection-candidate.ts';

test('builds a normalized Bilibili candidate with recall metadata', () => {
  const candidate = buildBilibiliCandidate({
    bvid: 'BV1234567890',
    title: '郭永怀纪录片',
    author: '央视纪录',
    play: 120000,
    review: 580,
    likes: 8600,
    favorites: 4300,
    pubdate: 1718600000,
    description: '讲述郭永怀生平',
    tag: '郭永怀,两弹一星',
  }, 'wbi-search');

  assert.deepEqual(candidate, {
    platform: 'bilibili',
    platformId: 'BV1234567890',
    url: 'https://www.bilibili.com/video/BV1234567890',
    title: '郭永怀纪录片',
    author: '央视纪录',
    summary: '讲述郭永怀生平',
    tags: ['郭永怀', '两弹一星'],
    views: 120000,
    likes: 8600,
    commentsCount: 580,
    favorites: 4300,
    publishedAt: new Date(1718600000 * 1000).toISOString(),
    recallSource: 'wbi-search',
  });
});

test('builds a normalized XHS candidate with recall metadata', () => {
  const candidate = buildXhsCandidate({
    note_id: '6895d55c000000001d03f65b',
    title: '郭永怀相关笔记',
    author: '研究者A',
    url: 'https://www.xiaohongshu.com/explore/6895d55c000000001d03f65b',
    views: 32000,
    likes: 2100,
    comments_count: 360,
    description: '人物纪念内容',
  }, 'mcp');

  assert.deepEqual(candidate, {
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
  });
});

test('scores a candidate higher when it has strong comment potential and keyword relevance', () => {
  const score = scoreCollectionCandidate({
    title: '郭永怀纪录片',
    summary: '纪念郭永怀与两弹一星精神',
    tags: ['郭永怀', '两弹一星'],
    commentsCount: 580,
    likes: 8600,
    views: 120000,
    publishedAt: new Date().toISOString(),
  }, '郭永怀');

  assert.equal(typeof score.total, 'number');
  assert.equal(score.total > 70, true);
  assert.equal(score.keywordRelevance > 20, true);
  assert.equal(score.commentPotential > 20, true);
});
