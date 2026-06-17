import test from 'node:test';
import assert from 'node:assert/strict';
import { detectRunStall } from './collection-run-stall.ts';

test('marks queued runs as stalled after 10 minutes without heartbeat', () => {
  const result = detectRunStall({
    status: 'queued',
    heartbeat_at: '2026-06-17T18:00:00.000Z',
    now: '2026-06-17T18:11:00.000Z',
  });

  assert.deepEqual(result, {
    stalled: true,
    failure_code: 'RUN_STALLED',
    thresholdMs: 10 * 60 * 1000,
  });
});

test('marks running runs as stalled after 15 minutes without heartbeat', () => {
  const result = detectRunStall({
    status: 'running',
    heartbeat_at: '2026-06-17T18:00:00.000Z',
    now: '2026-06-17T18:16:00.000Z',
  });

  assert.deepEqual(result, {
    stalled: true,
    failure_code: 'RUN_STALLED',
    thresholdMs: 15 * 60 * 1000,
  });
});

test('does not mark terminal runs as stalled', () => {
  const result = detectRunStall({
    status: 'completed',
    heartbeat_at: '2026-06-17T18:00:00.000Z',
    now: '2026-06-17T20:00:00.000Z',
  });

  assert.deepEqual(result, {
    stalled: false,
    failure_code: null,
    thresholdMs: null,
  });
});
