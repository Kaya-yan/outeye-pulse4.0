import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getCredibilityCopy } from './research-credibility-copy.ts';

test('grade A returns strong-research copy', () => {
  const copy = getCredibilityCopy({ researchGrade: 'A', traceCompleteness: 'full', hasFailedRuns: false });
  assert.match(copy.gradeLabel, /主样本/);
  assert.equal(copy.citationAdvice.includes('可直接引用'), true);
});

test('grade C with failed runs returns cautious copy', () => {
  const copy = getCredibilityCopy({ researchGrade: 'C', traceCompleteness: 'partial', hasFailedRuns: true });
  assert.match(copy.gradeLabel, /辅助样本/);
  assert.equal(copy.citationAdvice.includes('谨慎引用'), true);
  assert.equal(copy.riskHint.length > 0, true);
});

test('partial trace always produces a risk hint', () => {
  const copy = getCredibilityCopy({ researchGrade: 'B', traceCompleteness: 'partial', hasFailedRuns: false });
  assert.equal(copy.riskHint.length > 0, true);
});

test('none trace produces missing-source hint', () => {
  const copy = getCredibilityCopy({ researchGrade: 'C', traceCompleteness: 'none', hasFailedRuns: false });
  assert.match(copy.riskHint, /来源追溯/);
});
