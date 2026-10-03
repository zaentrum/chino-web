// node --test (type stripping, Node >= 22.18). Excluded from the app's tsc program.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { withStreamToken } from './artwork.ts';

test('the stream token rides on the URL, encoded', () => {
  assert.equal(withStreamToken('/api/v1/people/p1/profile', 'a b+c'), '/api/v1/people/p1/profile?stream=a%20b%2Bc');
  assert.equal(withStreamToken('/api/v1/people/p1/profile?w=185', 'tok'), '/api/v1/people/p1/profile?w=185&stream=tok');
});

test('no token yet: the URL as it is; no URL: nothing', () => {
  assert.equal(withStreamToken('/api/v1/people/p1/profile', null), '/api/v1/people/p1/profile');
  assert.equal(withStreamToken('/api/v1/people/p1/profile', ''), '/api/v1/people/p1/profile');
  assert.equal(withStreamToken(undefined, 'tok'), undefined);
  assert.equal(withStreamToken('', 'tok'), undefined);
});
