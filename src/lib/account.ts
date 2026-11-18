/**
 * Deleting the signed-in person's account — the app stores ask every app
 * that makes accounts to offer it. `DELETE /api/v1/me`, with the bearer in
 * the Authorization header only: chino-api refuses one in the URL (a link
 * someone could be sent). chino-api deletes what it keeps of the person —
 * their watch progress, lists, likes and watch history — and their sign-in,
 * all or nothing, and answers:
 *
 *   200          deleted: the app signs out and goes back to the start
 *   409          refused (the last admin, an account the platform manages):
 *                its `message` says why, for the person
 *   501          not set up on this server: its administrator deletes accounts
 *   502 / other  nothing deleted: try again later, with the server's `message`
 *
 * Every answer but 200 leaves the person signed in. Pure: account.test.ts
 * runs it under node --test against a fake fetch.
 */

import { subjectOf } from './streamTokenCache.ts';

export type AccountDeletion =
  | { kind: 'deleted' }
  | { kind: 'refused'; message: string }
  | { kind: 'unavailable'; message: string }
  | { kind: 'failed'; message: string };

export const ACCOUNT_DELETION_UNAVAILABLE =
  "Deleting your account isn't available on this server — ask its administrator.";

/** The heading an answer is shown under: short, title case. */
export function accountDeletionTitle(answer: Exclude<AccountDeletion, { kind: 'deleted' }>): string {
  switch (answer.kind) {
    case 'refused':
      return 'Not Deleted';
    case 'unavailable':
      return 'Not Available';
    case 'failed':
      return 'Try Again Later';
  }
}

/** What an answer means, from its status and the body's `message` (null when
 *  the body carried none a person can read). */
export function accountDeletionAnswer(status: number, message: string | null): AccountDeletion {
  // Only a 200 says the account is gone: anything else keeps the person in.
  if (status === 200) return { kind: 'deleted' };
  if (status === 409) return { kind: 'refused', message: message ?? "This server won't delete your account." };
  if (status === 501) return { kind: 'unavailable', message: ACCOUNT_DELETION_UNAVAILABLE };
  if (status === 401) {
    return {
      kind: 'failed',
      message: message ?? 'This server no longer accepts your sign-in. Sign in again, then try once more.',
    };
  }
  return { kind: 'failed', message: message ?? `Your account couldn't be deleted right now (HTTP ${status}).` };
}

/** Longest server message shown: a sentence or two, not a page. */
const MAX_MESSAGE = 300;

/** The `message` of chino-api's JSON answer — written for the person — or
 *  null: an empty body, a proxy's page, a plain-text error. */
async function personMessage(res: Response): Promise<string | null> {
  try {
    const body: unknown = await res.json();
    const message = body && typeof body === 'object' ? (body as { message?: unknown }).message : undefined;
    if (typeof message !== 'string' || !message.trim()) return null;
    return message.trim().slice(0, MAX_MESSAGE);
  } catch {
    return null;
  }
}

/**
 * Asks chino-api to delete the account [token] signs in. Never throws: a
 * request that does not reach the server is a failure like any other.
 */
export async function deleteAccount(opts: {
  /** The access token of the account to delete. */
  token: string;
  /** chino-api's account route; the app is served next to it. */
  url?: string;
  /** For tests; the browser's fetch otherwise. */
  fetch?: (input: string, init: RequestInit) => Promise<Response>;
}): Promise<AccountDeletion> {
  const doFetch = opts.fetch ?? ((input: string, init: RequestInit) => fetch(input, init));
  let res: Response;
  try {
    res = await doFetch(opts.url ?? '/api/v1/me', {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${opts.token}` },
    });
  } catch {
    return { kind: 'failed', message: "The server couldn't be reached." };
  }
  if (res.status === 200) return { kind: 'deleted' };
  return accountDeletionAnswer(res.status, await personMessage(res));
}

/** A token with this little life left, in seconds, is renewed before it deletes: an expired one would only earn a 401. */
export const RENEW_BELOW_SEC = 30;

/** What the dialog says, under Try Again Later, where it sent nothing as
 *  another account is signed in now (docs/chino, settings 16.C16). */
export const ACCOUNT_DELETION_ANOTHER_ACCOUNT = 'Another account is signed in now. Open Delete Account again.';

/** What Delete Account came to: chino-api's answer to the bearer it sent,
 *  or nothing sent, as the bearer would be another account's than this
 *  tab's or the dialog's. */
export type DeletionAttempt =
  | { kind: 'answered'; bearer: string | null; answer: AccountDeletion }
  | { kind: 'another-account' };

/**
 * Deletes the account the dialog names, `named`: its sign-in's access token
 * and how long it has left. While it has more than RENEW_BELOW_SEC left, it
 * deletes with it. Else it renews first (`renew`, the new access token), and
 * the renewal reads the sign-in the browser keeps for all its tabs, which
 * may be another account's, signed in since in another tab: the renewed
 * token deletes only where its subject is the named account's (both read
 * from their JWTs, not verified). Where it is another's, or either can't be
 * read, nothing is sent ('another-account'). A renewal that fails or brings
 * nothing deletes with the named token; the answer says the rest.
 *
 * And whichever token it would send, it sends only where `mayWrite` lets
 * this tab write with it (lib/tabAccount.ts): the dialog's user is the
 * provider's at the press, which, once the tab took up another account's
 * sign-in and before the page goes, is that account's, its token with
 * minutes left. Never throws.
 */
export async function deleteNamedAccount(opts: {
  named: { accessToken: string; expiresInSec?: number } | null;
  renew: () => Promise<string | null | undefined>;
  /** Whether this tab may write with a bearer (auth/tabAccount.ts tabMayWrite). */
  mayWrite: (bearer: string) => boolean;
  url?: string;
  fetch?: (input: string, init: RequestInit) => Promise<Response>;
}): Promise<DeletionAttempt> {
  const { named } = opts;
  // Not the tab's account: not renewed either, which would read the store.
  if (named && !opts.mayWrite(named.accessToken)) return { kind: 'another-account' };
  let bearer: string | null = named?.accessToken ?? null;
  if (!named || (named.expiresInSec ?? Infinity) <= RENEW_BELOW_SEC) {
    let renewed: string | null | undefined = null;
    try {
      renewed = await opts.renew();
    } catch {
      renewed = null;
    }
    if (renewed) {
      const was = subjectOf(named?.accessToken);
      if (was === null || subjectOf(renewed) !== was) return { kind: 'another-account' };
      bearer = renewed;
    }
  }
  if (!bearer) return { kind: 'answered', bearer: null, answer: accountDeletionAnswer(401, null) };
  if (!opts.mayWrite(bearer)) return { kind: 'another-account' };
  return { kind: 'answered', bearer, answer: await deleteAccount({ token: bearer, url: opts.url, fetch: opts.fetch }) };
}
