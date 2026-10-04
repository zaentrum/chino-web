// node --test (type stripping, Node >= 22.18): the detail page's
// certification badge. Excluded from the app's tsc program.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ratingBadge } from './ratings.ts';

test('a certification reads as its board writes it', () => {
  assert.deepEqual(ratingBadge({ min_age: 12, certification: '12', certification_country: 'DE' }),
    { text: 'FSK 12', title: 'Rated 12 in DE, for 12 and up' });
  assert.deepEqual(ratingBadge({ min_age: 13, certification: 'PG-13', certification_country: 'US' })?.text, 'PG-13');
  assert.deepEqual(ratingBadge({ min_age: 17, certification: 'TV-MA', certification_country: 'US' })?.text, 'TV-MA');
  assert.deepEqual(ratingBadge({ min_age: 12, certification: '12A', certification_country: 'GB' })?.text, '12A');
  assert.deepEqual(ratingBadge({ min_age: 0, certification: '0', certification_country: 'DE' })?.text, 'FSK 0');
  assert.deepEqual(ratingBadge({ min_age: 15, certification: 'MA 15+', certification_country: 'AU' })?.text, 'MA 15+');
});

test('a bare age says its country', () => {
  assert.deepEqual(ratingBadge({ min_age: 12, certification: '12', certification_country: 'CH' })?.text, 'CH 12');
  assert.deepEqual(ratingBadge({ min_age: 16, certification: '16+', certification_country: 'RU' })?.text, 'RU 16+');
  assert.deepEqual(ratingBadge({ min_age: 15, certification: ' 15 ', certification_country: 'gb' })?.text, 'GB 15');
});

test('an admin’s rating has no certification: the age', () => {
  assert.deepEqual(ratingBadge({ min_age: 16 }), { text: '16+', title: 'Rated for 16 and up' });
  assert.deepEqual(ratingBadge({ min_age: 0 })?.text, '0+');
});

test('nothing rates it: no badge', () => {
  assert.equal(ratingBadge({}), undefined);
  assert.equal(ratingBadge({ certification: '12' }), undefined);
  assert.equal(ratingBadge({ certification_country: 'DE' }), undefined);
  assert.equal(ratingBadge({ min_age: -1 }), undefined);
});
