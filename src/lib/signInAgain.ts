// What the app does when the server answers 401 (docs/chino, playback: "A
// sign-in that expired renews itself; only a refused one leads to sign-in";
// the design system's empty states, specs: signed out). It renews the
// sign-in silently once and asks again; when the renewal is refused, or the
// server still says 401 to the renewed sign-in, it takes the viewer to
// sign-in, and back; when the server still says 401 right after that
// sign-in, it stops and says so - it never goes round again by itself. A
// renewal that can't reach the sign-in service is the connection case.
//
// Each step is remembered for the tab (sessionStorage), not by the screen
// that asked: a screen that couldn't load unmounts while it loads again, and
// the sign-in reloads the page. Pure but for the storage: signInAgain.test.ts
// runs it under node --test.

/** How long a renewal or a sign-in counts as just made. */
export const JUST_SIGNED_IN_MS = 60_000;

/** When the last silent renewal and the last sign-in were made, ms. */
export interface SignInMarks {
  renewedAt: number | null;
  signedInAt: number | null;
}

/** What to do about a 401: renew silently, go to sign-in, or stop - the
 *  server refuses even a sign-in just made. */
export type SignInStep = 'renew' | 'sign-in' | 'refused';

function recent(at: number | null, now: number): boolean {
  return at !== null && now >= at && now - at < JUST_SIGNED_IN_MS;
}

/** The next step for a 401 answered at `now`. */
export function nextSignInStep(marks: SignInMarks, now: number): SignInStep {
  if (recent(marks.signedInAt, now)) return 'refused';
  if (recent(marks.renewedAt, now)) return 'sign-in';
  return 'renew';
}

/**
 * Why a silent renewal failed: no answer from the sign-in service (the
 * network, a timeout) is the connection case; anything else - the service
 * said no, there is no refresh token - is a refused one, which goes to
 * sign-in.
 */
export function renewalFailure(error: unknown): 'unreachable' | 'refused' {
  if (error instanceof TypeError) return 'unreachable';
  const name = (error as { name?: unknown } | null)?.name;
  return name === 'ErrorTimeout' ? 'unreachable' : 'refused';
}

const KEY = 'chino.signInAgain';
let memory: SignInMarks = { renewedAt: null, signedInAt: null };

function session(): Storage | null {
  try {
    return typeof sessionStorage === 'undefined' ? null : sessionStorage;
  } catch {
    return null;
  }
}

function asTime(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

/** The marks this tab holds. */
export function readSignInMarks(): SignInMarks {
  try {
    const raw = session()?.getItem(KEY);
    if (raw) {
      const j = JSON.parse(raw) as Partial<SignInMarks>;
      return { renewedAt: asTime(j.renewedAt), signedInAt: asTime(j.signedInAt) };
    }
  } catch {
    // Blocked or unreadable storage: what this page remembers.
  }
  return { ...memory };
}

function write(marks: SignInMarks) {
  memory = { ...marks };
  try {
    session()?.setItem(KEY, JSON.stringify(marks));
  } catch {
    // The page's memory is enough to stop: the sign-in is marked on its
    // return, in the page that asks again.
  }
}

/** A silent renewal succeeded at `now`. */
export function markRenewed(now: number) {
  write({ ...readSignInMarks(), renewedAt: now });
}

/** A sign-in came back at `now` (the sign-in's callback). */
export function markSignedIn(now: number) {
  write({ ...readSignInMarks(), signedInAt: now });
}
