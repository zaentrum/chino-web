// node --test (type stripping, Node >= 22.18). Excluded from the app's tsc program.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { featuresFrom } from './runtimeConfig.ts';
import { FeedbackOffError, feedbackError } from './feedbackStatus.ts';

test('feedback is offered only when the server says true', () => {
  assert.deepEqual(featuresFrom({ features: { feedback: true } }), { feedback: true });
  assert.deepEqual(featuresFrom({ features: { feedback: false } }), { feedback: false });
});

test('a server that predates the flag, or sends anything else, gets it hidden', () => {
  assert.deepEqual(featuresFrom({}), { feedback: false });
  assert.deepEqual(featuresFrom({ features: {} }), { feedback: false });
  assert.deepEqual(featuresFrom({ features: { feedback: 'true' } }), { feedback: false });
  assert.deepEqual(featuresFrom({ features: null }), { feedback: false });
  assert.deepEqual(featuresFrom(null), { feedback: false });
});

test('a 503 from the feedback endpoint means reporting is off', () => {
  assert.ok(feedbackError(503) instanceof FeedbackOffError);
  for (const status of [400, 413, 429, 500, 502]) {
    const e = feedbackError(status);
    assert.ok(!(e instanceof FeedbackOffError), `status ${status}`);
    assert.equal(e.message, `chino-api ${status}`);
  }
});
