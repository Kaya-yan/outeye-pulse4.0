import test from 'node:test';
import assert from 'node:assert/strict';
import { getCollectionNextAction } from './collection-next-action.ts';

test('recommends bookmarklet backfill when a collection summary needs backfill', () => {
  const action = getCollectionNextAction({
    platform: 'xhs',
    needBackfill: true,
    queued: false,
    coverageScore: 'low',
    metadataCompleteness: 'low',
  });

  assert.deepEqual(action, {
    label: '前往 P0 补录',
    href: '/p0',
    hint: '建议使用书签采集会话或 Console 脚本补齐评论与元数据缺口',
  });
});

test('recommends checking the run panel when the collection is queued', () => {
  const action = getCollectionNextAction({
    platform: 'xhs',
    needBackfill: false,
    queued: true,
    coverageScore: 'low',
    metadataCompleteness: 'high',
  });

  assert.deepEqual(action, {
    label: '前往 P0 查看运行',
    href: '/p0',
    hint: '深采任务仍在执行或排队中，请在采集运行中心继续跟踪',
  });
});

test('returns null when the collection is complete and no backfill is needed', () => {
  const action = getCollectionNextAction({
    platform: 'bilibili',
    needBackfill: false,
    queued: false,
    coverageScore: 'high',
    metadataCompleteness: 'high',
  });

  assert.equal(action, null);
});
