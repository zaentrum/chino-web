// Runtime OIDC / API configuration.
//
// A self-hosted deployment (and the demo) must NOT bake the OIDC issuer
// at build time — the same published image points at whatever Keycloak
// its server declares. chino-api exposes that at `GET /api/config`, so
// the SPA fetches it on bootstrap (see main.tsx) and configures
// react-oidc-context from the discovered values.
//
// `/api/config` is an ABSOLUTE path served by chino-api at `/api`; it is
// NOT under the app's base path, so it must never be base-prefixed.

export interface RuntimeConfig {
  /** Absolute base URL of chino-api, e.g. "https://host/api". */
  apiBase: string;
  /** Whether the server has OIDC configured. */
  oidcEnabled: boolean;
  /** OIDC issuer (Keycloak realm URL) → used as the OIDC `authority`. */
  oidcIssuer: string;
  /** Expected token audience. */
  oidcAudience: string;
  /** Per-client OIDC client ids; the web SPA uses `web`. */
  oidcClientId: {
    web: string;
    [k: string]: string;
  };
}

// Module-level holder so non-React code (lib/feedback.ts) can read the
// resolved authority / client id after bootstrap without a hook.
let RUNTIME: RuntimeConfig | null = null;

/** The resolved runtime config, or null before `loadRuntimeConfig()` runs. */
export function getRuntimeConfig(): RuntimeConfig | null {
  return RUNTIME;
}

/**
 * Fetch `/api/config` and resolve the effective runtime configuration.
 *
 * Precedence for the OIDC authority:
 *   1. Runtime `/api/config` — used when `oidcEnabled` is true AND an
 *      `oidcIssuer` is present. This wins for a real deployment.
 *   2. Build-time `VITE_OIDC_AUTHORITY` — fallback so a pure-static
 *      build (no /api/config) still works.
 *
 * Throws a clear error if the endpoint is unreachable, returns non-2xx,
 * or serves HTML (an SPA index.html fallback) instead of JSON.
 */
export async function loadRuntimeConfig(): Promise<RuntimeConfig> {
  const res = await fetch('/api/config', {
    headers: { Accept: 'application/json' },
  });
  if (!res.ok) {
    throw new Error(`/api/config responded ${res.status} ${res.statusText}`);
  }
  // Guard against an SPA fallback (index.html) being served for
  // /api/config — that would parse as JSON-failure or, worse, silently
  // succeed on a lenient server. Require an explicit JSON content type.
  const contentType = res.headers.get('content-type') ?? '';
  if (!contentType.toLowerCase().includes('application/json')) {
    throw new Error(
      `/api/config returned non-JSON content-type "${contentType || 'unknown'}" ` +
        '(likely an SPA HTML fallback — the server is not exposing the config endpoint).',
    );
  }

  const raw = (await res.json()) as Partial<RuntimeConfig>;

  const buildFallbackAuthority = import.meta.env.VITE_OIDC_AUTHORITY ?? '';
  const runtimeIssuer =
    raw.oidcEnabled && raw.oidcIssuer ? raw.oidcIssuer : '';
  const oidcIssuer = runtimeIssuer || buildFallbackAuthority;

  const cfg: RuntimeConfig = {
    apiBase: raw.apiBase ?? '',
    oidcEnabled: raw.oidcEnabled ?? false,
    oidcIssuer,
    oidcAudience: raw.oidcAudience ?? '',
    oidcClientId: {
      web: raw.oidcClientId?.web ?? 'chino',
      ...(raw.oidcClientId ?? {}),
    },
  };

  RUNTIME = cfg;
  return cfg;
}
