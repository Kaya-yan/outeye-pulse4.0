import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildResearchTrace } from './research-trace.ts';

test('buildResearchTrace summarizes run status distribution', () => {
  const runs = [
    { id: 'r1', status: 'completed', source: 'agent', mode: 'deep_collect' },
    { id: 'r2', status: 'failed', source: 'agent', mode: 'deep_collect' },
    { id: 'r3', status: 'partial_success', source: 'bookmarklet', mode: 'raw_intake' },
  ];
  const trace = buildResearchTrace({ runs, events: [], comments: [] });
  assert.equal(trace.runCount, 3);
  assert.equal(trace.completedCount, 1);
  assert.equal(trace.failedCount, 1);
  assert.equal(trace.partialCount, 1);
});

test('buildResearchTrace detects backfill via bookmarklet source', () => {
  const runs = [
    { id: 'r1', status: 'completed', source: 'agent', mode: 'deep_collect' },
    { id: 'r2', status: 'completed', source: 'bookmarklet', mode: 'raw_intake' },
  ];
  const trace = buildResearchTrace({ runs, events: [], comments: [] });
  assert.equal(trace.hasBackfill, true);
  assert.equal(trace.backfillSource, 'bookmarklet');
});

test('buildResearchTrace summarizes platform coverage from comments', () => {
  const runs = [{ id: 'r1', status: 'completed', source: 'agent', mode: 'deep_collect' }];
  const comments = [
    { id: 'c1', platform: 'bilibili' },
    { id: 'c2', platform: 'bilibili' },
    { id: 'c3', platform: 'xhs' },
  ];
  const trace = buildResearchTrace({ runs, events: [], comments });
  assert.deepEqual(trace.platformCounts, { bilibili: 2, xhs: 1 });
});

test('buildResearchTrace reports traceCompleteness as partial when failed runs exist', () => {
  const runs = [
    { id: 'r1', status: 'completed', source: 'agent', mode: 'deep_collect' },
    { id: 'r2', status: 'failed', source: 'agent', mode: 'deep_collect' },
  ];
  const trace = buildResearchTrace({ runs, events: [], comments: [] });
  assert.equal(trace.traceCompleteness, 'partial');
});

test('buildResearchTrace reports traceCompleteness as full when all completed', () => {
  const runs = [
    { id: 'r1', status: 'completed', source: 'agent', mode: 'deep_collect' },
  ];
  const trace = buildResearchTrace({ runs, events: [], comments: [] });
  assert.equal(trace.traceCompleteness, 'full');
});

test('buildResearchTrace reports traceCompleteness as none when no runs', () => {
  const trace = buildResearchTrace({ runs: [], events: [], comments: [] });
  assert.equal(trace.traceCompleteness, 'none');
  assert.equal(trace.runCount, 0);
});
