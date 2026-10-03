// node --test (type stripping, Node >= 22.18). Excluded from the app's tsc program.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { slotLinkHref, substitute } from './extensions.ts';

const PAGE = 'https://media.example/chino/search?q=zz';

test('a link on the instance itself: portal-relative, query-relative, or absolute on the same origin', () => {
  assert.equal(slotLinkHref('/portal/app/sample?q=zz', PAGE), 'https://media.example/portal/app/sample?q=zz');
  assert.equal(slotLinkHref('?q=other', PAGE), 'https://media.example/chino/search?q=other');
  assert.equal(slotLinkHref('https://media.example/portal/app/sample', PAGE), 'https://media.example/portal/app/sample');
  // The default port is the same origin.
  assert.equal(slotLinkHref('https://media.example:443/portal/', PAGE), 'https://media.example/portal/');
});

test('a script URL renders nothing, however it is spelled', () => {
  for (const raw of [
    'javascript:void(document.title="x")',
    'JavaScript:alert(1)',
    ' javascript:alert(1)',
    'java\tscript:alert(1)',
    'java\nscript:alert(1)',
    'data:text/html,<script>alert(1)</script>',
    'vbscript:msgbox(1)',
  ]) {
    assert.equal(slotLinkHref(raw, PAGE), null, raw);
  }
});

test('another origin renders nothing: another host, another scheme or port, protocol-relative, credentials', () => {
  for (const raw of [
    'https://addon.invalid/landing',
    '//addon.invalid/landing',
    '\\\\addon.invalid/landing',
    'http://media.example/portal/',
    'https://media.example:8443/portal/',
    'https://user:secret@media.example/portal/',
    'ftp://media.example/file',
    'mailto:someone@media.example',
  ]) {
    assert.equal(slotLinkHref(raw, PAGE), null, raw);
  }
});

test('no URL, an empty one, or not a string at all: nothing', () => {
  for (const raw of [undefined, null, '', '   ', 42, {}, ['/x']]) {
    assert.equal(slotLinkHref(raw, PAGE), null, String(raw));
  }
});

test('{q} is substituted encoded, before the URL is checked', () => {
  assert.equal(
    slotLinkHref('/portal/app/sample?q={q}', PAGE, { q: 'zz&qq=1 <x> "y"#w' }),
    'https://media.example/portal/app/sample?q=zz%26qq%3D1%20%3Cx%3E%20%22y%22%23w',
  );
  // A query cannot turn a relative link into a script or another host.
  assert.equal(slotLinkHref('{q}', PAGE, { q: 'javascript:alert(1)' }), 'https://media.example/chino/javascript%3Aalert(1)');
  assert.equal(slotLinkHref('https://{q}/x', PAGE, { q: 'addon.invalid' }), null);
  assert.equal(substitute('/x?a={a}&b={b}', { a: '1 2' }), '/x?a=1%202&b=');
  // Only own properties: {constructor} is not a var.
  assert.equal(substitute('/x?c={constructor}', {}), '/x?c=');
});
