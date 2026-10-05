// node --test (type stripping, Node >= 22.18). Excluded from the app's tsc program.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  TRAILER_KINDS,
  extraMasterUrl,
  findExtra,
  localTrailer,
  pickTrailer,
  trailerChoice,
  trailerFailure,
  trailerPath,
  trailerPlayBatch,
} from './trailers.ts';

const ITEM = '9c4e7a12-0000-4000-8000-000000000001';
const extra = (id: string, kind: string, more: Record<string, unknown> = {}) => ({
  id,
  kind,
  title: kind,
  local: true,
  play_path: `/api/v1/items/${ITEM}/extras/${id}/play/master.m3u8`,
  ...more,
});
const yt = (key: string, title: string) => ({
  site: 'YouTube',
  external_id: key,
  url: `https://www.youtube.com/watch?v=${key}`,
  title,
});

test('a trailer, then a teaser', () => {
  assert.deepEqual([...TRAILER_KINDS], ['trailer', 'teaser']);
  assert.equal(localTrailer([extra('t1', 'teaser'), extra('tr', 'trailer')])?.id, 'tr');
  assert.equal(localTrailer([extra('t1', 'teaser'), extra('f', 'featurette')])?.id, 't1');
});

test('among equals, the first in the order the server listed them', () => {
  assert.equal(localTrailer([extra('a', 'trailer'), extra('b', 'trailer')])?.id, 'a');
  assert.equal(localTrailer([extra('f', 'featurette'), extra('x', 'teaser'), extra('y', 'teaser')])?.id, 'x');
});

test("a trailer beats a teaser whatever the season: a season's trailer before the whole title's teaser", () => {
  const seasonTrailer = extra('s2-trailer', 'trailer', { season_number: 2 });
  const wholeTeaser = extra('teaser', 'teaser');
  assert.equal(localTrailer([wholeTeaser, seasonTrailer])?.id, 's2-trailer');
  assert.equal(localTrailer([seasonTrailer, wholeTeaser])?.id, 's2-trailer');
  // A season 0 (the specials) is a season too.
  assert.equal(localTrailer([extra('w', 'teaser'), extra('sp', 'trailer', { season_number: 0 })])?.id, 'sp');
});

test("within a kind, the whole title's extra before a season's, then the server's order", () => {
  const s2 = extra('s2', 'trailer', { season_number: 2 });
  const s1 = extra('s1', 'trailer', { season_number: 1 });
  assert.equal(localTrailer([s2, extra('whole', 'trailer')])?.id, 'whole');
  assert.equal(localTrailer([extra('t-s1', 'teaser', { season_number: 1 }), extra('t', 'teaser')])?.id, 't');
  // Only seasons: the first of them in the server's order.
  assert.equal(localTrailer([s2, s1])?.id, 's2');
  assert.equal(localTrailer([extra('t', 'teaser', { season_number: 1 }), s1, s2])?.id, 's1');
});

test('no trailer: none of those kinds, nothing that plays here, no extras', () => {
  assert.equal(localTrailer([extra('f', 'featurette'), extra('b', 'behind-the-scenes')]), null);
  assert.equal(localTrailer([extra('r', 'trailer', { local: false }), extra('p', 'trailer', { play_path: '' })]), null);
  assert.equal(localTrailer([extra('', 'trailer')]), null);
  assert.equal(localTrailer([]), null);
  assert.equal(localTrailer(undefined), null);
  assert.equal(localTrailer(null), null);
});

test('it plays here only with local: true - not when local is left out', () => {
  const { local: _local, ...unflagged } = extra('u', 'trailer');
  assert.equal(localTrailer([unflagged as never]), null);
  assert.equal(findExtra([unflagged as never], 'u'), null);
  assert.equal(localTrailer([unflagged as never, extra('ok', 'teaser')])?.id, 'ok');
});

test('a kind in capitals is still that kind', () => {
  assert.equal(localTrailer([extra('T', 'Trailer')])?.id, 'T');
});

