// node --test (type stripping, Node >= 22.18): the notices as chino-api
// answers them, where one may lead, and the list after each change.
// Excluded from the app's tsc program.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  NOTICES_PATH,
  ageText,
  badgeText,
  bellLabel,
  fromText,
  loadNotices,
  markAllRead,
  markRead,
  noticeChangeRoute,
  noticeHref,
  noticeItemPath,
  noticeListOf,
  noticeTarget,
  noticesAnswer,
  removeNotice,
  sendNoticeChange,
  type Notice,
  type NoticeCall,
  type NoticeList,
} from './notices.ts';

const page = 'https://media.example.org/chino/';
const now = Date.parse('2026-10-05T08:00:00Z');

const notice = (over: Partial<Notice> = {}): Notice => ({
  id: '00000001-0000-4000-8000-000000000001',
  addon: 'example',
  addonTitle: 'Example',
  addonIcon: 'puzzle',
  title: 'Your title is ready',
  body: 'It is in your library now.',
  link: '',
  itemId: '',
  createdAt: '2026-10-05T07:58:00Z',
  readAt: null,
  ...over,
});

/** A fake chino-api: answers every call with [status] and [body] (JSON when
 *  an object, as writeJSON sends it; plain text when a string), and records
 *  what was sent. */
function fakeServer(status: number, body?: object | string) {
  const sent: { url: string; init: NoticeCall }[] = [];
  const fetch = async (url: string, init: NoticeCall): Promise<Response> => {
    sent.push({ url, init });
    if (body === undefined) return new Response(null, { status });
    if (typeof body === 'string') {
      return new Response(body, { status, headers: { 'Content-Type': 'text/html; charset=utf-8' } });
    }
    return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
  };
  return { sent, fetch };
}

const offline = async (): Promise<Response> => {
  throw new TypeError('Failed to fetch');
};

// What chino-api answers is read as it came: a notice without an id it would
// take back, or without a title, is none; a missing field is empty; and the
// unread count holds the unread notices listed.
test('a list is read defensively', () => {
  const got = noticeListOf({
    notices: [
      notice(),
      { id: 'x' },
      { title: 'no id' },
      null,
      'a string',
      { id: 'y', title: 'bare', readAt: '2026-10-05T07:59:00Z', link: 7 },
    ],
    unread: 1,
    available: true,
  });
  assert.equal(got.notices.length, 2);
  assert.equal(got.notices[1].link, '');
  assert.equal(got.notices[1].readAt, '2026-10-05T07:59:00Z');
  assert.equal(got.notices[1].addonTitle, '');
  assert.equal(got.unread, 1);
  assert.deepEqual(noticeListOf(null), { notices: [], unread: 0 });
  assert.deepEqual(noticeListOf({ notices: 'no' }), { notices: [], unread: 0 });
  // An unread count below what is listed unread is not believed.
  assert.equal(noticeListOf({ notices: [notice(), notice({ id: 'b' })], unread: 0 }).unread, 2);
  assert.equal(noticeListOf({ notices: [notice()], unread: -3 }).unread, 1);
  assert.equal(noticeListOf({ notices: [], unread: 7 }).unread, 7);
  // The order is chino-api's: newest first.
  assert.deepEqual(
    noticeListOf({ notices: [notice({ id: 'new' }), notice({ id: 'old' })] }).notices.map((n) => n.id),
    ['new', 'old'],
  );
});

test('a notice whose id chino-api would not take back is none: nothing else goes into a path', () => {
  for (const id of ['..', '.', 'a/b', '../me', 'a%2Fb', 'a?b', 'a#b', 'a b', 'x'.repeat(65), 7]) {
    assert.equal(noticeListOf({ notices: [notice({ id: id as string })] }).notices.length, 0, String(id));
  }
  assert.equal(noticeListOf({ notices: [notice({ id: 'x'.repeat(64) })] }).notices.length, 1);
});

