import { useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from 'react-oidc-context';
import Hls from 'hls.js';
import { ArrowLeft, Loader2, VolumeX, Youtube } from 'lucide-react';
import { useItem } from '../hooks/useItem';
import { useStreamToken } from '../hooks/useStreamToken';
import { refinedDeviceCaps } from '../hooks/useDeviceCaps';
import { HLS_BASE_CONFIG, startOnFirstVariant } from '../lib/hlsConfig';
import { toApp } from '../lib/basepath';
import { extraMasterUrl, findExtra, pickTrailer, trailerFailure, trailerPlayBatch } from '../lib/trailers';
import { StatusPage } from './StatusPage';

interface TrailerPageProps {
  itemId: string;
  extraId: string;
}

/**
 * A title's trailer, full screen: /trailer/<itemId>/<extraId>, what the
 * Trailer on a title's page opens when this server plays one
 * (lib/trailers.ts). It plays from the start, with sound, on the player's
 * engine - hls.js set up as the player's is (lib/hlsConfig.ts), or the
 * browser's own HLS - with the browser's controls, and closes when it ends,
 * on Escape and on Back.
 *
 * A trailer is one of the title's extras: its own master, play_path, asked
 * for as a title's is (?stream=, &caps=). It has no resume position, no
 * watched state, no segments, no trickplay and no subtitles, and this page
 * asks for none of them - nor for a next episode or a prewarm: it reads the
 * title, plays the master and reports one trailer_play. A trailer never
 * shows up in Continue watching.
 *
 * A trailer that is not there - the title, the extra or its master answers
 * 404 - says "Trailer not available", with the title's trailer online where
 * it has one.
 */
export function TrailerPage({ itemId, extraId }: TrailerPageProps) {
  const auth = useAuth();
  const token = auth.user?.access_token;
  const { data, status, retry } = useItem(itemId);
  const streamToken = useStreamToken();
  const videoRef = useRef<HTMLVideoElement | null>(null);
  // The caps once refined (hooks/useDeviceCaps.ts): one master for the whole
  // trailer, not a second one when decodingInfo answers.
  const [caps, setCaps] = useState<string | null>(null);
  // Why the trailer did not play; null while it loads and plays.
  const [failure, setFailure] = useState<'not-found' | 'failed' | null>(null);
  // Bumped by Try again: the same master, asked for anew.
  const [attempt, setAttempt] = useState(0);
  const [waiting, setWaiting] = useState(true);
  // The browser would not start it with sound before the viewer did anything
  // on this page: it plays muted, and says so.
  const [mutedForAutoplay, setMutedForAutoplay] = useState(false);
  const reportedRef = useRef(false);

  useEffect(() => {
    let live = true;
    void refinedDeviceCaps().then((c) => {
      if (live) setCaps(c);
    });
    return () => {
      live = false;
    };
  }, []);

  const extra = data ? findExtra(data.extras, extraId) : null;
  const playPath = extra?.play_path ?? '';
  const src = useMemo(
    () => (playPath && streamToken && caps != null ? extraMasterUrl(playPath, { stream: streamToken, caps }) : ''),
    [playPath, streamToken, caps],
  );

  // Back where the viewer came from - the title's page - or to that page
  // when they came from nowhere (the trailer opened in a tab of its own).
  const close = () => {
    if (window.history.length > 1) window.history.back();
    else window.location.assign(toApp(`/i/${encodeURIComponent(itemId)}`));
  };

  // Escape closes; the browser's controls take the other keys once the
  // video has the focus, which it gets at once.
  useEffect(() => {
    videoRef.current?.focus({ preventScroll: true });
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [itemId]);

  useEffect(() => {
    const v = videoRef.current;
    if (!v || !src) return;
    setFailure(null);
    setWaiting(true);
    // hls.js wherever it plays; the browser's own HLS only where it cannot
    // and the browser can (iPhone Safari before ManagedMediaSource), as on
    // the player page.
    if (!Hls.isSupported()) {
      if (!v.canPlayType('application/vnd.apple.mpegurl')) {
        setFailure('failed');
        return;
      }
      let live = true;
      // A master the server does not have is a media error here, with no
      // status: it is asked for once more, to tell "not there" from a
      // failure.
      const onError = () => {
        void fetch(src)
          .then((r) => r.status, () => null)
          .then((s) => {
            if (live) setFailure(trailerFailure(s));
          });
      };
      v.addEventListener('error', onError);
      v.src = src;
      return () => {
        live = false;
        v.removeEventListener('error', onError);
        v.removeAttribute('src');
        v.load();
      };
    }
    const hls = new Hls({
      // No HLS subtitles (lib/hlsConfig.ts); an extra carries none.
      ...HLS_BASE_CONFIG,
      manifestLoadingMaxRetry: 2,
      manifestLoadingRetryDelay: 1000,
      fragLoadingMaxRetry: 4,
      fragLoadingRetryDelay: 1000,
    });
    // On the variant the master lists first, capped to the player's size
    // from the next fragment on.
    startOnFirstVariant(hls);
    let destroyed = false;
    const stop = () => {
      if (destroyed) return;
      destroyed = true;
      hls.destroy();
    };
    // Fatal network errors in a row, with no fragment loaded in between.
    let networkFatals = 0;
    let mediaRecoveries = 0;
    hls.on(Hls.Events.FRAG_LOADED, () => {
      networkFatals = 0;
    });
    hls.on(Hls.Events.ERROR, (_event, d) => {
      const code = (d.response as { code?: number } | undefined)?.code ?? null;
      // A master that is not there: nothing to try again.
      if (d.details === Hls.ErrorDetails.MANIFEST_LOAD_ERROR && trailerFailure(code) === 'not-found') {
        stop();
        setFailure('not-found');
        return;
      }
      if (!d.fatal) return;
      if (d.type === Hls.ErrorTypes.NETWORK_ERROR && networkFatals < 3) {
        networkFatals += 1;
        // A playlist that did not load leaves startLoad nothing to resume.
        if (/^(manifest|level)/.test(String(d.details))) hls.loadSource(src);
        else hls.startLoad();
        return;
      }
      if (d.type === Hls.ErrorTypes.MEDIA_ERROR && mediaRecoveries < 2) {
        mediaRecoveries += 1;
        hls.recoverMediaError();
        return;
      }
      stop();
      setFailure('failed');
    });
    hls.loadSource(src);
    hls.attachMedia(v);
    return stop;
  }, [src, attempt]);

  // With sound, from the start. Where the browser refuses sound before the
  // viewer has done anything on this page (a page load in Safari or
  // Firefox), it starts muted and says so; where it refuses even that, the
  // controls' play button starts it.
  const start = () => {
    const v = videoRef.current;
    if (!v) return;
    v.muted = false;
    const p = v.play();
    if (!p || typeof p.then !== 'function') return;
    p.catch((e: unknown) => {
      if ((e as { name?: string } | null)?.name !== 'NotAllowedError') return;
      v.muted = true;
      setMutedForAutoplay(true);
      v.play().catch(() => undefined);
    });
  };
  const unmute = () => {
    const v = videoRef.current;
    if (!v) return;
    v.muted = false;
    setMutedForAutoplay(false);
    v.play().catch(() => undefined);
  };

  // One trailer_play when the trailer starts, through the player's sink.
  const reportPlay = () => {
    if (reportedRef.current || !token) return;
    reportedRef.current = true;
    const batch = trailerPlayBatch({ sessionId: crypto.randomUUID(), itemId, extraId, ts: Date.now() });
    void fetch('/api/v1/play/events', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(batch),
      keepalive: true,
    }).catch(() => undefined);
  };

  // The title's trailer online, offered where the one here cannot play.
  const online = data ? pickTrailer(data.trailers) : null;
  const onlineLink = online?.url
    ? {
        href: online.url,
        label: (online.site || '').toLowerCase().includes('youtube') ? 'Watch on YouTube' : 'Watch Online',
        icon: <Youtube className="w-4 h-4" aria-hidden />,
      }
    : undefined;

  if (status === 'not-found' || (status === 'ok' && data && !extra) || failure === 'not-found') {
    return (
      <StatusPage
        title="Trailer not available"
        message="There's no trailer at this address. The link may be wrong, or the trailer has been removed."
        link={onlineLink}
      />
    );
  }
  if (status === 'error' && !data) {
    return (
      <StatusPage
        title="Couldn't load the trailer"
        message="The catalog didn't answer. Check your connection, or try again in a moment."
        onRetry={retry}
      />
    );
  }
  if (failure === 'failed') {
    return (
      <StatusPage
        title="Couldn't play the trailer"
        message="It didn't load. Check your connection, or try again in a moment."
        onRetry={() => {
          setFailure(null);
          setAttempt((a) => a + 1);
        }}
        link={onlineLink}
      />
    );
  }

  const heading = data ? [data.title, extra?.title].filter(Boolean).join(' · ') : '';
  return (
    <div className="fixed inset-0 bg-black overflow-hidden text-white">
      <video
        ref={videoRef}
        // No `src` attribute: hls.js attaches and drives the source (the
        // browser's own HLS gets it from the effect above).
        className="absolute inset-0 w-full h-full focus:outline-none"
        controls
        playsInline
        onLoadedMetadata={start}
        onWaiting={() => setWaiting(true)}
        onCanPlay={() => setWaiting(false)}
        onPlaying={() => {
          setWaiting(false);
          reportPlay();
        }}
        onVolumeChange={(e) => {
          if (!e.currentTarget.muted) setMutedForAutoplay(false);
        }}
        onEnded={close}
      />
      {waiting ? (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <Loader2 className="w-12 h-12 animate-spin text-white/80" aria-label="Loading" />
        </div>
      ) : null}
      <div className="pointer-events-none absolute inset-x-0 top-0 flex items-center gap-3 p-4 bg-gradient-to-b from-black/70 to-transparent">
        <button
          type="button"
          onClick={close}
          className="pointer-events-auto p-2 bg-black/50 hover:bg-black/70 transition-colors"
          title="Back"
          aria-label="Back"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        {heading ? <h1 className="truncate text-base md:text-lg font-medium drop-shadow">{heading}</h1> : null}
      </div>
      {mutedForAutoplay ? (
        <button
          type="button"
          onClick={unmute}
          className="absolute top-20 left-1/2 -translate-x-1/2 px-4 py-2 bg-black/70 hover:bg-black/85 text-sm flex items-center gap-2 transition-colors"
        >
          <VolumeX className="w-4 h-4" aria-hidden />
          <span>Tap to unmute</span>
        </button>
      ) : null}
    </div>
  );
}
