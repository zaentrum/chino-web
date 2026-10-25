// node --test (type stripping, Node >= 22.18). Excluded from the app's tsc program.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  HttpError,
  NO_ACCESS,
  REFUSED,
  TRY_AGAIN,
  canTryAgain,
  caseOf,
  couldntLoad,
  failureCase,
  failureDetails,
  startupFailure,
  failureReason,
  failureStatus,
  removedTitle,
  returnPath,
  streamFailureReason,
} from './loadFailure.ts';

test('the case by the status alone: no answer, the server, busy, not accepted', () => {
  // The design system's cases by cause, word for word.
  assert.equal(failureReason(failureCase(null, 'list')), "Can't reach the server.");
  assert.equal(failureReason(failureCase(408, 'list')), "Can't reach the server.");
  for (const s of [500, 502, 503, 504]) assert.equal(failureReason(failureCase(s, 'list')), 'The server ran into a problem.', String(s));
  assert.equal(failureReason(failureCase(429, 'list')), 'The server is busy.');
  // A request not accepted, as the web says it: never an app update to
  // check for - a web page updates itself.
  for (const s of [400, 405, 409, 415, 422]) {
    assert.equal(failureReason(failureCase(s, 'list')), "The server didn't accept the request.", String(s));
  }
  // On a list screen a list can't be removed: 404 and 410 mean the app and
  // the server don't match.
  assert.equal(failureCase(404, 'list'), 'refused');
  assert.equal(failureCase(410, 'list'), 'refused');
  // On a page of one thing, it was removed: back, not try again.
  assert.equal(failureCase(404, 'one'), 'removed');
  assert.equal(failureCase(410, 'one'), 'removed');
  assert.equal(failureCase(403, 'one'), 'no-access');
  assert.equal(failureCase(401, 'list'), 'signed-out');
  for (const kind of ['removed', 'no-access', 'signed-out'] as const) {
    assert.equal(canTryAgain(kind), false, kind);
    assert.equal(failureReason(kind), '', kind);
  }
  for (const kind of ['unreachable', 'server', 'busy', 'refused'] as const) assert.equal(canTryAgain(kind), true, kind);
});

test('a 401 that stays one after signing in again says so, and no app update can help', () => {
  // lib/signInAgain.ts: renewed, signed in, and the server still says 401.
  assert.equal(failureReason('sign-in-refused'), "The server didn't accept your sign-in.");
  assert.doesNotMatch(failureReason('sign-in-refused'), /app update|please|try again/i);
  assert.equal(canTryAgain('sign-in-refused'), true);
});

test("an error's status, never its message", () => {
  assert.equal(failureStatus(new HttpError(503)), 503);
  // The Watchlist's helpers carry the status on the error.
  assert.equal(failureStatus(Object.assign(new Error('name exists'), { status: 409 })), 409);
  // The network: fetch rejects with a TypeError - no answer.
  assert.equal(failureStatus(new TypeError('Failed to fetch')), null);
  assert.equal(caseOf(new TypeError('Failed to fetch'), 'list'), 'unreachable');
  // A message that looks like a status is still no answer.
  assert.equal(caseOf(new Error('chino-api 503'), 'list'), 'unreachable');
  // An answer that couldn't be read is the server's.
  assert.equal(caseOf(new SyntaxError('Unexpected token <'), 'list'), 'server');
  assert.equal(caseOf(null, 'list'), 'unreachable');
});

test("the words: the screen's own in the title, the reason alone in the description, try again on the button", () => {
  assert.equal(couldntLoad('the movies'), "couldn't load the movies");
  assert.equal(couldntLoad('this title'), "couldn't load this title");
  assert.equal(removedTitle('title'), "this title isn't in the library anymore");
  assert.equal(removedTitle('person'), "this person isn't in the library anymore");
  assert.equal(NO_ACCESS, "you don't have access to this");
  assert.equal(TRY_AGAIN, 'try again');
  // No reason asks to try again, says please, or guesses at the viewer's
  // connection.
  for (const kind of ['unreachable', 'server', 'busy', 'refused'] as const) {
    assert.doesNotMatch(failureReason(kind), /try again|please|your connection|in a moment/i, kind);
  }
});

test('details: the status and its reason phrase, for the people who fix things', () => {
  assert.equal(failureDetails(503), 'HTTP 503 Service Unavailable');
  assert.equal(failureDetails(429), 'HTTP 429 Too Many Requests');
  assert.equal(failureDetails(418), 'HTTP 418');
  assert.equal(failureDetails(null), null);
});

