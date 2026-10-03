// node --test (type stripping, Node >= 22.18). Excluded from the app's tsc program.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isNotFoundError, isNotFoundStatus } from './reportPolicy.ts';

test('not there - a bad link, a removed title - is not a bug', () => {
  assert.equal(isNotFoundStatus(404), true);
  assert.equal(isNotFoundStatus(410), true);
});

test('failures of the server or of chino are', () => {
  for (const status of [400, 401, 403, 500, 502, 503, 0, null, undefined]) {
    assert.equal(isNotFoundStatus(status), false, String(status));
  }
});

test('the errors chino\'s fetch helpers throw for a missing thing', () => {
  assert.equal(isNotFoundError('chino-api 404'), true);
  assert.equal(isNotFoundError('watchlist 410'), true);
  assert.equal(isNotFoundError('chino-api 503'), false);
  assert.equal(isNotFoundError('TypeError: x is undefined (404)'), false);
  assert.equal(isNotFoundError('chino-api 4040'), false);
});
