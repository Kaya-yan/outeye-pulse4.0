import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateCollectionQuality } from './collection-quality.ts';

test('assigns grade A when coverage and metadata are both high with no backfill needed', () => {
  const quality = evaluateCollectionQuality({
    coverageScore: 'high',
    metadataCompleteness: 'high',
    needBackfill: false,
  });

  assert.deepEqual(quality, {
    researchGrade: 'A',
    coverageScore: 'high',
    metadataScore: 'high',
    needBackfill: false,
    explanation: '评论覆盖和元数据都达到了主样本标准',
  });
});

test('assigns grade B when coverage is medium but metadata is high', () => {
  const quality = evaluateCollectionQuality({
    coverageScore: 'medium',
    metadataCompleteness: 'high',
    needBackfill: false,
  });

  assert.equal(quality.researchGrade, 'B');
  assert.equal(quality.metadataScore, 'high');
});

test('assigns grade C and recommends backfill when low coverage or low metadata exists', () => {
  const quality = evaluateCollectionQuality({
    coverageScore: 'low',
    metadataCompleteness: 'low',
    needBackfill: true,
  });

  assert.deepEqual(quality, {
    researchGrade: 'C',
    coverageScore: 'low',
    metadataScore: 'low',
    needBackfill: true,
    explanation: '当前结果更适合作为辅助样本，建议继续补录或重试',
  });
});