// chino-api answers the list 200 whatever happens behind it; available false
// says portal-api did not answer, and its empty list says nothing.
test('a list only where chino-api says portal-api answered', () => {
  assert.deepEqual(noticesAnswer({ notices: [notice()], unread: 1, available: true }), {
    kind: 'list',
    list: { notices: [notice()], unread: 1 },
  });
  for (const body of [
    { notices: [], unread: 0, available: false },
    { notices: [notice()], unread: 1, available: false },
    { notices: [notice()], unread: 1 },
    { notices: [notice()], unread: 1, available: 'true' },
    null,
    'a string',
    [],
  ]) {
    assert.deepEqual(noticesAnswer(body), { kind: 'unavailable' }, JSON.stringify(body));
  }
});

test('the list is asked for with the bearer in the header, never in the URL', async () => {
  const server = fakeServer(200, { notices: [], unread: 0, available: true });
  await loadNotices({ token: 'tok-secret', fetch: server.fetch });
  assert.equal(server.sent.length, 1);
  const [{ url, init }] = server.sent;
  assert.equal(url, NOTICES_PATH);
  assert.equal(url, '/api/v1/notices');
  assert.equal(init.method, 'GET');
  assert.equal(new Headers(init.headers).get('Authorization'), 'Bearer tok-secret');
  assert.equal(url.includes('tok-secret'), false);
  assert.equal(url.includes('stream='), false);
});

test('what each answer to the list comes to', async () => {
  const listed = fakeServer(200, { notices: [notice()], unread: 1, available: true });
  assert.deepEqual(await loadNotices({ token: 't', fetch: listed.fetch }), {
    kind: 'list',
    list: { notices: [notice()], unread: 1 },
  });
  // No portal-api behind chino-api, or one that does not answer: nothing to show.
  const down = fakeServer(200, { notices: [], unread: 0, available: false });
  assert.deepEqual(await loadNotices({ token: 't', fetch: down.fetch }), { kind: 'unavailable' });
  // A chino-api older than notices.
  const old = fakeServer(404, '404 page not found\n');
  assert.deepEqual(await loadNotices({ token: 't', fetch: old.fetch }), { kind: 'unavailable' });
  // A page in place of JSON.
  const page200 = fakeServer(200, '<!doctype html><title>chino</title>');
  assert.deepEqual(await loadNotices({ token: 't', fetch: page200.fetch }), { kind: 'unavailable' });
  // No answer from chino-api: the app keeps what it shows.
  for (const status of [401, 500, 502, 503]) {
    const failing = fakeServer(status, 'upstream connect error\n');
    assert.deepEqual(await loadNotices({ token: 't', fetch: failing.fetch }), { kind: 'failed' }, String(status));
  }
  assert.deepEqual(await loadNotices({ token: 't', fetch: offline }), { kind: 'failed' });
});

test('each change goes to its route, and only with an id chino-api takes', () => {
  const id = '00000001-0000-4000-8000-000000000001';
  assert.deepEqual(noticeChangeRoute({ kind: 'read', id }), { method: 'POST', path: `/api/v1/notices/${id}/read` });
  assert.deepEqual(noticeChangeRoute({ kind: 'read-all' }), { method: 'POST', path: '/api/v1/notices/read-all' });
  assert.deepEqual(noticeChangeRoute({ kind: 'delete', id }), { method: 'DELETE', path: `/api/v1/notices/${id}` });
  for (const bad of ['', '..', '../../me', 'a/b', 'a%2F..', 'a?b', 'x'.repeat(65)]) {
    assert.equal(noticeChangeRoute({ kind: 'read', id: bad }), null, bad);
    assert.equal(noticeChangeRoute({ kind: 'delete', id: bad }), null, bad);
  }
});

test('a change is sent with the bearer in the header, and kept alive past the page', async () => {
  const server = fakeServer(200, { unread: 0 });
  assert.equal(await sendNoticeChange({ token: 'tok-secret', change: { kind: 'read', id: 'a-1' }, fetch: server.fetch }), true);
  const [{ url, init }] = server.sent;
  assert.equal(url, '/api/v1/notices/a-1/read');
  assert.equal(init.method, 'POST');
  assert.equal(init.keepalive, true);
  assert.equal(new Headers(init.headers).get('Authorization'), 'Bearer tok-secret');
  assert.equal(url.includes('tok-secret'), false);
  // A delete answers 204.
  const deleted = fakeServer(204);
  assert.equal(await sendNoticeChange({ token: 't', change: { kind: 'delete', id: 'a-1' }, fetch: deleted.fetch }), true);
  assert.equal(deleted.sent[0].init.method, 'DELETE');
});

