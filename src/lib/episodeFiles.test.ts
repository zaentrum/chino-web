// node --test (type stripping, Node >= 22.18). Excluded from the app's tsc program.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { entryIds, episodeCode, fileEntries, fileNeighbours, oneRowPerFile } from './episodeFiles.ts';

// A season whose episodes 18 to 21 are one file (a four-part finale) and 14
// and 15 another, as chino-api lists it.
const season = [
  { id: 'e13', episode_number: 13 },
  { id: 'e14', episode_number: 14, covers: ['e15'], episodeEnd: 15 },
  { id: 'e15', episode_number: 15, coveredBy: 'e14' },
  { id: 'e16', episode_number: 16 },
  { id: 'e17', episode_number: 17 },
  { id: 'e18', episode_number: 18, covers: ['e19', 'e20', 'e21'], episodeEnd: 21 },
  { id: 'e19', episode_number: 19, coveredBy: 'e18' },
  { id: 'e20', episode_number: 20, coveredBy: 'e18' },
  { id: 'e21', episode_number: 21, coveredBy: 'e18' },
];

test('a file that holds several episodes is one entry', () => {
  const entries = fileEntries(season);
  assert.deepEqual(entries.map((e) => e.episode.id), ['e13', 'e14', 'e16', 'e17', 'e18']);
  assert.deepEqual(entries.map((e) => [e.first, e.last]), [[13, 13], [14, 15], [16, 16], [17, 17], [18, 21]]);
  assert.deepEqual(entryIds(entries[4]), ['e18', 'e19', 'e20', 'e21']);
  assert.deepEqual(entries[0].covered, []);
});

test('a list that names no covers is one entry per episode', () => {
  const plain = [{ id: 'a', episode_number: 1 }, { id: 'b', episode_number: 2 }];
  assert.deepEqual(fileEntries(plain).map((e) => [e.episode.id, e.first, e.last]), [['a', 1, 1], ['b', 2, 2]]);
  assert.deepEqual(fileEntries([]), []);
});

test('either side alone names the file: covers without coveredBy, coveredBy without covers', () => {
  const byCovers = [{ id: 'a', episode_number: 1, covers: ['b'] }, { id: 'b', episode_number: 2 }];
  assert.deepEqual(fileEntries(byCovers).map((e) => [e.episode.id, e.last]), [['a', 2]]);
  const byCoveredBy = [{ id: 'a', episode_number: 1 }, { id: 'b', episode_number: 2, coveredBy: 'a' }];
  assert.deepEqual(fileEntries(byCoveredBy).map((e) => [e.episode.id, e.last]), [['a', 2]]);
});

test('an episode whose holder is not listed keeps an entry of its own', () => {
  const orphan = [{ id: 'b', episode_number: 2, coveredBy: 'gone' }, { id: 'c', episode_number: 3 }];
  assert.deepEqual(fileEntries(orphan).map((e) => e.episode.id), ['b', 'c']);
});

test('stepping on from a file goes past every episode it holds', () => {
  const from18 = fileNeighbours(season, 'e18');
  assert.equal(from18.prev?.episode.id, 'e17');
  assert.equal(from18.next, null);
  const from14 = fileNeighbours(season, 'e14');
  assert.equal(from14.prev?.episode.id, 'e13');
  assert.equal(from14.next?.episode.id, 'e16');
});

test('opened with a covered episode, the steps are the file\'s', () => {
  const from15 = fileNeighbours(season, 'e15');
  assert.equal(from15.current?.episode.id, 'e14');
  assert.equal(from15.prev?.episode.id, 'e13');
  assert.equal(from15.next?.episode.id, 'e16');
});

test('stepping back onto a file lands on its holder', () => {
  assert.equal(fileNeighbours(season, 'e16').prev?.episode.id, 'e14');
  assert.deepEqual(fileNeighbours(season, 'nowhere'), { current: null, prev: null, next: null });
});

test('the code of a file names the episodes it holds', () => {
  assert.equal(episodeCode(3, 18), 'S03E18');
  assert.equal(episodeCode(3, 18, 18), 'S03E18');
  assert.equal(episodeCode(3, 18, 21), 'S03E18–21');
  assert.equal(episodeCode(1, 1, null), 'S01E01');
});

test('a watched file is one row of the history, in the place of its first', () => {
  const history = [
    { id: 'e21', coveredBy: 'e18' },
    { id: 'm1' },
    { id: 'e19', coveredBy: 'e18' },
    { id: 'e18', covers: ['e19', 'e20', 'e21'], episodeEnd: 21 },
    { id: 'e20', coveredBy: 'e18' },
    { id: 'e17' },
  ];
  assert.deepEqual(oneRowPerFile(history).map((r) => r.id), ['e18', 'm1', 'e17']);
});

test('a covered row whose holder the list does not have stays, once', () => {
  const page = [{ id: 'e20', coveredBy: 'e18' }, { id: 'e19', coveredBy: 'e18' }, { id: 'm1' }];
  assert.deepEqual(oneRowPerFile(page).map((r) => r.id), ['e20', 'm1']);
  assert.deepEqual(oneRowPerFile([{ id: 'a' }, { id: 'b' }]).map((r) => r.id), ['a', 'b']);
});
