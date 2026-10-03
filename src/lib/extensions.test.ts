// node --test (type stripping, Node >= 22.18). Excluded from the app's tsc program.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { slotActionUrl, slotButtons, slotKind, slotLinkHref, substitute } from './extensions.ts';

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

test('an action POSTs only to the portal\'s app proxy on this origin', () => {
  assert.equal(
    slotActionUrl('/api/portal/apps/sample/collect?q={q}', 'POST', PAGE, { q: 'a b' }),
    'https://media.example/api/portal/apps/sample/collect?q=a%20b',
  );
  assert.equal(slotActionUrl('https://media.example/api/portal/apps/sample', '', PAGE), 'https://media.example/api/portal/apps/sample');
  // No method means POST; the case does not matter.
  assert.equal(slotActionUrl('/api/portal/apps/sample/x', undefined, PAGE), 'https://media.example/api/portal/apps/sample/x');
  assert.equal(slotActionUrl('/api/portal/apps/sample/x', 'post', PAGE), 'https://media.example/api/portal/apps/sample/x');
});

test('an action with any other method renders nothing', () => {
  for (const method of ['GET', 'DELETE', 'PUT', 'PATCH', 'post ; DELETE', 7]) {
    assert.equal(slotActionUrl('/api/portal/apps/sample/x', method, PAGE), null, String(method));
  }
});

test('the bearer never leaves the origin, nor goes to chino-api or the portal itself', () => {
  for (const raw of [
    'https://addon-sim.invalid/collect',
    '//addon-sim.invalid/api/portal/apps/sample/x',
    'http://media.example/api/portal/apps/sample/x',
    '/api/v1/me/watchlists',
    '/api/portal/addons/sample',
    '/portal/app/sample',
    '/api/portal/apps/',
    '/api/portal/apps//x',
    // Climbing out of the proxy, plainly or encoded, is resolved before the check.
    '/api/portal/apps/sample/../../addons/sample',
    '/api/portal/apps/sample/%2e%2e/%2e%2e/addons',
    '/api/portal/apps/sample/..%2f..%2faddons',
    '/api/portal/apps/sample%5c..%5c..%5caddons',
    'javascript:fetch("/api/portal/apps/sample/x")',
  ]) {
    assert.equal(slotActionUrl(raw, 'POST', PAGE), null, raw);
  }
});

test('only links and actions are kinds', () => {
  assert.equal(slotKind('link'), 'link');
  assert.equal(slotKind(' Action '), 'action');
  for (const raw of ['iframe', 'script', '', undefined, null, 1]) assert.equal(slotKind(raw), null, String(raw));
});

test('slotButtons: what the review saw rendered, and what is left of it', () => {
  const rows = [
    { key: 'sim.kebab', kind: 'link', label: 'kebab icon list-video', icon: 'list-video', url: '/portal/app/sim?q={q}', enabled: true },
    { key: 'sim.js', kind: 'link', label: 'javascript: link', icon: 'zap', url: 'javascript:void(document.title="x")', enabled: true },
    { key: 'sim.offorigin', kind: 'action', label: 'action to another origin', icon: 'send', url: 'https://addon-sim.invalid/collect?q={q}', method: 'DELETE', enabled: true },
    { key: 'sim.iframe', kind: 'iframe', label: 'kind iframe', icon: 'frame', url: '/api/portal/apps/sim/frame', enabled: true },
    { key: 'sim.offsite', kind: 'link', label: 'off-site link', icon: 'puzzle', url: 'https://addon-sim.invalid/landing', enabled: true },
    { key: 'sim.action', kind: 'action', label: 'Request it', icon: 'download', url: '/api/portal/apps/sim/request?q={q}', method: 'POST', enabled: true },
    { key: 'sim.off', kind: 'link', label: 'disabled', url: '/portal/app/sim', enabled: false },
    { key: 'sim.nolabel', kind: 'link', label: '  ', url: '/portal/app/sim', enabled: true },
    null,
    'not a row',
  ];
  assert.deepEqual(slotButtons(rows, PAGE, { q: 'zz top' }), [
    { key: 'sim.kebab', kind: 'link', label: 'kebab icon list-video', icon: 'list-video', href: 'https://media.example/portal/app/sim?q=zz%20top' },
    { key: 'sim.action', kind: 'action', label: 'Request it', icon: 'download', href: 'https://media.example/api/portal/apps/sim/request?q=zz%20top' },
  ]);
  assert.deepEqual(slotButtons({ not: 'an array' }, PAGE), []);
  assert.deepEqual(slotButtons(undefined, PAGE), []);
});
