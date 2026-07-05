import type { AuthProviderProps } from 'react-oidc-context';
import { WebStorageStateStore } from 'oidc-client-ts';
import { toApp } from '../lib/basepath';
import type { RuntimeConfig } from '../lib/runtimeConfig';

const env = import.meta.env;

// The OIDC authority and client id are resolved at RUNTIME from
// `/api/config` (see lib/runtimeConfig.ts) — they are no longer static
// exports, so the same published image works against any Keycloak.
// Build react-oidc-context's props from the resolved runtime config.
export function buildOidcConfig(cfg: RuntimeConfig): AuthProviderProps {
  const redirectUri =
    env.VITE_OIDC_REDIRECT_URI ?? `${window.location.origin}/auth/callback`;
  const postLogoutRedirectUri =
    env.VITE_OIDC_POST_LOGOUT_REDIRECT_URI ?? window.location.origin;

  return {
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
    onSigninCallback: () => {
      // After handling the callback, send the user to the app HOME under
      // the configured base (`/` or `/chino/`).
      window.history.replaceState(null, '', toApp('/'));
    },
  };
}
