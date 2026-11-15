// node --test (type stripping, Node >= 22.18). Excluded from the app's tsc program.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  EXPIRY_MARGIN_MS,
  STREAM_TOKEN_KEY,
  forgetCachedStreamToken,
  readStreamToken,
  subjectOf,
  writeStreamToken,
} from './streamTokenCache.ts';

/** A tab's sessionStorage. */
function tab() {
  const data = new Map<string, string>();
  return {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => { data.set(k, v); },
    removeItem: (k: string) => { data.delete(k); },
    data,
  };
}

/** A bearer as the identity provider issues it: header.payload.signature, base64url. */
function bearerFor(payload: object): string {
  const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url');
  return `${b64({ alg: 'RS256' })}.${b64(payload)}.signature`;
}

const NOW = 1_800_000_000_000;
const HOUR = 60 * 60 * 1000;

test('P.C16: a stream token cached for one account is not read back for the next account in the same tab', () => {
  const store = tab();
  writeStreamToken(store, { token: 'parent-token', expiresAt: NOW + 6 * HOUR, sub: 'parent' });
  assert.equal(readStreamToken(store, 'parent', NOW)?.token, 'parent-token');
  assert.equal(readStreamToken(store, 'child', NOW), null);
});

test('P.C16: the next account\'s token takes the place of the one before, and each reads only its own', () => {
  const store = tab();
  writeStreamToken(store, { token: 'parent-token', expiresAt: NOW + 6 * HOUR, sub: 'parent' });
  writeStreamToken(store, { token: 'child-token', expiresAt: NOW + 6 * HOUR, sub: 'child' });
  assert.equal(readStreamToken(store, 'child', NOW)?.token, 'child-token');
  assert.equal(readStreamToken(store, 'parent', NOW), null);
});

test('P.C16: an entry that names no account, as older builds wrote it, is nobody\'s', () => {
  const store = tab();
  store.setItem(STREAM_TOKEN_KEY, JSON.stringify({ token: 'old-token', expiresAt: NOW + 6 * HOUR }));
  assert.equal(readStreamToken(store, 'parent', NOW), null);
  assert.equal(readStreamToken(store, 'child', NOW), null);
});

test('P.C16: nothing is read while nobody is signed in', () => {
  const store = tab();
  writeStreamToken(store, { token: 'parent-token', expiresAt: NOW + 6 * HOUR, sub: 'parent' });
  assert.equal(readStreamToken(store, null, NOW), null);
  assert.equal(readStreamToken(store, undefined, NOW), null);
  assert.equal(readStreamToken(store, '', NOW), null);
});

test('P.C16: signing out drops the token from the tab', () => {
  const store = tab();
  writeStreamToken(store, { token: 'parent-token', expiresAt: NOW + 6 * HOUR, sub: 'parent' });
  forgetCachedStreamToken(store);
  assert.equal(store.data.size, 0);
  assert.equal(readStreamToken(store, 'parent', NOW), null);
});

test('a token is read until a minute before it runs out, and not after', () => {
  const store = tab();
  writeStreamToken(store, { token: 't', expiresAt: NOW + HOUR, sub: 'a' });
  assert.equal(readStreamToken(store, 'a', NOW + HOUR - EXPIRY_MARGIN_MS)?.token, 't');
  assert.equal(readStreamToken(store, 'a', NOW + HOUR - EXPIRY_MARGIN_MS + 1), null);
});

test('an entry that is not what was written is no token', () => {
  const store = tab();
  for (const raw of ['not json', '{}', '{"token":"t"}', '{"token":"","expiresAt":1,"sub":"a"}', '{"token":"t","expiresAt":"soon","sub":"a"}']) {
    store.setItem(STREAM_TOKEN_KEY, raw);
    assert.equal(readStreamToken(store, 'a', NOW), null, raw);
  }
});

test('a storage that refuses is no token and no failure', () => {
  const refusing = {
    getItem: () => { throw new Error('storage off'); },
    setItem: () => { throw new Error('quota'); },
    removeItem: () => { throw new Error('storage off'); },
  };
  assert.equal(readStreamToken(refusing, 'a', NOW), null);
  writeStreamToken(refusing, { token: 't', expiresAt: NOW + HOUR, sub: 'a' });
  forgetCachedStreamToken(refusing);
});

test('the account a bearer is for is its payload\'s sub', () => {
  assert.equal(subjectOf(bearerFor({ sub: 'cfee16fd-3597', max_rating: 6 })), 'cfee16fd-3597');
  assert.equal(subjectOf(bearerFor({ sub: 'zoë-ß-名' })), 'zoë-ß-名');
});

test('a bearer that names no account has none', () => {
  for (const b of [null, undefined, '', 'opaque-token', 'a.b', 'a.!!!.c', bearerFor({}), bearerFor({ sub: '' }), bearerFor({ sub: 42 })]) {
    assert.equal(subjectOf(b), null, String(b));
  }
});
