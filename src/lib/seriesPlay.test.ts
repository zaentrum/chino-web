// node --test (type stripping, Node >= 22.18). Excluded from the app's tsc program.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { episodeToPlay, firstEpisode, isMidWatch, seriesPlayTarget } from './seriesPlay.ts';

const seasons = [
  { season: 2, episodes: [{ id: 's2e1', episode_number: 1 }] },
  { season: 1, episodes: [{ id: 's1e2', episode_number: 2 }, { id: 's1e1', episode_number: 1 }] },
  { season: 0, episodes: [{ id: 'special', episode_number: 1 }] },
];

test('the episode the viewer is in the middle of', () => {
  const cw = [
    { id: 'm1', type: 'movie' },
    { id: 'other-s1e4', type: 'episode', parent_id: 'other' },
    { id: 's1e2', type: 'episode', parent_id: 'pioneer' },
  ];
  assert.equal(episodeToPlay('pioneer', cw, seasons), 's1e2');
});

test('the next one after the last finished (Next Up), when it comes first', () => {
  const cw = [
    { id: 's2e1', type: 'episode', parent_id: 'pioneer', up_next: true },
    { id: 's1e1', type: 'episode', parent_id: 'pioneer' },
  ];
  assert.equal(episodeToPlay('pioneer', cw, seasons), 's2e1');
});

test('nothing started: S01E01 - not the specials, not the order the server listed', () => {
  assert.equal(episodeToPlay('pioneer', [{ id: 'x', type: 'episode', parent_id: 'other' }], seasons), 's1e1');
  assert.equal(episodeToPlay('pioneer', null, seasons), 's1e1');
  assert.equal(firstEpisode(seasons), 's1e1');
});

test('only specials: the first special; no episodes at all: nothing', () => {
  assert.equal(firstEpisode([{ season: 0, episodes: [{ id: 'sp2', episode_number: 2 }, { id: 'sp1', episode_number: 1 }] }]), 'sp1');
  assert.equal(firstEpisode([{ season: 1, episodes: [] }]), null);
  assert.equal(firstEpisode(undefined), null);
  assert.equal(episodeToPlay('pioneer', [], []), null);
});

test('episodes without a number come after the numbered ones', () => {
  assert.equal(firstEpisode([{ season: 1, episodes: [{ id: 'nameless' }, { id: 'e3', episode_number: 3 }] }]), 'e3');
});

test("a series page's Play: the episode the viewer is in, resumed where they are", () => {
  const cw = [
    { id: 'm1', type: 'movie', position_sec: 900, duration_sec: 5400 },
    { id: 's1e2', type: 'episode', parent_id: 'pioneer', position_sec: 754, duration_sec: 2700, season_number: 1, episode_number: 2 },
  ];
  assert.deepEqual(seriesPlayTarget('pioneer', cw, seasons), { episodeId: 's1e2', season: 1, episode: 2, episodeEnd: null, resumeSec: 754 });
});

test("a series page's Play: the next one after the last finished, from the start; else S01E01", () => {
  const cw = [{ id: 's2e1', type: 'episode', parent_id: 'pioneer', up_next: true, position_sec: 0, duration_sec: 2700, season_number: 2, episode_number: 1 }];
  assert.deepEqual(seriesPlayTarget('pioneer', cw, seasons), { episodeId: 's2e1', season: 2, episode: 1, episodeEnd: null, resumeSec: 0 });
  // Nothing started: S01E01, its code from the season it is in.
  assert.deepEqual(seriesPlayTarget('pioneer', [], seasons), { episodeId: 's1e1', season: 1, episode: 1, episodeEnd: null, resumeSec: 0 });
  assert.deepEqual(seriesPlayTarget('pioneer', null, seasons)?.episodeId, 's1e1');
  // No episodes: nothing to play.
  assert.equal(seriesPlayTarget('pioneer', [], []), null);
});

test("a series page's Play: a row barely started or in its last minute is played from the start; a file of two episodes keeps its range", () => {
  const row = (position_sec: number, duration_sec: number) => [{ id: 'e', type: 'episode', parent_id: 'pioneer', position_sec, duration_sec, season_number: 3, episode_number: 18, episodeEnd: 19 }];
  assert.equal(seriesPlayTarget('pioneer', row(20, 2700), seasons)?.resumeSec, 0);
  assert.equal(seriesPlayTarget('pioneer', row(2650, 2700), seasons)?.resumeSec, 0);
  assert.equal(seriesPlayTarget('pioneer', row(1200, 0), seasons)?.resumeSec, 1200, 'a length not known is no end');
  assert.equal(seriesPlayTarget('pioneer', row(1200, 2700), seasons)?.episodeEnd, 19);
  assert.equal(isMidWatch(31, 2700), true);
  assert.equal(isMidWatch(30, 2700), false);
  assert.equal(isMidWatch(2640, 2700), false);
});
