// node --test (type stripping, Node >= 22.18). Excluded from the app's tsc program.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dismissProgress } from './continueWatching.ts';

test('a remove saves the title at its end, as a dismiss', () => {
  assert.deepEqual(dismissProgress(2700), { position_sec: 2700, duration_sec: 2700, dismiss: true });
});

test('a title of no known length is saved a day in, still a dismiss', () => {
  for (const unknown of [0, -5, null, undefined]) {
    assert.deepEqual(dismissProgress(unknown), { position_sec: 86400, duration_sec: 86400, dismiss: true });
  }
});
