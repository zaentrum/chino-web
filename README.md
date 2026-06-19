# chino-web

The **chino** web client — the reference React web frontend for the
[zaentrum](https://github.com/zaentrum/zaentrum) self-hosted media platform.
It browses your library (movies, shows, music) and plays back over HLS, and is
served same-origin by your server alongside the platform API.

## Stack

- React 18 + TypeScript + Vite + Tailwind CSS + lucide-react
- OpenID Connect login via `react-oidc-context` / `oidc-client-ts`
- Static single-page app served by unprivileged Nginx
- Talks to the platform API same-origin at `/api/*` — no CORS, no separate host

## Configuration

The client is configured at build time through `VITE_*` environment variables.
Copy `.env.example` to `.env.local` and point it at **your** server:

| Variable | Required | Default | Meaning |
| --- | --- | --- | --- |
| `VITE_OIDC_AUTHORITY` | yes | _(empty)_ | Your server's OIDC issuer / realm URL (serves `/.well-known/openid-configuration`). |
| `VITE_OIDC_CLIENT_ID` | no | `chino` | OIDC client id this app registers as. |
| `VITE_OIDC_REDIRECT_URI` | no | `window.location.origin` + `/auth/callback` | Login redirect URI. |
| `VITE_OIDC_POST_LOGOUT_REDIRECT_URI` | no | `window.location.origin` | Post-logout redirect URI. |

For a same-origin deployment you typically only set `VITE_OIDC_AUTHORITY`; the
redirect and post-logout URIs default to the origin the app is served from.

## Develop

```bash
npm ci
npm run dev
# open http://localhost:5173
```

The dev server proxies `/api/*` to `http://localhost:8080` so you can run the
client against a local instance of the platform API — see `vite.config.ts`.

## Build

```bash
npm ci
npm run build      # type-check + Vite production build → dist/
```

The build emits a static SPA in `dist/` that any web server can host.

## Docker

A two-stage `Dockerfile` builds the SPA and serves it with unprivileged Nginx
on port `8080`:

```bash
docker build -t chino-web .
docker run --rm -p 8080:8080 chino-web
# open http://localhost:8080
```

`nginx.conf` provides SPA fallback (client-side routing), aggressive caching of
hashed assets, and a `/healthz` endpoint.

## Layout

```
index.html            Vite entry / document head
src/main.tsx          React mount
src/App.tsx           app shell
src/auth/             OIDC config + authenticated fetch
src/components/        UI components (shared + product sections)
src/hooks/            data-fetching + playback hooks
src/lib/              client utilities
src/imports/          brand pictogram + wordmark SVGs
tailwind.config.ts    design tokens
vite.config.ts        dev proxy + build config
Dockerfile            node build → nginx serve
nginx.conf            SPA fallback + healthz + cache
```

## License

[MPL-2.0](./LICENSE).
