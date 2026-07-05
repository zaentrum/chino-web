import type { AuthProviderProps } from 'react-oidc-context';
import { WebStorageStateStore } from 'oidc-client-ts';
import { toApp } from '../lib/basepath';

const env = import.meta.env;

// Exported so non-React code (lib/feedback.ts) can locate the
// persisted oidc-client-ts user in localStorage by its storage key.
export const authority = env.VITE_OIDC_AUTHORITY ?? '';
export const clientId = env.VITE_OIDC_CLIENT_ID ?? 'chino';
const redirectUri =
  env.VITE_OIDC_REDIRECT_URI ?? `${window.location.origin}/auth/callback`;
const postLogoutRedirectUri =
  env.VITE_OIDC_POST_LOGOUT_REDIRECT_URI ?? window.location.origin;

export const oidcConfig: AuthProviderProps = {
  authority,
  client_id: clientId,
  redirect_uri: redirectUri,
  post_logout_redirect_uri: postLogoutRedirectUri,
  response_type: 'code',
  scope: 'openid profile email',
  automaticSilentRenew: true,
  userStore: new WebStorageStateStore({ store: window.localStorage }),
  onSigninCallback: () => {
    // The redirect_uri stays the SITE-ROOT `/auth/callback` (registered
    // in Keycloak, and the demo has a dedicated `/auth/callback` route →
    // chino-web). After handling the callback, send the user to the app
    // HOME under the configured base (`/` or `/chino/`).
    window.history.replaceState(null, '', toApp('/'));
  },
};
