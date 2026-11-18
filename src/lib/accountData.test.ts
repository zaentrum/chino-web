// node --test (type stripping, Node >= 22.18). Excluded from the app's tsc program.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import vm from 'node:vm';
import { BINGE_SESSION_PREFIX, FORGET_ARTWORK, forgetBrowserData, forgetTabData } from './accountData.ts';
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

test("16.5.6 what is the account's goes: the tab's stream token and hero pool; the browser's binge sessions, and the worker is asked to drop its artwork", () => {
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
  forgetTabData(session);
  // The tab's part touches nothing of the browser's.
  assert.equal(local.keys().length, Object.keys(LOCAL_STAYS).length + 3);
  assert.deepEqual(session.keys(), Object.keys(SESSION_STAYS).sort());
  forgetBrowserData(local, async (message) => {
    asked.push(message);
  });
  // The sign-in is neither's: the sign-out removes it, where it is the account's.
  assert.deepEqual(local.keys(), [...Object.keys(LOCAL_STAYS), OIDC_USER].sort());
  assert.deepEqual(asked, [{ type: FORGET_ARTWORK }]);
});

test("16.5.6 the browser's part returns at once, its keys gone, whatever the worker does, or never does", () => {
  const local = storage({ [`${BINGE_SESSION_PREFIX}series-1`]: '{}' });
  const result = forgetBrowserData(local, () => new Promise(() => undefined));
  assert.equal(result, undefined);
  assert.deepEqual(local.keys(), []);
});

test('16.5.6 storage the browser gives none of, or refuses, and a worker that fails, stop nothing', () => {
  forgetTabData(null);
  forgetBrowserData(null, async () => {
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
  forgetTabData(refusing);
  forgetBrowserData(refusing, () => {
    throw new Error('no worker');
  });
});

/** public/sw.js, run with a fake worker scope holding the caches `held`; the caches it deleted. */
function serviceWorker(held: string[] = []) {
  const source = readFileSync(join(import.meta.dirname, '..', '..', 'public', 'sw.js'), 'utf8');
  const handlers = new Map<string, (event: unknown) => void>();
  const deleted: string[] = [];
  const opened: string[] = [];
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
    keys: async () => held,
    open: async (name: string) => {
      opened.push(name);
      return { match: async () => undefined, put: async () => undefined };
    },
  };
  vm.runInNewContext(source, { self, caches, URL, Response, setTimeout, clearTimeout, fetch: async () => new Response('') });
  const message = async (data: unknown) => {
    const waits: Promise<unknown>[] = [];
    handlers.get('message')!({ data, waitUntil: (p: Promise<unknown>) => waits.push(p) });
    await Promise.all(waits);
  };
  const install = async () => {
    const waits: Promise<unknown>[] = [];
    handlers.get('install')!({ waitUntil: (p: Promise<unknown>) => waits.push(p) });
    await Promise.all(waits);
  };
  const activate = async () => {
    const waits: Promise<unknown>[] = [];
    handlers.get('activate')!({ waitUntil: (p: Promise<unknown>) => waits.push(p) });
    await Promise.all(waits);
  };
  return { message, install, activate, deleted, opened, skipped: () => skipped };
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

test("16.5.6 the worker that takes over drops the artwork the one before cached, which ignored the forget message, and keeps the page", async () => {
  // This worker's caches, by their names.
  const probe = serviceWorker();
  await probe.install();
  await probe.message({ type: FORGET_ARTWORK });
  const [shell] = probe.opened;
  const [artwork] = probe.deleted;
  // A browser that ran the worker of 16.5.6's first version holds its caches, and one of a worker long gone.
  const sw = serviceWorker(['chino-v4-artwork', 'chino-v4-shell', 'chino-v3-shell', artwork]);
  await sw.activate();
  assert.notEqual(artwork, 'chino-v4-artwork');
  assert.equal(shell, 'chino-v4-shell');
  assert.deepEqual(sw.deleted.sort(), ['chino-v3-shell', 'chino-v4-artwork']);
});
