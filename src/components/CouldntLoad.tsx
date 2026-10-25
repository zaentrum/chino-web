import { useEffect, useState } from 'react';
import { useAuth } from 'react-oidc-context';
import { RotateCw } from 'lucide-react';
import {
  NO_ACCESS,
  TRY_AGAIN,
  canTryAgain,
  failureCase,
  failureDetails,
  failureReason,
  failureStatus,
  type FailureCase,
  type FailureWhere,
} from '../lib/loadFailure';
import { markRenewed, nextSignInStep, readSignInMarks, renewalFailure } from '../lib/signInAgain';
import { oidcUserManager } from '../auth/oidc';
import { LoadingState } from './LoadingState';

// What a screen shows in the place of what couldn't load (lib/loadFailure.ts;
// the design system's empty states, "when it couldn't load: say why"): the
// screen's own words in the title, in the mono face; the reason alone under
// it; "try again"; and the status under details, for the people who fix
// things.

type Renewal = 'renewed' | 'unreachable' | 'refused';

// One renewal at a time, for every screen that got a 401 at once.
let renewing: Promise<Renewal> | null = null;
let redirecting = false;

function renewOnce(fallback: () => Promise<unknown>): Promise<Renewal> {
  if (!renewing) {
    const manager = oidcUserManager();
    renewing = (manager ? manager.signinSilent() : fallback())
      .then((user): Renewal => {
        if (!user) return 'refused';
        markRenewed(Date.now());
        return 'renewed';
      })
      .catch((e): Renewal => renewalFailure(e))
      .finally(() => {
        renewing = null;
      });
  }
  return renewing;
}

/**
 * What a 401 has come to, for the screen to show: still signing in (a
 * renewal or the way to sign-in under way), the sign-in service out of
 * reach (the connection case), or the server refusing even a sign-in just
 * made ('sign-in-refused'); null while the screen isn't signed out.
 */
export type SignInAgain = 'signing-in' | 'unreachable' | 'sign-in-refused';

/**
 * A sign-in that expired renews itself; only a refused one leads to
 * sign-in, and back to where the viewer was (docs/chino, playback: when a
 * page couldn't load). On a 401: renewed silently once and asked again;
 * when that is refused, or the server still says 401, to sign-in; when it
 * still says 401 right after that sign-in, the screen says so and stops
 * (lib/signInAgain.ts). The steps are the tab's, not this screen's, so a
 * screen that unmounts while it asks again goes on where it left off.
 */
export function useSignInAgain(signedOut: boolean, retry?: () => void): SignInAgain | null {
  const auth = useAuth();
  const [state, setState] = useState<SignInAgain>('signing-in');
  useEffect(() => {
    if (!signedOut) return;
    let live = true;
    setState('signing-in');
    const toSignIn = () => {
      if (redirecting) return;
      redirecting = true;
      void auth.signinRedirect({ state: { returnTo: `${window.location.pathname}${window.location.search}${window.location.hash}` } });
    };
    const step = nextSignInStep(readSignInMarks(), Date.now());
    if (step === 'refused') {
      setState('sign-in-refused');
      return;
    }
    if (step === 'sign-in') {
      toSignIn();
      return;
    }
    void renewOnce(() => auth.signinSilent()).then((outcome) => {
      if (!live) return;
      if (outcome === 'renewed') retry?.();
      else if (outcome === 'refused') toSignIn();
      else setState('unreachable');
    });
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signedOut]);
  return signedOut ? state : null;
}

/** The case a screen shows: its error's, or, for a 401, what the sign-in
 *  came to (null: still signing in). */
export function shownCase(kind: FailureCase, signIn: SignInAgain | null): FailureCase | null {
  if (kind !== 'signed-out') return kind;
  if (signIn === 'unreachable') return 'unreachable';
  if (signIn === 'sign-in-refused') return 'sign-in-refused';
  return null;
}

/** The status under a disclosure named "details". */
export function FailureDetails({ status }: { status: number | null }) {
  const details = failureDetails(status);
  if (!details) return null;
  return (
    <details className="text-xs text-chino-dim">
      <summary className="font-mono cursor-pointer hover:text-chino-muted">details</summary>
      <p className="mt-1 font-mono">{details}</p>
    </details>
  );
}

/**
 * In the place of a list that couldn't load: the title the screen gives it
 * ("couldn't load the movies"), the reason ("Can't reach the server."), and
 * "try again". A list that answers 404 or 410 is the not-accepted case
 * (where 'list'); one the viewer may not see says so, with nothing to try.
 */
export function CouldntLoad({
  title,
  error,
  onRetry,
  where = 'list',
}: {
  /** The screen's own words: couldntLoad('the movies'). */
  title: string;
  error: unknown;
  onRetry?: () => void;
  where?: FailureWhere;
}) {
  const status = failureStatus(error);
  const signIn = useSignInAgain(failureCase(status, where) === 'signed-out', onRetry);
  const kind = shownCase(failureCase(status, where), signIn);
  if (!kind) return <LoadingState />;
  const reason = failureReason(kind);
  return (
    <div role="alert" className="py-10 flex flex-col items-center gap-3 text-center">
      <h2 className="font-mono text-lg font-semibold text-chino-fg">{kind === 'no-access' ? NO_ACCESS : title}</h2>
      {reason ? <p className="text-sm text-chino-muted max-w-md">{reason}</p> : null}
      {onRetry && canTryAgain(kind) ? (
        <button
          type="button"
          onClick={onRetry}
          className="mt-1 h-12 px-5 inline-flex items-center gap-2 bg-chino-accent hover:brightness-110 text-chino-bg font-mono font-medium text-sm"
        >
          <RotateCw className="w-4 h-4" aria-hidden />
          {TRY_AGAIN}
        </button>
      ) : null}
      <FailureDetails status={status} />
    </div>
  );
}
