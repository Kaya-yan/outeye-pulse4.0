import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildStatSample, summarizeStatInput } from './research-statistics-input.ts';

test('buildStatSample keeps legitimate zero values', () => {
  const comments = [
    { id: '1', analysis: { d2_valence: 0 } },
    { id: '2', analysis: { d2_valence: 0.5 } },
    { id: '3', analysis: { d2_valence: -0.3 } },
  ];
  const sample = buildStatSample(comments, 'd2_valence');
  assert.equal(sample.values.length, 3);
  assert.deepEqual(sample.values, [0, 0.5, -0.3]);
  assert.equal(sample.missingCount, 0);
});

test('buildStatSample excludes null/undefined as missing, not as zero', () => {
  const comments = [
    { id: '1', analysis: { d1: 8 } },
    { id: '2', analysis: { d1: null } },
    { id: '3', analysis: {} },
    { id: '4', analysis: { d1: 0 } },
  ];
  const sample = buildStatSample(comments, 'd1');
  assert.equal(sample.values.length, 2);
  assert.deepEqual(sample.values, [8, 0]);
  assert.equal(sample.missingCount, 2);
});

test('buildStatSample reports filteredCount when a pre-filter is supplied', () => {
  const comments = [
    { id: '1', analysis: { d1: 8 } },
    { id: '2', analysis: { d1: 7 }, _filtered: true },
    { id: '3', analysis: { d1: null } },
  ];
  const sample = buildStatSample(comments, 'd1', {
    shouldInclude: (c) => !c._filtered,
  });
  assert.deepEqual(sample.values, [8]);
  assert.equal(sample.missingCount, 1);
  assert.equal(sample.filteredCount, 1);
});

test('buildStatSample excludes filtered rows before counting missing', () => {
  const comments = [
    { id: '1', analysis: { d1: 8 } },
    { id: '2', analysis: { d1: 9 } },
    { id: '3', analysis: { d1: null }, _filtered: true },
  ];
  const sample = buildStatSample(comments, 'd1', {
    shouldInclude: (c) => !c._filtered,
  });
  assert.deepEqual(sample.values, [8, 9]);
  assert.equal(sample.missingCount, 0);
  assert.equal(sample.filteredCount, 1);
});

test('summarizeStatInput reports total/valid/missing/filtered consistently', () => {
  const sample = {
    values: [1, 2, 3],
    missingCount: 2,
    filteredCount: 1,
    zeroCount: 0,
  };
  const summary = summarizeStatInput(sample, 6);
  assert.equal(summary.total, 6);
  assert.equal(summary.valid, 3);
  assert.equal(summary.missing, 2);
  assert.equal(summary.filtered, 1);
});

test('buildStatSample counts legitimate zeros separately from missing', () => {
  const comments = [
    { id: '1', analysis: { d6: 0 } },
    { id: '2', analysis: { d6: 2 } },
    { id: '3', analysis: { d6: null } },
  ];
  const sample = buildStatSample(comments, 'd6');
  assert.equal(sample.values.length, 2);
  assert.equal(sample.zeroCount, 1);
  assert.equal(sample.missingCount, 1);
});
