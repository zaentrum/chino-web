// node --test (type stripping, Node >= 22.18). Excluded from the app's tsc program.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AMBIENT_EASE_MS, AMBIENT_SAMPLE_MS, AMBIENT_STEP_MS, ambientStep } from './zapAmbient.ts';

// The light after n steps towards a sample, from 0 (the old light) to 1.
const after = (steps: number, step: number) => 1 - Math.pow(1 - step, steps);

test('the light is all but at a sample after the ease, not before', () => {
  const step = ambientStep();
  const steps = AMBIENT_EASE_MS / AMBIENT_STEP_MS;
  assert.ok(Math.abs(after(steps, step) - 0.95) < 1e-9);
  assert.ok(after(steps / 2, step) < 0.8, 'half way through it is still on its way');
});

test('one step is a small move: a cut in the clip is a drift, never a jump', () => {
  const step = ambientStep();
  assert.ok(step > 0 && step < 0.2, `a step of ${step}`);
});

test('the clip is sampled at most once a second, and the ease outlasts a sample', () => {
  assert.ok(AMBIENT_SAMPLE_MS >= 1000);
  assert.ok(AMBIENT_EASE_MS > AMBIENT_SAMPLE_MS);
});

test('a slower ease takes smaller steps', () => {
  assert.ok(ambientStep(100, 3600) < ambientStep(100, 1800));
  assert.equal(ambientStep(100, 50), 0.95);
});
