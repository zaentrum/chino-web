// node --test (type stripping, Node >= 22.18). Excluded from the app's tsc program.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { episodeToPlay, firstEpisode } from './seriesPlay.ts';

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
