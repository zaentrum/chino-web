// node --test (type stripping, Node >= 22.18). Excluded from the app's tsc program.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { HERO_POOL_SIZE, heroPoolOrder, heroTrailer, shuffled, youTubeKey } from './heroPool.ts';

const extra = (id: string, kind = 'trailer', more: Record<string, unknown> = {}) => ({
  id,
  kind,
  title: kind,
  local: true,
  play_path: `/api/v1/items/m/extras/${id}/play/master.m3u8`,
  ...more,
});
const link = (url: string, title = 'Official Trailer', site = 'YouTube') => ({ site, url, title });

// A random() that returns these in turn, and 0 after.
const seq = (...xs: number[]) => () => (xs.length ? xs.shift()! : 0);

test('the YouTube id of a watch, a short or an embed link', () => {
  assert.equal(youTubeKey('https://www.youtube.com/watch?v=yUQM7H4Swgw'), 'yUQM7H4Swgw');
  assert.equal(youTubeKey('https://www.youtube.com/watch?feature=x&v=abc_DEF-12'), 'abc_DEF-12');
  assert.equal(youTubeKey('https://youtu.be/yUQM7H4Swgw'), 'yUQM7H4Swgw');
  assert.equal(youTubeKey('https://www.youtube.com/embed/yUQM7H4Swgw?autoplay=1'), 'yUQM7H4Swgw');
  assert.equal(youTubeKey('https://vimeo.com/123456'), '');
  assert.equal(youTubeKey(''), '');
  assert.equal(youTubeKey(undefined), '');
});

test('in the pool with a trailer this server plays - a teaser counts - and its Trailer opens it', () => {
  assert.deepEqual(heroTrailer({ extras: [extra('x1')] }), { ytKey: '', extraId: 'x1' });
  assert.deepEqual(heroTrailer({ extras: [extra('t1', 'teaser')] }), { ytKey: '', extraId: 't1' });
  // A YouTube link too: the local one still opens; the id stays for the embed.
  assert.deepEqual(heroTrailer({ extras: [extra('x1', 'teaser')], trailers: [link('https://youtu.be/abcdefg')] }), {
    ytKey: 'abcdefg',
    extraId: 'x1',
  });
  // The trailer of a season before the title's teaser, as on its page.
  assert.equal(heroTrailer({ extras: [extra('t', 'teaser'), extra('s1', 'trailer', { season_number: 1 })] })?.extraId, 's1');
});

test('in the pool with a YouTube link: its Trailer opens the link a title page opens', () => {
  const trailers = [link('https://www.youtube.com/watch?v=teaser01', 'Teaser'), link('https://www.youtube.com/watch?v=official1')];
  assert.deepEqual(heroTrailer({ trailers }), { ytKey: 'teaser01', url: 'https://www.youtube.com/watch?v=official1' });
  // Extras, none of them a trailer: the link.
  assert.deepEqual(heroTrailer({ extras: [extra('f', 'featurette')], trailers: [link('https://youtu.be/abcdefg')] }), {
    ytKey: 'abcdefg',
    url: 'https://youtu.be/abcdefg',
  });
});

test('not in the pool: no trailer here, and no YouTube link - a featurette alone is none', () => {
  assert.equal(heroTrailer({ trailers: [link('https://vimeo.com/1')] }), null);
  assert.equal(heroTrailer({ extras: [extra('f', 'featurette')] }), null);
  assert.equal(heroTrailer({ extras: [extra('x', 'trailer', { play_path: '' })] }), null);
  assert.equal(heroTrailer({ extras: [extra('x', 'trailer', { local: false })] }), null);
  assert.equal(heroTrailer({}), null);
  assert.equal(heroTrailer(null), null);
});

test('a shuffle keeps every entry, and leaves its input alone', () => {
  const xs = [1, 2, 3, 4, 5];
  const out = shuffled(xs, seq(0.1, 0.9, 0.5, 0.3));
  assert.deepEqual([...out].sort(), [1, 2, 3, 4, 5]);
  assert.deepEqual(xs, [1, 2, 3, 4, 5]);
  // random() = 0 every time: each step swaps with the head.
  assert.deepEqual(shuffled([1, 2, 3], () => 0), [2, 3, 1]);
});

test('those this server plays first, each group shuffled, eight taken', () => {
  const entries = [
    ...Array.from({ length: 7 }, (_, i) => ({ id: `yt${i}` })),
    ...Array.from({ length: 3 }, (_, i) => ({ id: `local${i}`, extraId: `x${i}` })),
  ];
  const pool = heroPoolOrder(entries);
  assert.equal(pool.length, HERO_POOL_SIZE);
  assert.deepEqual(pool.slice(0, 3).map((e) => e.id).sort(), ['local0', 'local1', 'local2']);
  assert.ok(pool.slice(3).every((e) => e.id.startsWith('yt')));

  // More of them than fit: only those this server plays.
  const many = Array.from({ length: 10 }, (_, i) => ({ id: `l${i}`, extraId: `x${i}` }));
  const full = heroPoolOrder([{ id: 'yt' }, ...many]);
  assert.equal(full.length, 8);
  assert.ok(full.every((e) => e.extraId));
});

test('each group in the order the shuffle gives it', () => {
  const entries = [{ id: 'y0' }, { id: 'l0', extraId: 'a' }, { id: 'y1' }, { id: 'l1', extraId: 'b' }];
  assert.deepEqual(heroPoolOrder(entries, () => 0).map((e) => e.id), ['l1', 'l0', 'y1', 'y0']);
  assert.deepEqual(heroPoolOrder(entries, () => 0.99).map((e) => e.id), ['l0', 'l1', 'y0', 'y1']);
});

test('a pool of fewer than eight is all of them; none is none', () => {
  assert.equal(heroPoolOrder([{ id: 'a' }, { id: 'b', extraId: 'x' }]).length, 2);
  assert.deepEqual(heroPoolOrder([]), []);
  assert.equal(heroPoolOrder([{ id: 'a' }, { id: 'b' }], Math.random, 1).length, 1);
});
