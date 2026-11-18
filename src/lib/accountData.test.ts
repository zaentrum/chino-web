// node --test (type stripping, Node >= 22.18). Excluded from the app's tsc program.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import vm from 'node:vm';
import { BINGE_SESSION_PREFIX, FORGET_ARTWORK, forgetAccountData } from './accountData.ts';
import { STREAM_TOKEN_KEY } from './streamTokenCache.ts';
import { HERO_POOL_KEY } from './heroPool.ts';

/** A Storage with these entries. */
function storage(entries: Record<string, string>) {
  const data = new Map(Object.entries(entries));
  return {
    get length() {
      return data.size;
    },
    key: (i: number) => [...data.keys()][i] ?? null,
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => {
      data.set(k, v);
    },
    removeItem: (k: string) => {
      data.delete(k);
    },
    keys: () => [...data.keys()].sort(),
  };
}

const OIDC_USER = 'oidc.user:https://sign-in.example.org/realms/example:chino';

// What the browser keeps that is its own, and stays.
const LOCAL_STAYS = {
  'chino:settings:v1': '{"binge":{"enabled":true}}',
  'chino:picture:fill': '1',
  'chino:ios-install-hint-dismissed': '1',
};
const SESSION_STAYS = {
  'chino:subtitleLanguages': '["en"]',
  'chino.signInAgain': '{"renewedAt":null,"signedInAt":null}',
  'chino:accountDeleted': '1',
};

test("16.5.6 what the browser keeps of the account goes: the stream token, the hero pool, the binge sessions; the worker is asked to drop its artwork", async () => {
  const local = storage({
    ...LOCAL_STAYS,
    [OIDC_USER]: '{"profile":{"sub":"first"}}',
    [`${BINGE_SESSION_PREFIX}series-1`]: '{"episodeId":"e1","ts":1}',
    [`${BINGE_SESSION_PREFIX}series-2`]: '{"episodeId":"e7","ts":2}',
  });
  const session = storage({
    ...SESSION_STAYS,
    [STREAM_TOKEN_KEY]: '{"token":"s","expiresAt":1,"sub":"first"}',
    [HERO_POOL_KEY]: '{"at":1,"entries":[{"backdrop_url":"/api/v1/items/m/backdrop?stream=s"}]}',
  });
  const asked: unknown[] = [];
  await forgetAccountData({ local, session }, async (message) => {
    asked.push(message);
  });
  // The sign-in is not forgetAccountData's: the sign-out removes it, where it is the account's.
  assert.deepEqual(local.keys(), [...Object.keys(LOCAL_STAYS), OIDC_USER].sort());
  assert.deepEqual(session.keys(), Object.keys(SESSION_STAYS).sort());
  assert.deepEqual(asked, [{ type: FORGET_ARTWORK }]);
});

test('16.5.6 storage the browser gives none of, or refuses, and a worker that fails, stop nothing', async () => {
  await forgetAccountData({ local: null, session: null }, async () => {
    throw new Error('no worker');
  });
  const refusing = {
    get length(): number {
      throw new Error('storage off');
    },
    key: () => null,
    removeItem: () => {
      throw new Error('storage off');
    },
  };
  await forgetAccountData({ local: refusing, session: refusing }, () => {
    throw new Error('no worker');
  });
});

/** public/sw.js, run with a fake worker scope; the caches it deleted. */
function serviceWorker() {
  const source = readFileSync(join(import.meta.dirname, '..', '..', 'public', 'sw.js'), 'utf8');
  const handlers = new Map<string, (event: unknown) => void>();
  const deleted: string[] = [];
  let skipped = 0;
  const self = {
    addEventListener: (type: string, handler: (event: unknown) => void) => handlers.set(type, handler),
    skipWaiting: () => {
      skipped++;
    },
    clients: { claim: async () => undefined },
  };
  const caches = {
    delete: async (name: string) => {
      deleted.push(name);
      return true;
    },
    keys: async () => [],
    open: async () => ({ match: async () => undefined, put: async () => undefined }),
  };
  vm.runInNewContext(source, { self, caches, URL, Response, setTimeout, clearTimeout, fetch: async () => new Response('') });
  const message = async (data: unknown) => {
    const waits: Promise<unknown>[] = [];
    handlers.get('message')!({ data, waitUntil: (p: Promise<unknown>) => waits.push(p) });
    await Promise.all(waits);
  };
  return { message, deleted, skipped: () => skipped };
}

test('16.5.6 asked, the service worker drops its artwork cache, and only that', async () => {
  const sw = serviceWorker();
  await sw.message({ type: FORGET_ARTWORK });
  assert.equal(sw.deleted.length, 1);
  assert.match(sw.deleted[0], /-artwork$/);
  await sw.message({ type: 'SOMETHING_ELSE' });
  await sw.message(null);
  assert.equal(sw.deleted.length, 1);
  // Its update message is as it was.
  await sw.message({ type: 'SKIP_WAITING' });
  assert.equal(sw.skipped(), 1);
  assert.equal(sw.deleted.length, 1);
});
