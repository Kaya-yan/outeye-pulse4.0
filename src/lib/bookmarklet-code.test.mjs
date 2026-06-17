import test from 'node:test';
import assert from 'node:assert/strict';
import { getConsoleScript } from './bookmarklet-code.ts';

test('embeds collection_run_id in the console script when provided', () => {
  const script = getConsoleScript('run-1');
  assert.match(script, /collection_run_id/);
  assert.match(script, /run-1/);
});

test('does not inject a collection_run_id when none is provided', () => {
  const script = getConsoleScript();
  assert.doesNotMatch(script, /collection_run_id/);
});