// A change chino-api did not make leaves the app to read the list again.
test('a change chino-api did not make is false, never a throw', async () => {
  for (const [status, body] of [
    [404, { error: 'not_found', message: 'No such notice.' }],
    [502, { error: 'notices_unavailable', message: 'Notices cannot be changed right now. Try again later.' }],
    [503, { error: 'notices_unavailable', message: 'This server keeps no notices.' }],
    [401, 'unauthorized\n'],
  ] as const) {
    const server = fakeServer(status, body);
    assert.equal(await sendNoticeChange({ token: 't', change: { kind: 'read-all' }, fetch: server.fetch }), false, String(status));
  }
  assert.equal(await sendNoticeChange({ token: 't', change: { kind: 'read', id: 'a' }, fetch: offline }), false);
  // An id chino-api would not take is not sent at all.
  const server = fakeServer(200, { unread: 0 });
  assert.equal(await sendNoticeChange({ token: 't', change: { kind: 'delete', id: '../me' }, fetch: server.fetch }), false);
  assert.equal(server.sent.length, 0);
});

test('the bell says how many are unread', () => {
  assert.equal(badgeText(0), '');
  assert.equal(badgeText(-1), '');
  assert.equal(badgeText(Number.NaN), '');
  assert.equal(badgeText(1), '1');
  assert.equal(badgeText(99), '99');
  assert.equal(badgeText(100), '99+');
  assert.equal(bellLabel(0), 'Notices');
  assert.equal(bellLabel(3), 'Notices, 3 unread');
});

test('a notice says whom it is from and when', () => {
  assert.equal(fromText(notice()), 'Example');
  assert.equal(fromText(notice({ addonTitle: '  ' })), 'example');
  assert.equal(fromText(notice({ addonTitle: '', addon: '' })), 'An addon');
  assert.equal(ageText('2026-10-05T07:59:30Z', now), 'now');
  // A clock a little ahead of the browser's is now, too.
  assert.equal(ageText('2026-10-05T08:00:20Z', now), 'now');
  assert.equal(ageText('2026-10-05T07:55:00Z', now), '5m');
  assert.equal(ageText('2026-10-05T05:00:00Z', now), '3h');
  assert.equal(ageText('2026-10-03T08:00:00Z', now), '2d');
  // From a week on, its day in the browser's time zone, whichever that is.
  const localNoon = (month: number, day: number) => new Date(2026, month - 1, day, 12).toISOString();
  assert.equal(ageText(localNoon(9, 12), now), 'Sep 12');
  assert.equal(ageText(localNoon(7, 28), now), 'Jul 28');
  assert.equal(ageText('not a time', now), '');
  assert.equal(ageText('', now), '');
});

// A link is followed only to an http(s) page of this origin: what the
// server's rule takes, and nothing it refuses — checked again here, since the
// app is where it is clicked. The portal's bell holds the same table.
test('a link leads only to this server', () => {
  for (const [link, want] of [
    ['/portal/app/example', 'https://media.example.org/portal/app/example'],
    ['/portal/app/example?q=x#/ready', 'https://media.example.org/portal/app/example?q=x#/ready'],
    ['https://media.example.org/portal/app/example', 'https://media.example.org/portal/app/example'],
    ['HTTPS://MEDIA.EXAMPLE.ORG/x', 'https://media.example.org/x'],
    ['  /x  ', 'https://media.example.org/x'],
    // Into chino itself, as portal-api makes a path absolute on the instance.
    ['https://media.example.org/chino/i/item-1', 'https://media.example.org/chino/i/item-1'],
    ['/chino/search?q=a%20b', 'https://media.example.org/chino/search?q=a%20b'],
    // The default port is the same origin.
    ['https://media.example.org:443/x', 'https://media.example.org/x'],
  ] as const) {
    assert.equal(noticeHref(link, page), want, link);
  }
  for (const link of [
    '',
    'javascript:alert(document.cookie)',
    'JavaScript:alert(1)',
    ' javascript:alert(1)',
    'java\tscript:alert(1)',
    'data:text/html,<script>alert(1)</script>',
    'vbscript:msgbox(1)',
    'https://elsewhere.example/x',
    'http://media.example.org/x', // another scheme is another origin
    'https://media.example.org:8443/x', // and another port
    'https://media.example.org.elsewhere.example/x',
    'https://elsewhere.example\\@media.example.org/x',
    '//elsewhere.example/x',
    '//media.example.org/x',
    '/\\elsewhere.example/x',
    '\\\\elsewhere.example/x',
    '/\t/elsewhere.example/x',
    'https://user:pass@media.example.org/x',
    'https://user@media.example.org/x',
    'portal/app/example',
    '?q=x',
    '#/x',
    'mailto:someone@example.org',
    'ftp://media.example.org/file',
  ]) {
    assert.equal(noticeHref(link, page), null, link);
  }
  // At the root of a server, as on a neutral install.
  assert.equal(noticeHref('/i/item-1', 'https://example.com/'), 'https://example.com/i/item-1');
  assert.equal(noticeHref('/i/item-1', 'not a page'), null);
});

