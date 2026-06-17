import test from 'node:test';
import assert from 'node:assert/strict';
import { buildRunCommand } from './collection-run-command.ts';

test('builds the polling agent command for agent direct_url runs', () => {
  const command = buildRunCommand({
    id: 'run-1',
    source: 'agent',
    mode: 'direct_url',
    target_type: 'url',
    target_value: 'https://www.bilibili.com/video/BV1234567890',
  });

  assert.equal(command.kind, 'shell');
  assert.match(command.command, /python\s+scripts\/agent\/agent\.py/);
});

test('builds a console script command for bookmarklet raw_intake runs', () => {
  const command = buildRunCommand({
    id: 'run-2',
    source: 'bookmarklet',
    mode: 'raw_intake',
    target_type: 'mixed',
    target_value: null,
  });

  assert.equal(command.kind, 'console');
  assert.match(command.command, /collection_run_id/);
  assert.match(command.command, /run-2/);
});