test('the trailer page finds its extra by id, of any kind that plays here', () => {
  const list = [extra('tr', 'trailer'), extra('ft', 'featurette'), extra('gone', 'trailer', { play_path: '' })];
  assert.equal(findExtra(list, 'ft')?.id, 'ft');
  assert.equal(findExtra(list, 'gone'), null);
  assert.equal(findExtra(list, 'nope'), null);
  assert.equal(findExtra(undefined, 'tr'), null);
});

test("today's link pick: YouTube, an official trailer, any trailer, the first", () => {
  const vimeo = { site: 'Vimeo', url: 'https://vimeo.com/1', title: 'Official Trailer' };
  assert.equal(pickTrailer([vimeo, yt('a', 'Teaser'), yt('b', 'Official Trailer')])?.external_id, 'b');
  assert.equal(pickTrailer([yt('a', 'Teaser'), yt('b', 'Trailer 2')])?.external_id, 'b');
  assert.equal(pickTrailer([yt('a', 'Teaser'), yt('b', 'Clip')])?.external_id, 'a');
  assert.equal(pickTrailer([vimeo])?.url, 'https://vimeo.com/1');
  assert.equal(pickTrailer([]), null);
  assert.equal(pickTrailer(undefined), null);
});

test('the Trailer: the local trailer first, else the link, else none', () => {
  const links = [yt('x1', 'Official Trailer')];
  const local = trailerChoice({ extras: [extra('tr', 'trailer')], trailers: links });
  assert.equal(local?.local, true);
  assert.equal(local?.local === true ? local.extra.id : null, 'tr');

  // Extras, but none a trailer: the link.
  const link = trailerChoice({ extras: [extra('f', 'featurette')], trailers: links });
  assert.equal(link?.local, false);
  assert.equal(link?.local === false ? link.link.url : null, 'https://www.youtube.com/watch?v=x1');

  // A server older than extras sends none: the link, as before.
  assert.equal(trailerChoice({ trailers: links })?.local, false);
  assert.equal(trailerChoice({ extras: [extra('tr', 'teaser')] })?.local, true);
  assert.equal(trailerChoice({}), null);
  assert.equal(trailerChoice({ trailers: [{ site: 'YouTube', url: '' }] }), null);
  assert.equal(trailerChoice(null), null);
});

test('the trailer page path carries both ids, escaped', () => {
  assert.equal(trailerPath('a b', 'c/d'), '/trailer/a%20b/c%2Fd');
  assert.equal(trailerPath(ITEM, 'x1'), `/trailer/${ITEM}/x1`);
});

test("an extra's master: the stream token and the caps, as a title's", () => {
  const path = `/api/v1/items/${ITEM}/extras/x1/play/master.m3u8`;
  assert.equal(extraMasterUrl(path, { stream: 't k+n', caps: 'avc,hvc:1080,aac' }), `${path}?stream=t+k%2Bn&caps=avc%2Chvc%3A1080%2Caac`);
  assert.equal(extraMasterUrl(path, { stream: 'tok' }), `${path}?stream=tok`);
  assert.equal(extraMasterUrl(`${path}?x=1`, { stream: 'tok', caps: 'avc' }), `${path}?x=1&stream=tok&caps=avc`);
  const back = new URL(extraMasterUrl(path, { stream: 't k+n', caps: 'avc,aac' }), 'https://example.org');
  assert.equal(back.searchParams.get('stream'), 't k+n');
  assert.equal(back.searchParams.get('caps'), 'avc,aac');
});

test('not there (400, 404, 410) is not available; anything else failed', () => {
  for (const s of [400, 404, 410]) assert.equal(trailerFailure(s), 'not-found');
  for (const s of [401, 403, 500, 502, 503, 0, null, undefined]) assert.equal(trailerFailure(s), 'failed');
});

test('one trailer_play event: the title, the extra, local', () => {
  assert.deepEqual(trailerPlayBatch({ sessionId: 's1', itemId: ITEM, extraId: 'x1', ts: 1759651200000 }), {
    sessionId: 's1',
    events: [{ ts: 1759651200000, kind: 'trailer_play', itemId: ITEM, payload: { extraId: 'x1', local: true } }],
  });
});
