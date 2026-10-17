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

## Playback telemetry

The player batches what happens while it plays and posts it to the platform
API's `POST /api/v1/play/events`, `{"sessionId", "events": [{"ts", "kind",
"itemId", "payload"}]}`: every 30 seconds when there is something to send, and
when the page goes (`sendBeacon`, with the stream token). A session is one
player mount. The server logs each event and counts it; chino-api's README
lists the metrics. An extra (a trailer) sends one `trailer_play` and nothing
else.

Besides `mount`, `play`, `pause`, `waiting`, `stall_recover`, `quality_switch`,
`audio_switch`, `media_error`, `hls_fatal`, `circuit_breaker`, the `fault_*`
recoveries, `retry`, `tab_resume_reload`, `skip_segment`, `binge_*`,
`mark_watched` and `playback_rate_change`, five kinds measure how playback goes
(`src/lib/qoe.ts`), the baseline the live rungs of
[ADR-0013](https://github.com/zaentrum/zaentrum/blob/main/docs/adr/0013-live-rungs-safety-net.md)
are judged against:

| Kind | Sent | Payload |
| --- | --- | --- |
| `first_frame` | once per attempt (the mount, or Try again), when the video presents its first frame (its frame callback; without one, the playhead's first move) | `startup_ms` from the mount or Try again, `request_ms` from the master playlist's request, `sources` asked for, `mode` (`packaged`, `passthrough`, `remux`, `transcode`), `height` and `bitrate` of the rendition, `resume` (started at 1 s or later), `start_bucket`, `hidden` (the page was hidden meanwhile), `click_to_play` (autoplay refused, the viewer pressed play first), `via`, `attempt` |
| `startup_timeout` | no frame after 20 s of the page visible, as before | `attempt`, `lastDetails`, `status`, and `phase` (`request`: no stream token; `playlist`; `init`; `first_segment`; `decode`: the segments in, no frame), `mode`, `sources`, the fetch under way: `seg_kind`, `seg_loaded` (bytes in), `seg_total` (its size, when the server said it), `seg_load_ms`, `seg_ttfb_ms`, `height`, `bitrate` |
| `rebuffer` | a stall that began mid-play ends - not the start, not the wait after a seek or a quality switch | `duration_ms`, `position`, `cause` (`waiting`; `stuck`: the playhead stood still unannounced; `pause`: the browser paused with nothing buffered), `end` (`playing`, `pause`, `hidden`, `exit`, `error`), `seeked`, `mode`, the fetch under way when it began (`seg_*`) |
| `bandwidth` | at the first frame, then at most every 30 s while playing | `bps` (hls.js's estimate), the last video segment's `frag_bytes`, `frag_duration_ms`, `frag_load_ms`, `frag_ttfb_ms`, `height`, `trigger` |
| `level_switch` | the rendition on screen changes | `from_height`, `from_bitrate`, `to_height`, `to_bitrate`, `manual` (the viewer's pick in the quality menu), `mode` |

- A session sends at most 10 `first_frame`, 100 `rebuffer`, 100 `level_switch`
  and 1000 `bandwidth`.
- What this adds to a play: two events at the start, and about 120 an hour
  while it plays (a `bandwidth` every 30 s), more with stalls and rung
  switches. The 30-second flush then has something to send nearly every time:
  about two requests a minute per viewer playing, where a smooth play sent few.
- Where the browser plays HLS itself (Safari without Media Source
  Extensions) there is no bandwidth estimate and no bitrate: no `bandwidth`
  events, heights only, and `phase` is `playlist` until the metadata,
  `first_segment` after.

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
