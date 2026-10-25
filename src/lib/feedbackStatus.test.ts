// node --test (type stripping, Node >= 22.18). Excluded from the app's tsc program.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { featuresFrom } from './runtimeConfig.ts';
import { BUG_REPORT, FeedbackOffError, feedbackError, feedbackFailure, feedbackFiled, reportDescription } from './feedbackStatus.ts';

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

test('a report that could not be filed says why, and never asks to try again', () => {
  assert.equal(feedbackFailure(feedbackError(502)), "Couldn't file the report. The server ran into a problem.");
  assert.equal(feedbackFailure(feedbackError(429)), "Couldn't file the report. The server is busy.");
  assert.equal(feedbackFailure(new TypeError('Failed to fetch')), "Couldn't file the report. Can't reach the server.");
  assert.equal(feedbackFailure(feedbackError(503)), "Bug reporting is switched off on this server, so this report can't be filed.");
  for (const s of [400, 401, 403, 413, 500]) assert.doesNotMatch(feedbackFailure(feedbackError(s)), /please|in a moment|try again/i, String(s));
});

test('the bug-report dialog: its title and buttons lowercase for the mono face, a verb and its object, never "submit"', () => {
  for (const w of [BUG_REPORT.title, BUG_REPORT.cancel, BUG_REPORT.send, BUG_REPORT.close, BUG_REPORT.retake]) assert.equal(w, w.toLowerCase());
  assert.equal(BUG_REPORT.cancel, 'cancel');
  assert.equal(BUG_REPORT.send, 'send report');
  assert.doesNotMatch(BUG_REPORT.send, /submit/i);
});

test("the bug-report dialog's messages: no \"please\", no exclamation marks; a report goes to the people who run this server", () => {
  const messages = [BUG_REPORT.describe, BUG_REPORT.thanks, feedbackFiled(false), feedbackFiled(true)];
  for (const m of messages) {
    assert.doesNotMatch(m, /please|!|ticket|backlog/i, m);
    // The body face: sentence case.
    assert.match(m, /^[A-Z]/, m);
  }
  assert.equal(feedbackFiled(false), 'It went to the people who run this server as');
  assert.match(feedbackFiled(true), /^The people who run this server already have this one\. /);
});

test('a report is filed with the viewer\'s words first, the details the app adds in a part of their own', () => {
  const tech = 'hls networkError manifestLoadError\nstatus 502\nitem 6f1c-42';
  const filed = reportDescription('  The film stopped after the opening titles.  ', tech);
  // The viewer's words, as they typed them, first and alone on their line.
  assert.ok(filed.startsWith('The film stopped after the opening titles.\n\n'));
  // Then the details, fenced, every line kept.
  assert.ok(filed.endsWith('```\nhls networkError manifestLoadError\nstatus 502\nitem 6f1c-42\n```'));
  assert.match(filed, /\*\*Details\*\*/);
  // No details: the words alone.
  assert.equal(reportDescription('It froze.', undefined), 'It froze.');
  assert.equal(reportDescription('It froze.', '  '), 'It froze.');
  // Details with a fence of their own get a longer one.
  const fenced = reportDescription('It froze.', 'a ``` b');
  assert.ok(fenced.includes('````\na ``` b\n````'));
});

test('the dialog\'s details part: named "details" in the mono face, said to go with the report', () => {
  assert.equal(BUG_REPORT.details, 'details');
  assert.equal(BUG_REPORT.detailsSent, 'Sent with the report.');
  // What the viewer edits says nothing of the app's own words.
  for (const w of Object.values(BUG_REPORT)) assert.doesNotMatch(w, /this item|manifestLoadError|technical details/i);
});
