import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildCredibilityProfile } from './research-credibility.ts';

test('buildCredibilityProfile produces grade A profile for complete high-quality data', () => {
  const profile = buildCredibilityProfile({
    projectId: 'p1',
    coverageScore: 'high',
    metadataCompleteness: 'high',
    needBackfill: false,
    platform: 'bilibili',
    runs: [
      { id: 'r1', status: 'completed', source: 'agent', mode: 'deep_collect' },
    ],
    comments: [
      { id: 'c1', platform: 'bilibili' },
      { id: 'c2', platform: 'bilibili' },
    ],
    statSamples: { d1: { values: [7, 8, 9], missingCount: 0, filteredCount: 0, zeroCount: 0 } },
  });
  assert.equal(profile.researchGrade, 'A');
  assert.equal(profile.traceCompleteness, 'full');
  assert.equal(profile.citationAdvice.includes('可直接引用'), true);
  assert.equal(profile.riskHint, '');
});

test('buildCredibilityProfile downgrades citation when trace is partial', () => {
  const profile = buildCredibilityProfile({
    projectId: 'p1',
    coverageScore: 'high',
    metadataCompleteness: 'high',
    needBackfill: false,
    platform: 'bilibili',
    runs: [
      { id: 'r1', status: 'completed', source: 'agent', mode: 'deep_collect' },
      { id: 'r2', status: 'failed', source: 'agent', mode: 'deep_collect' },
    ],
    comments: [{ id: 'c1', platform: 'bilibili' }],
    statSamples: {},
  });
  assert.equal(profile.traceCompleteness, 'partial');
  assert.equal(profile.hasFailedRuns, true);
  assert.equal(profile.citationAdvice.includes('谨慎引用') || profile.citationAdvice.includes('参考引用'), true);
});

test('buildCredibilityProfile surfaces missing stat samples', () => {
  const profile = buildCredibilityProfile({
    projectId: 'p1',
    coverageScore: 'low',
    metadataCompleteness: 'low',
    needBackfill: true,
    platform: 'xhs',
    runs: [],
    comments: [],
    statSamples: { d1: { values: [], missingCount: 5, filteredCount: 0, zeroCount: 0 } },
  });
  assert.equal(profile.researchGrade, 'C');
  assert.equal(profile.traceCompleteness, 'none');
  assert.equal(profile.statSummary.d1.valid, 0);
  assert.equal(profile.statSummary.d1.missing, 5);
});

test('buildCredibilityProfile detects backfill from bookmarklet run', () => {
  const profile = buildCredibilityProfile({
    projectId: 'p1',
    coverageScore: 'medium',
    metadataCompleteness: 'medium',
    needBackfill: false,
    platform: 'bilibili',
    runs: [
      { id: 'r1', status: 'completed', source: 'agent', mode: 'deep_collect' },
      { id: 'r2', status: 'completed', source: 'bookmarklet', mode: 'raw_intake' },
    ],
    comments: [{ id: 'c1', platform: 'bilibili' }],
    statSamples: {},
  });
  assert.equal(profile.hasBackfill, true);
  assert.equal(profile.backfillSource, 'bookmarklet');
});

test('buildCredibilityProfile includes next action from collection-next-action', () => {
  const profile = buildCredibilityProfile({
    projectId: 'p1',
    coverageScore: 'low',
    metadataCompleteness: 'low',
    needBackfill: true,
    platform: 'bilibili',
    runs: [{ id: 'r1', status: 'completed', source: 'agent', mode: 'deep_collect' }],
    comments: [],
    statSamples: {},
  });
  assert.equal(profile.nextAction !== null, true);
  assert.equal(profile.nextAction.href, '/p0');
});
