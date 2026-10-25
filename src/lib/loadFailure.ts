// What a screen says when what it shows couldn't load (docs/chino, playback:
// when a page couldn't load; the design system's empty states, "when it
// couldn't load: say why"). The case is decided by the HTTP status alone,
// never by an error's message: no answer or 408 is the connection, 5xx the
// server, 429 busy, 404 and 410 removed - on a list screen they mean the app
// and the server don't match, the not-accepted case - 403 no access, 401
// signed out, any other 4xx not accepted. The title names what couldn't load
// in the screen's own words ("couldn't load the movies"); the description is
// the reason alone, "try again" being the button. Pure: loadFailure.test.ts
// runs it under node --test.

/** A request the server answered with an error status. */
export class HttpError extends Error {
  status: number;
  constructor(status: number, what = 'chino-api') {
    super(`${what} ${status}`);
    this.name = 'HttpError';
    this.status = status;
  }
}

/** A request's answer, as an error when it is not a success. */
export function okOrThrow(r: Response, what = 'chino-api'): Response {
  if (!r.ok) throw new HttpError(r.status, what);
  return r;
}

/** Why it couldn't load. */
export type FailureCase = 'unreachable' | 'server' | 'busy' | 'refused' | 'removed' | 'no-access' | 'signed-out';

/** Where it couldn't load: a screen of one thing (a title, a person), or a
 *  list (a browse screen, search, the Watchlist, Settings' languages). */
export type FailureWhere = 'one' | 'list';

/**
 * The status a failure was answered with: an HttpError's, or the status an
 * error carries (the Watchlist's helpers set one); 0 for a body that came
 * but couldn't be read (the server's); null for no answer - the network, a
 * request that never got through.
 */
export function failureStatus(error: unknown): number | null {
  if (error instanceof HttpError) return error.status;
  const status = (error as { status?: unknown } | null)?.status;
  if (typeof status === 'number' && Number.isFinite(status) && status > 0) return status;
  if (error instanceof SyntaxError) return 0;
  return null;
}

/** The case of a failure answered with `status` (failureStatus). */
export function failureCase(status: number | null, where: FailureWhere): FailureCase {
  if (status === null || status === 408) return 'unreachable';
  if (status === 0 || status >= 500) return 'server';
  if (status === 429) return 'busy';
  if (status === 404 || status === 410) return where === 'one' ? 'removed' : 'refused';
  if (status === 403) return 'no-access';
  if (status === 401) return 'signed-out';
  return 'refused';
}

/** The case of an error, as failureCase has it. */
export function caseOf(error: unknown, where: FailureWhere): FailureCase {
  return failureCase(failureStatus(error), where);
}

const REASONS: Readonly<Record<FailureCase, string>> = {
  unreachable: "Can't reach the server.",
  server: 'The server ran into a problem.',
  busy: 'The server is busy.',
  refused: "The server didn't accept the request. Check for an app update.",
  // Trying again can't bring these back: the screen says what is true
  // instead, with back (removedTitle, NO_ACCESS).
  removed: '',
  'no-access': '',
  // Not said: the app signs in again (useSignInAgain).
  'signed-out': '',
};

/** What the description says: the reason alone. '' for the cases that
 *  have none (removed, no access, signed out). */
export function failureReason(kind: FailureCase): string {
  return REASONS[kind];
}

/** Whether "try again" can help. */
export function canTryAgain(kind: FailureCase): boolean {
  return kind === 'unreachable' || kind === 'server' || kind === 'busy' || kind === 'refused';
}

/** The title, in the screen's own words: "couldn't load the movies". */
export function couldntLoad(what: string): string {
  return `couldn't load ${what}`;
}

/** What a page of one thing says when it was removed. */
export function removedTitle(thing: 'title' | 'person'): string {
  return `this ${thing} isn't in the library anymore`;
}

/** What a page says that the viewer may not see. */
export const NO_ACCESS = "you don't have access to this";

/** The button that loads it again. */
export const TRY_AGAIN = 'try again';

const PHRASES: Readonly<Record<number, string>> = {
  400: 'Bad Request',
  401: 'Unauthorized',
  403: 'Forbidden',
  404: 'Not Found',
  405: 'Method Not Allowed',
  408: 'Request Timeout',
  409: 'Conflict',
  410: 'Gone',
  415: 'Unsupported Media Type',
  422: 'Unprocessable Content',
  429: 'Too Many Requests',
  500: 'Internal Server Error',
  501: 'Not Implemented',
  502: 'Bad Gateway',
  503: 'Service Unavailable',
  504: 'Gateway Timeout',
};

/** What goes under details, for the people who fix things: the status and
 *  its reason phrase, "HTTP 503 Service Unavailable"; null for no answer. */
export function failureDetails(status: number | null): string | null {
  if (status === null) return null;
  if (status === 0) return 'an answer that could not be read';
  const phrase = PHRASES[status];
  return phrase ? `HTTP ${status} ${phrase}` : `HTTP ${status}`;
}

/**
 * Where a sign-in that was refused brings the viewer back to: the page they
 * were on, a path of this site - never another site, nor the sign-in's own
 * callback; null for none.
 */
export function returnPath(state: unknown): string | null {
  const path = (state as { returnTo?: unknown } | null)?.returnTo;
  if (typeof path !== 'string' || !path.startsWith('/') || path.startsWith('//') || path.includes('\\')) return null;
  if (/^\/auth\/callback(\/|\?|#|$)/.test(path)) return null;
  return path;
}

/**
 * What the player says when every rung of a stream failed, by the status of
 * the last request that did (hls.js gives 0 for no answer): the reason as a
 * page says it - "Can't reach the server." only when nothing answered.
 */
export function streamFailureReason(status: number | null | undefined): string {
  const answered = typeof status === 'number' && status > 0 ? status : null;
  const kind = failureCase(answered, 'list');
  return failureReason(kind) || failureReason('refused');
}
