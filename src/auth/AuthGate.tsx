import { useEffect, useLayoutEffect, type ReactNode } from 'react';
import { useAuth } from 'react-oidc-context';
import { useCatalogEvents } from '../hooks/useCatalogEvents';
import { LoadingState } from '../components/LoadingState';
import { FailureDetails } from '../components/CouldntLoad';
import { signInFailureReason } from '../lib/signInAgain';
import { toApp } from '../lib/basepath';
import { accountWasDeleted, forgetAccountDeleted } from './accountDeleted';
import { oidcUserManager } from './oidc';
import { tabLoaded, useTabLeaving } from './tabAccount';
import { gateScreen } from '../lib/authGate';
import chinoIcon from '../imports/chino_icon.svg';

interface AuthGateProps {
  children: ReactNode;
}

export function AuthGate({ children }: AuthGateProps) {
  // Live catalog refresh: one SSE bridge for the whole app.
  useCatalogEvents();
  const auth = useAuth();
  // Loading anew for another account (auth/tabAccount.ts): the splash, in
  // place of every screen, until the page goes.
  const leaving = useTabLeaving();

  // Auto-redirect to the IdP when we're not in flight and not signed
  // in. Same guard as before, plus we skip if there's a pending error
  // — let the user click "sign in again" instead of looping back to the
  // failing redirect — and right after the person deleted their
  // account: the start screen says so first (below).
  useEffect(() => {
    if (!auth.isLoading && !auth.isAuthenticated && !auth.error && !auth.activeNavigator && !accountWasDeleted()) {
      auth.signinRedirect();
    }
  }, [auth.isLoading, auth.isAuthenticated, auth.error, auth.activeNavigator]);

  // Signed in again, by whatever way: the notice is done.
  useEffect(() => {
    if (auth.isAuthenticated) forgetAccountDeleted();
  }, [auth.isAuthenticated]);

  // The user the provider holds: its first is the account this tab was
  // loaded for, brought back by the sign-in or read from the store (a read
  // raises no userLoaded); another one later loads the app anew
  // (auth/tabAccount.ts). A layout effect: before the screens' effects run.
  useLayoutEffect(() => {
    if (auth.user) tabLoaded(auth.user.access_token);
  }, [auth.user]);

  // When the tab comes back into focus after being backgrounded, the
  // access token may have expired silently. Trigger a silent renew so
  // the next fetch carries a fresh token without showing the user a
  // "Signing you in…" splash. react-oidc-context wires its own
  // automatic renew before expiry, but visibility-change is the
  // belt-and-suspenders case where the user opens the tab a minute
  // before expiry and starts clicking immediately.
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState !== 'visible') return;
      if (!auth.isAuthenticated) return;
      // expires_at is unix seconds; treat <60s as "renew now".
      const expiresAt = auth.user?.expires_at;
      if (expiresAt && expiresAt * 1000 - Date.now() < 60_000) {
        // Through the UserManager itself: the provider's signinSilent
        // shows the splash below, unmounting the page (auth/oidc.ts).
        const manager = oidcUserManager();
        void (manager ? manager.signinSilent() : auth.signinSilent()).catch(() => undefined);
      }
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [auth]);

  const screen = gateScreen({
    leaving,
    isLoading: auth.isLoading,
    isAuthenticated: auth.isAuthenticated,
    error: Boolean(auth.error),
    accountDeleted: accountWasDeleted(),
  });

  // The person deleted their account (ProfilePage's Delete Account): it is
  // gone, and they are signed out. Sign In starts over, as anyone.
  if (screen === 'account-deleted') {
    return (
      <div className="min-h-dvh bg-chino-bg text-chino-text flex items-center justify-center p-6">
        <main className="max-w-md w-full text-center">
          <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-chino-surface border border-chino-border flex items-center justify-center">
            <img src={chinoIcon} alt="Chino" className="w-10 h-10" />
          </div>
          <h1 className="font-mono text-2xl font-semibold mb-2 text-white">account deleted</h1>
          <p className="text-sm text-chino-text mb-5">
            Your account is deleted, with everything this server kept of you, and you're signed out.
          </p>
          <button
            onClick={() => {
              forgetAccountDeleted();
              void auth.signinRedirect();
            }}
            className="h-12 px-5 bg-chino-accent hover:brightness-110 text-chino-bg font-mono font-medium"
          >
            sign in
          </button>
        </main>
      </div>
    );
  }

  if (screen === 'sign-in-failed' && auth.error) {
    return (
      <div className="min-h-dvh bg-chino-bg text-chino-text flex items-center justify-center p-6">
        <div className="max-w-md w-full text-center">
          <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-chino-surface border border-chino-border flex items-center justify-center">
            <img src={chinoIcon} alt="Chino" className="w-10 h-10" />
          </div>
          {/* What is true and why, by the kind of the error - its own
              words under details, for the people who fix things; sign in
              again, or start the app over from home. */}
          <h1 className="font-mono text-2xl font-semibold mb-2 text-white">couldn't sign you in</h1>
          <p className="text-chino-muted mb-6">{signInFailureReason(auth.error)}</p>
          <div className="flex gap-2 justify-center">
            <button
              onClick={() => auth.signinRedirect()}
              className="h-12 px-5 bg-chino-accent hover:brightness-110 text-chino-bg font-mono font-medium"
            >
              sign in again
            </button>
            <button
              onClick={() => window.location.assign(toApp('/'))}
              className="h-12 px-5 bg-chino-surface-2 hover:bg-chino-border-2 text-chino-text font-mono font-medium"
            >
              home
            </button>
          </div>
          <div className="mt-6">
            <FailureDetails status={null} text={auth.error.message} />
          </div>
        </div>
      </div>
    );
  }

  if (screen !== 'app') {
    return (
      <div className="min-h-dvh bg-chino-bg text-chino-muted flex flex-col items-center justify-center p-6">
        <div className="w-16 h-16 mb-4 rounded-2xl bg-chino-surface border border-chino-border flex items-center justify-center">
          <img src={chinoIcon} alt="Chino" className="w-10 h-10" />
        </div>
        <LoadingState message="Signing you in…" />
      </div>
    );
  }

  return <>{children}</>;
}
