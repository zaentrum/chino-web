// An account the server has deleted is signed out on this tab (docs/chino,
// settings 16.5.6). chino-api answers what such an account sends (a write,
// the lists read that makes the default list, a bug report, a new stream
// token) with 401 {"error":"account_deleted","detail":…}. The app's own
// requests go through window.fetch, which installDeletedAccountWatch wraps
// (auth/accountDeleted.ts); what hls.js, the media elements, the catalog
// events and sendBeacon load does not, and is not looked at. Of each answer
// the wrapper looks at the status alone; only of a 401 from chino-api with
// a JSON body does it read a copy of the body, and it stops where that is
// longer than MAX_BODY_BYTES or says it is. Where the body says
// account_deleted, it hands the request's Authorization to the sign-out
// (lib/deletedAccountSignOut.ts) before the screen or the write that asked
// gets the answer; no screen renews the sign-in for it (lib/signInAgain.ts).
// A 503 "account busy", from a write that waited out a deletion still open,
// is not that answer. Pure: deletedAccountWatch.test.ts runs it under
// node --test.

/** chino-api's code for an account whose deletion has begun. */
export const ACCOUNT_DELETED = 'account_deleted';

/** The most of a 401's body read: chino-api's {"error":…,"detail":…} is a
 *  line. A longer body is not that answer. */
export const MAX_BODY_BYTES = 4096;

/** Whether `url`, as fetch was given it, goes to chino-api: under /api/v1/
 *  on the page's `origin`. An addon's answer through the portal
 *  (/api/portal/…) or another origin's is not chino-api's. */
export function isChinoApi(url: string, origin: string): boolean {
  try {
    const u = new URL(url, origin);
    return u.origin === origin && u.pathname.startsWith('/api/v1/');
  } catch {
    return false;
  }
}

function urlOf(input: RequestInfo | URL): string {
  if (typeof input === 'string') return input;
  if (input instanceof URL) return input.href;
  return input.url;
}

/** The Authorization a request was sent with, as fetch was given it: the
 *  headers of `init` where it has some (they take the place of a Request's),
 *  else the Request's; null for none. */
export function authorizationOf(input: RequestInfo | URL, init?: RequestInit): string | null {
  try {
    if (init?.headers !== undefined) return new Headers(init.headers).get('authorization');
    if (typeof Request !== 'undefined' && input instanceof Request) return input.headers.get('authorization');
  } catch {
    /* headers fetch itself would refuse */
  }
  return null;
}

/** A copy of `res`'s body as text, `max` bytes of it at most; null where it
 *  is longer, says it is, or can't be read. The caller's body is left
 *  whole. */
async function cappedText(res: Response, max: number): Promise<string | null> {
  const declared = Number(res.headers.get('content-length') ?? '');
  if (Number.isFinite(declared) && declared > max) return null;
  const body = res.clone().body;
  if (!body) return '';
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > max) {
        // Only this copy stops; the caller's goes on. Not awaited: a copy's
        // cancel settles once the caller's is done too.
        reader.cancel().catch(() => undefined);
        return null;
      }
      chunks.push(value);
    }
  } catch {
    return null;
  }
  const bytes = new Uint8Array(size);
  let at = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, at);
    at += chunk.byteLength;
  }
  return new TextDecoder().decode(bytes);
}

/** Whether `res` is chino-api's 401 account_deleted. Reads a copy of the
 *  body, up to MAX_BODY_BYTES, so the caller can still read it; a
 *  plain-text 401 ("invalid token"), a JSON body with another code or a
 *  longer one is not that 401. The content type's case doesn't count. */
export async function saysAccountDeleted(res: Response): Promise<boolean> {
  if (res.status !== 401) return false;
  if (!(res.headers.get('content-type') ?? '').toLowerCase().includes('json')) return false;
  const text = await cappedText(res, MAX_BODY_BYTES);
  if (text === null) return false;
  try {
    const body = JSON.parse(text) as { error?: unknown } | null;
    return body?.error === ACCOUNT_DELETED;
  } catch {
    return false;
  }
}

/**
 * `fetchImpl`, with each of chino-api's answers looked at: on a 401
 * account_deleted, `onDeleted` runs with the request's Authorization (null
 * for none) before the caller gets the answer. Each request is sent once,
 * as it was asked, and its answer goes back as it came.
 */
export function watchingForDeletedAccount(
  fetchImpl: typeof fetch,
  origin: string,
  onDeleted: (authorization: string | null) => void,
): typeof fetch {
  return async (input: RequestInfo | URL, init?: RequestInit) => {
    const res = await fetchImpl(input, init);
    if (res.status === 401 && isChinoApi(urlOf(input), origin) && (await saysAccountDeleted(res))) {
      onDeleted(authorizationOf(input, init));
    }
    return res;
  };
}