test('an item opens on the item route, and only an id portal-api takes', () => {
  assert.equal(noticeItemPath('item-1'), '/i/item-1');
  assert.equal(noticeItemPath(' 4f3a9c1e-0b7a-4c55-9d1e-2a4f6b8c0d1e '), '/i/4f3a9c1e-0b7a-4c55-9d1e-2a4f6b8c0d1e');
  assert.equal(noticeItemPath('tmdb:603'), '/i/tmdb%3A603');
  assert.equal(noticeItemPath('a.b_c-d'), '/i/a.b_c-d');
  assert.equal(noticeItemPath('x'.repeat(128)), `/i/${'x'.repeat(128)}`);
  for (const id of ['', '..', '.hidden', '../me', 'a/b', 'a b', 'a?b', 'a#b', 'a%2Fb', '<b>', 'x'.repeat(129)]) {
    assert.equal(noticeItemPath(id), null, id);
  }
});

test('opening a notice leads to its item first, else to its link on this server', () => {
  assert.deepEqual(noticeTarget(notice({ itemId: 'item-1', link: '/portal/app/example' }), page), {
    kind: 'item',
    path: '/i/item-1',
  });
  assert.deepEqual(noticeTarget(notice({ link: '/portal/app/example' }), page), {
    kind: 'link',
    href: 'https://media.example.org/portal/app/example',
  });
  // An item that is none leaves the link.
  assert.deepEqual(noticeTarget(notice({ itemId: '../me', link: '/portal/app/example' }), page), {
    kind: 'link',
    href: 'https://media.example.org/portal/app/example',
  });
  // Neither: opening it only reads it.
  assert.equal(noticeTarget(notice(), page), null);
  assert.equal(noticeTarget(notice({ link: 'https://elsewhere.example/x' }), page), null);
  assert.equal(noticeTarget(notice({ link: 'javascript:alert(1)', itemId: '..' }), page), null);
});

test('reading, reading all and deleting keep the count', () => {
  const list: NoticeList = {
    notices: [notice({ id: 'a' }), notice({ id: 'b' }), notice({ id: 'c', readAt: '2026-10-05T07:00:00Z' })],
    unread: 2,
  };
  const read = markRead(list, 'a', '2026-10-05T08:00:00Z');
  assert.equal(read.unread, 1);
  assert.equal(read.notices[0].readAt, '2026-10-05T08:00:00Z');
  assert.equal(list.notices[0].readAt, null, 'the list it was given stays as it was');
  assert.equal(markRead(read, 'a', 'later').unread, 1, 'reading again changes nothing');
  assert.equal(markRead(read, 'c', 'later').notices[2].readAt, '2026-10-05T07:00:00Z');
  assert.equal(markRead(list, 'none', 'later').unread, 2);
  const all = markAllRead(list, 'now');
  assert.equal(all.unread, 0);
  assert.ok(all.notices.every((n) => n.readAt !== null));
  assert.equal(all.notices[2].readAt, '2026-10-05T07:00:00Z');
  assert.deepEqual(removeNotice(list, 'b').notices.map((n) => n.id), ['a', 'c']);
  assert.equal(removeNotice(list, 'b').unread, 1);
  assert.equal(removeNotice(list, 'c').unread, 2, 'a read one takes nothing off the count');
  assert.equal(removeNotice({ notices: [notice({ id: 'a' })], unread: 0 }, 'a').unread, 0);
});