test('a refused sign-in comes back to the page of this site it was on', () => {
  assert.equal(returnPath({ returnTo: '/movies?genre=Drama' }), '/movies?genre=Drama');
  assert.equal(returnPath({ returnTo: '/chino/i/abc' }), '/chino/i/abc');
  for (const bad of ['https://elsewhere.example/', '//elsewhere.example/x', '/\\elsewhere', '/auth/callback?code=1', 'movies', 42]) {
    assert.equal(returnPath({ returnTo: bad }), null, String(bad));
  }
  assert.equal(returnPath(undefined), null);
  assert.equal(returnPath('/movies'), null);
});

test("the player's give-up after every rung failed says the cause the same way", () => {
  // hls.js: 0 or none when nothing answered.
  assert.equal(streamFailureReason(0), "Can't reach the server.");
  assert.equal(streamFailureReason(null), "Can't reach the server.");
  assert.equal(streamFailureReason(undefined), "Can't reach the server.");
  // The server answered: no guess about the viewer's connection.
  assert.equal(streamFailureReason(502), 'The server ran into a problem.');
  assert.equal(streamFailureReason(429), 'The server is busy.');
  assert.equal(streamFailureReason(404), "The server didn't accept the request.");
  assert.equal(streamFailureReason(403), "The server didn't accept the request.");
  // A 401, after the player minted a new stream token: the sign-in the
  // server refused - never an app update.
  assert.equal(streamFailureReason(401), "The server didn't accept your sign-in.");
  for (const s of [0, 401, 403, 404, 429, 500]) assert.doesNotMatch(streamFailureReason(s), /please|unreachable|your connection/i, String(s));
});

test("the start-up screen: \"couldn't load the app\", the reason by /api/config's answer, never a guess at the connection", () => {
  const says = (e: unknown) => {
    const { title, reason, status } = startupFailure(e);
    return [title, reason, failureDetails(status)];
  };
  // Nothing answered.
  assert.deepEqual(says(new TypeError('Failed to fetch')), ["couldn't load the app", "Can't reach the server.", null]);
  // The server answered.
  assert.deepEqual(says(new HttpError(502, '/api/config')), ["couldn't load the app", 'The server ran into a problem.', 'HTTP 502 Bad Gateway']);
  assert.deepEqual(says(new HttpError(429, '/api/config')), ["couldn't load the app", 'The server is busy.', 'HTTP 429 Too Many Requests']);
  // No config route at the page's own address: no chino server answers
  // there - on the web no app update can help.
  assert.deepEqual(says(new HttpError(404, '/api/config')), [
    "couldn't load the app",
    'No chino server answers at this address.',
    'HTTP 404 Not Found',
  ]);
  assert.equal(startupFailure(new HttpError(410)).reason, 'No chino server answers at this address.');
  // A page instead of the config: an answer that couldn't be read.
  assert.deepEqual(says(new SyntaxError('/api/config returned non-JSON content-type "text/html"')), [
    "couldn't load the app",
    'The server ran into a problem.',
    'an answer that could not be read',
  ]);
  // Asked before anyone signs in: a 401 or a 403 is a request not accepted,
  // never an empty reason.
  for (const s of [400, 401, 403]) assert.equal(startupFailure(new HttpError(s)).reason, "The server didn't accept the request.");
  for (const s of [null, 0, 400, 401, 403, 404, 410, 429, 500, 503]) {
    const { reason } = startupFailure(s === null ? new TypeError('x') : s === 0 ? new SyntaxError('x') : new HttpError(s));
    assert.notEqual(reason, '');
    assert.doesNotMatch(reason, /please|network|configuration|try again/i, String(s));
    // Never an app update to check for: a web page has none.
    assert.doesNotMatch(reason, /app update/i, String(s));
  }
  // A list screen's "not found" still means the app and the server don't
  // match (docs/chino, playback) - on the web, the request not accepted,
  // without the TV's and the phone's app update.
  assert.equal(failureReason(caseOf(new HttpError(404), 'list')), "The server didn't accept the request.");
});

test('the web never says to check for an app update: not a screen, not the player, not a bug report', () => {
  assert.equal(REFUSED, "The server didn't accept the request.");
  assert.equal(failureReason('refused'), REFUSED);
  const statuses = [null, 0, 400, 401, 403, 404, 405, 408, 409, 410, 413, 415, 422, 429, 500, 502, 503, 504];
  for (const s of statuses) {
    for (const where of ['one', 'list'] as const) {
      assert.doesNotMatch(failureReason(failureCase(s, where)), /app update|update the app/i, `${s} ${where}`);
    }
    assert.doesNotMatch(streamFailureReason(s), /app update/i, String(s));
    assert.doesNotMatch(startupFailure(s === null ? new TypeError('x') : s === 0 ? new SyntaxError('x') : new HttpError(s)).reason, /app update/i, String(s));
  }
  for (const kind of ['unreachable', 'server', 'busy', 'refused', 'removed', 'no-access', 'signed-out', 'sign-in-refused'] as const) {
    assert.doesNotMatch(failureReason(kind), /app update/i, kind);
  }
});
