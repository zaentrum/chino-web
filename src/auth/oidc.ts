import type { AuthProviderProps } from 'react-oidc-context';
import { UserManager, WebStorageStateStore } from 'oidc-client-ts';
import { toApp } from '../lib/basepath';
import { returnPath } from '../lib/loadFailure';
import { markSignedIn } from '../lib/signInAgain';
import { tabLoaded } from './tabAccount';
import type { RuntimeConfig } from '../lib/runtimeConfig';

const env = import.meta.env;

// The OIDC authority and client id are resolved at RUNTIME from
// `/api/config` (see lib/runtimeConfig.ts) — they are no longer static
// exports, so the same published image works against any Keycloak.
// Build react-oidc-context's props from the resolved runtime config.
//
// The app makes the UserManager itself and hands it to the provider, so a
// screen that got a 401 can renew the sign-in through it directly
// (components/CouldntLoad.tsx useSignInAgain): its errors come back to that
// screen, which tells a sign-in service it can't reach from one that said
// no, and the app stays on screen while it renews - the provider's own
// signinSilent shows the sign-in splash, unmounting the page, and keeps the
// error for the sign-in screen.
let manager: UserManager | null = null;

/** The app's one UserManager, once the runtime config made it. */
export function oidcUserManager(): UserManager | null {
  return manager;
}

export function buildOidcConfig(cfg: RuntimeConfig): AuthProviderProps {
  const redirectUri =
    env.VITE_OIDC_REDIRECT_URI ?? `${window.location.origin}/auth/callback`;
  const postLogoutRedirectUri =
    env.VITE_OIDC_POST_LOGOUT_REDIRECT_URI ?? window.location.origin;

  manager = new UserManager({
    authority: cfg.oidcIssuer,
    client_id: cfg.oidcClientId.web,
    // The redirect_uri stays the SITE-ROOT `/auth/callback` (registered
    // in Keycloak; the demo has a dedicated `/auth/callback` route →
    // chino-web). It must NOT be base-prefixed.
    redirect_uri: redirectUri,
    post_logout_redirect_uri: postLogoutRedirectUri,
    response_type: 'code',
    scope: 'openid profile email',
    automaticSilentRenew: true,
    userStore: new WebStorageStateStore({ store: window.localStorage }),
  });
  // The store is the browser's, for all its tabs, and a renewal reads it:
  // each sign-in loaded is checked against the account this tab was loaded
  // for (auth/tabAccount.ts). Added before the provider adds its own, so a
  // renewal of another account is seen before a screen gets its token.
  manager.events.addUserLoaded((user) => tabLoaded(user.access_token));
  return {
    userManager: manager,
    onSigninCallback: (user) => {
      // Signed in just now: a 401 from here on is the server refusing it,
      // not a sign-in to renew (lib/signInAgain.ts).
      markSignedIn(Date.now());
      // After handling the callback, back to the page a refused sign-in
      // left (components/CouldntLoad.tsx useSignInAgain), else the app
      // HOME under the configured base (`/` or `/chino/`). The router
      // reads the address again on popstate.
      const back = returnPath(user?.state);
      window.history.replaceState(null, '', back ?? toApp('/'));
      if (back) window.dispatchEvent(new PopStateEvent('popstate'));
    },
  };
}
