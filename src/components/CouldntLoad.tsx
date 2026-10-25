import { useEffect, useRef } from 'react';
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
  type FailureWhere,
} from '../lib/loadFailure';
import { LoadingState } from './LoadingState';

// What a screen shows in the place of what couldn't load (lib/loadFailure.ts;
// the design system's empty states, "when it couldn't load: say why"): the
// screen's own words in the title, in the mono face; the reason alone under
// it; "try again"; and the status under details, for the people who fix
// things.

/**
 * A sign-in that expired renews itself; only a refused one leads to
 * sign-in, and back to where the viewer was (docs/chino, playback: when a
 * page couldn't load). On a 401: renewed silently once and asked again;
 * when that is refused, or the server still says 401, to sign-in.
 */
export function useSignInAgain(signedOut: boolean, retry?: () => void) {
  const auth = useAuth();
  const renewed = useRef(false);
  useEffect(() => {
    if (!signedOut) return;
    const toSignIn = () =>
      void auth.signinRedirect({ state: { returnTo: `${window.location.pathname}${window.location.search}${window.location.hash}` } });
    if (renewed.current) {
      toSignIn();
      return;
    }
    renewed.current = true;
    auth
      .signinSilent()
      .then((user) => (user ? retry?.() : toSignIn()))
      .catch(toSignIn);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signedOut]);
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
  const kind = failureCase(status, where);
  useSignInAgain(kind === 'signed-out', onRetry);
  if (kind === 'signed-out') return <LoadingState />;
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
