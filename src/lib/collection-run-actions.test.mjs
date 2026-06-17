import test from 'node:test';
import assert from 'node:assert/strict';
import { shouldShowRetryAction } from './collection-run-actions.ts';

test('shows retry action for failed and cancelled runs only', () => {
  assert.equal(shouldShowRetryAction('failed'), true);
  assert.equal(shouldShowRetryAction('cancelled'), true);
  assert.equal(shouldShowRetryAction('completed'), false);
  assert.equal(shouldShowRetryAction('running'), false);
  assert.equal(shouldShowRetryAction('queued'), false);
  assert.equal(shouldShowRetryAction('awaiting_input'), false);
});
