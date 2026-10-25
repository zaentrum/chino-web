// node --test (type stripping, Node >= 22.18). Excluded from the app's tsc program.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  JUST_SIGNED_IN_MS,
  markRenewed,
  markSignedIn,
  nextSignInStep,
  readSignInMarks,
  renewalFailure,
  signInFailureReason,
} from './signInAgain.ts';

const none = { renewedAt: null, signedInAt: null };

test('a 401 renews the sign-in silently first', () => {
  assert.equal(nextSignInStep(none, 1_000_000), 'renew');
  // A renewal long ago: renew again.
  assert.equal(nextSignInStep({ renewedAt: 0, signedInAt: null }, JUST_SIGNED_IN_MS + 1), 'renew');
});

test('renewed, and the server still says 401: to sign-in', () => {
  const now = 5_000_000;
  assert.equal(nextSignInStep({ renewedAt: now - 2_000, signedInAt: null }, now), 'sign-in');
});

test('signed in just now, and the server still says 401: it stops - never round again by itself', () => {
  const now = 5_000_000;
  assert.equal(nextSignInStep({ renewedAt: now - 30_000, signedInAt: now - 1_000 }, now), 'refused');
  assert.equal(nextSignInStep({ renewedAt: null, signedInAt: now - 1_000 }, now), 'refused');
  // Long after that sign-in, a 401 is a sign-in that expired again.
  assert.equal(nextSignInStep({ renewedAt: null, signedInAt: now - JUST_SIGNED_IN_MS - 1 }, now), 'renew');
});

test('the loop the screens made: renew, sign-in, stop - whichever screen asks', () => {
  // Each screen that couldn't load asks afresh; the marks are the tab's.
  let now = 10_000_000;
  assert.equal(nextSignInStep(readSignInMarks(), now), 'renew');
  markRenewed(now);
  now += 400;
  assert.equal(nextSignInStep(readSignInMarks(), now), 'sign-in');
  // The sign-in comes back: its callback marks it.
  now += 3_000;
  markSignedIn(now);
  now += 400;
  assert.equal(nextSignInStep(readSignInMarks(), now), 'refused');
  assert.equal(nextSignInStep(readSignInMarks(), now + 500), 'refused');
});

test("a renewal that can't reach the sign-in service is the connection case; any other failure goes to sign-in", () => {
  assert.equal(renewalFailure(new TypeError('Failed to fetch')), 'unreachable');
  assert.equal(renewalFailure(Object.assign(new Error('Network timed out'), { name: 'ErrorTimeout' })), 'unreachable');
  assert.equal(renewalFailure(Object.assign(new Error('invalid_grant'), { name: 'ErrorResponse' })), 'refused');
  assert.equal(renewalFailure(new Error('No silent_redirect_uri configured')), 'refused');
  assert.equal(renewalFailure(null), 'refused');
});

test('a sign-in that failed says why by the kind of its error, never by its message, and guesses at nothing', () => {
  // react-oidc-context hands the screen the error's name and message.
  assert.equal(signInFailureReason({ name: 'TypeError', message: 'Failed to fetch' }), "Can't reach the sign-in service.");
  assert.equal(signInFailureReason({ name: 'ErrorTimeout', message: 'IFrame timed out without a response' }), "Can't reach the sign-in service.");
  assert.equal(signInFailureReason(new TypeError('Failed to fetch')), "Can't reach the sign-in service.");
  assert.equal(signInFailureReason({ name: 'ErrorResponse', message: 'access_denied' }), "The sign-in service didn't accept the request.");
  assert.equal(signInFailureReason({ name: 'Error', message: 'No matching state found in storage' }), "The sign-in didn't finish.");
  for (const e of [{ name: 'TypeError' }, { name: 'ErrorResponse' }, { name: 'Error' }, null]) {
    assert.doesNotMatch(signInFailureReason(e), /please|your (network|connection)|try again|cookies/i);
  }
});
