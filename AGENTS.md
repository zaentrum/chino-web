# chino-web

The web app of chino, zaentrum's video app: a React, Vite and TypeScript single-page app that
browses the library (movies and shows) and plays it over HLS with hls.js, served by nginx
from its image. It talks to chino-api on the same origin under `/api`: the catalog, playback,
the viewer's lists and progress, notices, bug reports, and the playback events it posts to
`/api/v1/play/events`. At start it reads the sign-in service from `GET /api/config` and signs
in with OpenID Connect. What it shows and does is in
[chino's specification](https://github.com/zaentrum/zaentrum/blob/main/spec/chino/README.md).
How a change is proposed and what a pull request has to pass is in the
[guide to contributing](https://github.com/zaentrum/.github/blob/main/CONTRIBUTING.md);
what may be built is in [building from the specification](https://github.com/zaentrum/zaentrum/blob/main/AGENTS.md).

## Build

```sh
npm ci
npm run build                 # tsc --noEmit && vite build -> dist/
docker build -t chino-web .   # nginx-unprivileged on 8080
```

The tests need Node 22.18 or later (`ci.yml` uses 24); the image builds on `node:20-alpine`.
The bundle has the placeholder base `/__BASE__/`. At start the image's
`docker-entrypoint.d/40-chino-base.sh` copies it under `BASE_PATH` (default `/`), rewrites
the placeholder and writes the nginx server block: the fallback to `index.html`, `/healthz`,
and long caching for `assets/`.

## Test

As `.github/workflows/ci.yml` runs them, in its jobs `build` and `docker`:

```sh
npm ci
npm test                      # node --test src/lib/*.test.ts
npm run build
docker build -t chino-web:ci .
```

Node runs the tests' TypeScript itself; they need nothing else and skip nothing.

## Run it

```sh
npm ci
npm run dev                   # http://localhost:5173/, which sends on to /__BASE__/
```

There is no mock server and there are no recorded answers: the app needs a chino-api. The
dev server proxies `/api` to `http://localhost:8080` (`vite.config.ts`), where chino-api
listens when run as its README says (`go run ./cmd/server`). At start the app reads
`/api/config`: the sign-in service (`oidcIssuer`, else `VITE_OIDC_AUTHORITY`) and its client
(`oidcClientId.web`, else `chino`); without an answer it says why, with Try again. It always
signs in. The sign-in returns to `VITE_OIDC_REDIRECT_URI`, by default `/auth/callback` on the
page's origin, which the dev server answers with 404, as it serves only under `/__BASE__/`.
The app reads `VITE_OIDC_AUTHORITY`, `VITE_OIDC_REDIRECT_URI` and
`VITE_OIDC_POST_LOGOUT_REDIRECT_URI` at build time, from `.env.local` for instance. On the
platform the image serves the app beside chino-api on one origin, as in the reference demo
([how it is deployed](https://github.com/zaentrum/zaentrum/blob/main/docs/reference-demo.md)).

## What the tests leave unchecked

- The tests cover the functions in `src/lib`; the components, hooks and pages have none,
  beyond tests that read the components' source for their words.
- Playback: nothing plays a stream. hls.js, the browser's own HLS, the PGS subtitles' worker
  and the service worker (`public/sw.js`) are tried in browsers, by hand.
- No test meets a sign-in service or a chino-api.
- The image is built on a pull request, not started: the entrypoint's `BASE_PATH` rewrite
  and the nginx block it writes have no test.

## Before a pull request

The organisation's shared check, the workflow's `neutrality-shared` job, is the
one neutrality check.
