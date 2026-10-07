import { Clapperboard, Play, Info, Youtube } from 'lucide-react';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { KeyboardEvent as ReactKeyboardEvent, PointerEvent as ReactPointerEvent } from 'react';
import { useHeroPool, type HeroEntry } from '../hooks/useHeroPool';
import { usePlayTitle } from '../hooks/usePlayTitle';
import { toApp } from '../lib/basepath';
import {
  gestureAxis,
  heroSlides,
  releaseVelocity,
  swipeDecision,
  wrapIndex,
  type GestureAxis,
  type Leaving,
  type Sample,
} from '../lib/heroSwipe';
import { trailerPath } from '../lib/trailers';
import { FadeImage } from './FadeImage';

interface HeroSectionProps {
  /** Fallback entry used when the trailer pool hasn't loaded yet or
   *  when the user's library has no items with usable trailers. The
   *  carousel still renders a static backdrop in that case. */
  title: string;
  description: string;
  image: string;
  rating?: string;
  year?: string;
  itemId?: string;
  /** The fallback entry's type ('movie' or 'series'). */
  itemType?: string;
}

const ROTATE_MS = 20_000; // ~20 s per trailer — long enough to recognise the title, short enough to feel alive.
// Single flag for the trailer-on-hero behaviour. Flip to true to
// reinstate the auto-playing YouTube embed; the surrounding pool /
// dot rotation logic is unchanged either way.
const TRAILERS_ON_HERO = false;
/** How long a slide takes to settle once a swipe, an arrow key, a dot or
 *  the rotation brings it in, or a swipe lets it go back. */
const SETTLE_MS = 320;
const SETTLE_EASE = 'cubic-bezier(0.22, 0.61, 0.36, 1)';

/** What a slide shows: a title of the pool, or the fallback entry. */
interface HeroView {
  title: string;
  description: string;
  image: string;
  rating?: string;
  year?: string;
  playId?: string;
  playType: string;
  ytKey?: string;
  /** The entry's Trailer: the one this server plays, on the trailer page,
   *  else its link online in a new tab - what the title's page opens. */
  trailerHref: string | null;
  localTrailer: boolean;
}

function heroView(entry: HeroEntry | null, f: HeroSectionProps): HeroView {
  const localTrailerHref = entry?.extraId ? toApp(trailerPath(entry.id, entry.extraId)) : null;
  return {
    title: entry?.title ?? f.title,
    description: entry?.description ?? f.description,
    image: entry?.backdrop_url ?? entry?.poster_url ?? f.image,
    rating: entry?.rating != null ? entry.rating.toFixed(1) : f.rating,
    year: entry?.year != null ? String(entry.year) : f.year,
    playId: entry?.id ?? f.itemId,
    playType: entry ? entry.type : f.itemType ?? 'movie',
    ytKey: entry?.ytKey,
    trailerHref: localTrailerHref ?? entry?.trailerUrl ?? null,
    localTrailer: !!localTrailerHref,
  };
}

const reducedMotion = () =>
  typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/** A finger on the hero, from where it went down. */
interface Gesture {
  id: number;
  x0: number;
  y0: number;
  /** null until it moved past the slop; then across ('x', a swipe) or
   *  down ('y', the page's scroll - let go). */
  axis: GestureAxis | null;
  dx: number;
  dy: number;
  samples: Sample[];
}

/**
 * Trailer carousel hero. Each pool entry's backdrop, title and buttons for
 * ~20 s, then the next one slides in. Below the trailer:
 * a black-to-transparent gradient stack so the title + buttons stay
 * legible, plus aspect-ratio centering so a tall hero box (typical of
 * desktop layouts) crops a 16:9 video without letterboxing the frame.
 *
 * A swipe across it on a touch screen brings the next title (to the left)
 * or the previous one (to the right): the slides follow the finger and
 * settle on release, the pool going round, and the rotation waits while
 * the finger is down and starts its 20 s again on the title the swipe
 * brought, as on one a dot or an arrow key brought. Only a drag more
 * across than down is the hero's: the page scrolls under a vertical one
 * (touch-action: pan-y), and a tap on a button is a tap. The arrow keys
 * do the same while the hero has the focus. A mouse does not drag it:
 * the dots, the arrow keys.
 *
 * Falls back to the static backdrop image when:
 *   - The pool query hasn't completed yet (first 200 ms).
 *   - No catalogue entry has a usable trailer.
 */
export function HeroSection(props: HeroSectionProps) {
  const pool = useHeroPool();
  const { play, pending } = usePlayTitle();
  // Randomise the start index ONCE when the pool first arrives, so
  // refreshes don't always show the same entry. Subsequent cycles
  // tick monotonically through the pool. A pool there at once (the
  // session's cache) starts at its random index; one that arrives
  // later is seeded in an effect (not during render: setState during
  // render empties the page when the cascade hits the update-depth
  // limit), its slides shown once seeded - the static hero until then,
  // so no slides load for a start that is not the one shown.
  const [idx, setIdx] = useState(() => (pool.length > 0 ? Math.floor(Math.random() * pool.length) : 0));
  const [seeded, setSeeded] = useState(pool.length > 0);
  useEffect(() => {
    if (seeded || pool.length === 0) return;
    setIdx(Math.floor(Math.random() * pool.length));
    setSeeded(true);
  }, [seeded, pool.length]);
  const n = seeded ? pool.length : 0;
  const cur = wrapIndex(idx, n);

  // Pause auto-rotation while the user is hovering (mirrors
  // chino-androidtv's focus-pause behaviour). Without this, a user
  // reading the description or about to click Play / More Info loses
  // the card mid-action.
  const [paused, setPaused] = useState(false);
  // A finger dragging the slides, or a slide settling: the neighbours
  // show, and the rotation waits.
  const [moving, setMoving] = useState(false);
  // The title leaving as another settles in (lib/heroSwipe.ts heroSlides).
  const [leaving, setLeaving] = useState<Leaving | null>(null);
  // With two titles, the side the other one waits at: the finger's.
  const [side, setSide] = useState<-1 | 1>(1);

  const heroRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const gesture = useRef<Gesture | null>(null);
  // Ends the settling under way at once, where it was going.
  const settling = useRef<(() => void) | null>(null);
  // Where (px) the track starts its settle from once the slide brought in
  // is laid out - the layout effect below.
  const settleFrom = useRef<number | null>(null);
  // A drag's end makes no click on what was under the finger.
  const swallowClick = useRef(false);

  // The track from `from` px to rest, then `done`. The transform is set on
  // the element, not rendered: a drag moves it on every pointer move.
  const settle = (from: number, done: () => void) => {
    settling.current?.();
    const track = trackRef.current;
    let timer = 0;
    let ended = false;
    const onEnd = (e: TransitionEvent) => {
      if (e.target === track && e.propertyName === 'transform') end();
    };
    const end = () => {
      if (ended) return;
      ended = true;
      settling.current = null;
      window.clearTimeout(timer);
      if (track) {
        track.removeEventListener('transitionend', onEnd);
        track.style.transition = '';
        track.style.transform = '';
      }
      done();
    };
    if (!track || from === 0 || reducedMotion()) {
      end();
      return;
    }
    track.style.transition = 'none';
    track.style.transform = `translate3d(${from}px,0,0)`;
    // The start laid out before the transition, so it runs from there.
    void track.getBoundingClientRect();
    track.style.transition = `transform ${SETTLE_MS}ms ${SETTLE_EASE}`;
    track.style.transform = 'translate3d(0,0,0)';
    track.addEventListener('transitionend', onEnd);
    // transitionend does not come where nothing renders (a hidden tab).
    timer = window.setTimeout(end, SETTLE_MS + 100);
    settling.current = end;
  };

  // Brings in the title at `target`, from the right (dir 1) or the left
  // (dir -1); `from` is where the track is now, a swipe's drag, measured
  // from the slide brought in: by default one hero width off.
  const goTo = (target: number, dir: 1 | -1, from?: number) => {
    if (n < 2 || gesture.current?.axis === 'x') return;
    const to = wrapIndex(target, n);
    if (to === cur) return;
    settling.current?.();
    settleFrom.current = from ?? dir * (heroRef.current?.clientWidth ?? 0);
    setLeaving({ index: cur, pos: dir === 1 ? -1 : 1 });
    setMoving(true);
    setIdx(to);
  };

  useLayoutEffect(() => {
    const from = settleFrom.current;
    if (from === null) return;
    settleFrom.current = null;
    settle(from, () => {
      setLeaving(null);
      setMoving(false);
    });
    // settle is the render's own; only a slide brought in starts one.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idx, leaving]);

  // The rotation: ROTATE_MS on each title from when it came to rest, a
  // title a swipe, a key or a dot brought too; none while paused or moving.
  useEffect(() => {
    if (n < 2 || paused || moving) return;
    const t = window.setTimeout(() => goTo(cur + 1, 1), ROTATE_MS);
    return () => window.clearTimeout(t);
    // goTo is the render's own, with this cur.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [n, paused, moving, cur]);

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    // A new touch: the last drag's click, if any, has come by now.
    swallowClick.current = false;
    // Touch only: a mouse drag would fight text selection and clicks.
    if (n < 2 || e.pointerType !== 'touch' || !e.isPrimary) return;
    gesture.current = { id: e.pointerId, x0: e.clientX, y0: e.clientY, axis: null, dx: 0, dy: 0, samples: [{ t: e.timeStamp, x: e.clientX }] };
  };

  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const g = gesture.current;
    if (!g || e.pointerId !== g.id) return;
    const dx = e.clientX - g.x0;
    const dy = e.clientY - g.y0;
    if (g.axis === null) {
      g.axis = gestureAxis(dx, dy);
      if (g.axis === null) return;
      if (g.axis === 'y') {
        // The page's scroll.
        gesture.current = null;
        return;
      }
      settling.current?.();
      try {
        e.currentTarget.setPointerCapture(e.pointerId);
      } catch {
        // Not capturable: the moves still bubble here.
      }
      setMoving(true);
    }
    g.dx = dx;
    g.dy = dy;
    g.samples.push({ t: e.timeStamp, x: e.clientX });
    if (g.samples.length > 32) g.samples.splice(0, g.samples.length - 32);
    if (n === 2) {
      const s = dx < 0 ? 1 : -1;
      if (s !== side) setSide(s);
    }
    const track = trackRef.current;
    if (track) {
      track.style.transition = 'none';
      track.style.transform = `translate3d(${dx}px,0,0)`;
    }
  };

  const release = (e: ReactPointerEvent<HTMLDivElement>, cancelled: boolean) => {
    const g = gesture.current;
    if (!g || e.pointerId !== g.id) return;
    gesture.current = null;
    // A tap: its click goes through.
    if (g.axis !== 'x') return;
    swallowClick.current = true;
    window.setTimeout(() => {
      swallowClick.current = false;
    }, 400);
    const width = heroRef.current?.clientWidth ?? 0;
    const outcome = cancelled
      ? 'none'
      : swipeDecision({ dx: g.dx, dy: g.dy, vx: releaseVelocity(g.samples, e.timeStamp), width });
    if (outcome === 'none') {
      settle(g.dx, () => setMoving(false));
      return;
    }
    const dir = outcome === 'next' ? 1 : -1;
    goTo(cur + dir, dir, g.dx + dir * width);
  };

  const onKeyDown = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    if (n < 2 || e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
    e.preventDefault();
    // The focus on a slide's button would leave with the slide: it stays
    // in the hero.
    if (trackRef.current?.contains(document.activeElement)) heroRef.current?.focus({ preventScroll: true });
    const dir = e.key === 'ArrowRight' ? 1 : -1;
    goTo(cur + dir, dir);
  };

  // When the pool is empty (or first paint), render the original
  // static hero so the page never has an empty top.
  const slides = n > 0 ? heroSlides(n, cur, side, leaving).sort((a, b) => a.index - b.index) : [{ index: 0, pos: 0 }];
  const carousel = n > 1;

  return (
    <div
      ref={heroRef}
      className={`relative h-[280px] sm:h-[360px] md:h-[460px] lg:h-[500px] rounded-xl overflow-hidden mb-8 bg-black ${
        carousel ? 'touch-pan-y touch-pinch-zoom focus:outline-none focus-visible:ring-2 focus-visible:ring-chino-accent' : ''
      }`}
      {...(carousel ? { tabIndex: 0, role: 'region', 'aria-roledescription': 'carousel', 'aria-label': 'Featured titles' } : {})}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocusCapture={() => setPaused(true)}
      onBlurCapture={(e) => {
        // Only un-pause when focus actually leaves the hero, not on
        // intra-hero focus moves (button → button).
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
          setPaused(false);
        }
      }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={(e) => release(e, false)}
      onPointerCancel={(e) => release(e, true)}
      onClickCapture={(e) => {
        if (!swallowClick.current) return;
        swallowClick.current = false;
        e.preventDefault();
        e.stopPropagation();
      }}
      onKeyDown={onKeyDown}
    >
      {/* The slides: the one on show, and at its sides the ones a swipe
          brings in (lib/heroSwipe.ts heroSlides), hidden until a finger
          drags them in. Keyed by their title's place in the pool, so the
          one brought in keeps its image as it comes to rest. */}
      <div ref={trackRef} className="absolute inset-0" aria-live={carousel && paused ? 'polite' : 'off'}>
        {slides.map(({ index, pos }) => {
          const shown = pos === 0;
          const view = heroView(n > 0 ? pool[index] ?? null : null, props);
          return (
            <div
              key={index}
              className="absolute inset-0"
              style={{
                transform: pos ? `translateX(${pos * 100}%)` : undefined,
                visibility: shown || moving ? undefined : 'hidden',
              }}
              aria-hidden={shown ? undefined : true}
              {...(carousel ? { role: 'group', 'aria-roledescription': 'slide', 'aria-label': `${index + 1} of ${n}` } : {})}
            >
              <HeroSlide
                view={view}
                shown={shown}
                dots={carousel}
                pending={pending}
                onPlay={() => {
                  // A series plays its next episode, or S01E01 (usePlayTitle) —
                  // not the series' own id, which has no stream.
                  if (view.playId) void play(view.playId, view.playType);
                }}
                onDetail={() => {
                  if (view.playId) window.location.assign(toApp(`/i/${encodeURIComponent(view.playId)}`));
                }}
              />
            </div>
          );
        })}
      </div>

      {/* Dot indicator: which slot in the carousel we're on.
          Visible only when there's more than one entry. Click to
          jump. Over the slides, where each leaves it room under its
          buttons, so the dots stay put while the slides move.
          Each dot is its 8 px square in a tap area of its own, the
          areas side by side and the dots spaced by them: 40 px tall -
          the 16 px over the dot up to the buttons, and the padding
          under it - and 40 px wide; 32 under 360 px, where eight at 40
          would not fit, and 44 from sm. The negative margins keep each
          dot where it was in its row: the first under Play's edge. */}
      {carousel && (
        <div className="absolute left-0 bottom-0 p-4 sm:p-6 md:p-10 lg:p-12 pointer-events-none">
          <div
            className="flex -mb-4 -ml-3 min-[360px]:-ml-4 sm:-ml-[18px] pointer-events-auto"
            title={paused ? 'Auto-rotation paused' : undefined}
          >
            {pool.map((_, i) => (
              <button
                key={i}
                onClick={() => goTo(i, i > cur ? 1 : -1)}
                className="group w-8 min-[360px]:w-10 sm:w-11 h-10 flex items-center justify-center"
                title={`Show ${i + 1}/${n}`}
              >
                <span
                  aria-hidden="true"
                  className={`w-2 h-2 transition-all ${
                    i === cur
                      ? paused
                        ? 'bg-white ring-1 ring-white/60 ring-offset-1 ring-offset-black'
                        : 'bg-white'
                      : 'bg-white/30 group-hover:bg-white/60'
                  }`}
                />
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

interface HeroSlideProps {
  view: HeroView;
  /** The slide on show; the others wait at its sides for a swipe. */
  shown: boolean;
  /** Room under the buttons for the dots, which sit over the slides. */
  dots: boolean;
  pending: boolean;
  onPlay: () => void;
  onDetail: () => void;
}

function HeroSlide({ view, shown, dots, pending, onPlay, onDetail }: HeroSlideProps) {
  return (
    <>
      {/* Backdrop — sits on the right edge of the hero. On ultra-wide
          screens the image is capped at max-w-[1100px] so it stops
          stretching past its natural 16:9 aspect.
          maskImage applies a fade-to-transparent on the image's
          left edge so the image bleeds into the black hero
          background where the title + buttons sit. */}
      <FadeImage
        src={view.image}
        alt={view.title}
        fallbackTitle={view.title}
        className="absolute inset-y-0 right-0 w-full md:w-[60%] md:max-w-[1100px] h-full object-cover object-center [mask-image:linear-gradient(to_left,black_0%,black_60%,transparent_100%)] [-webkit-mask-image:linear-gradient(to_left,black_0%,black_60%,transparent_100%)]"
      />

      {/* Trailer iframe — temporarily disabled at user request; the
          backdrop image alone is the hero. The constant flag below
          flips the embed back on in one line when we want trailers
          on the hero again. The pool / rotation still target trailer-
          bearing items so the surface is ready. Only on the slide on
          show: a neighbour waiting for a swipe plays nothing. */}
      {TRAILERS_ON_HERO && shown && view.ytKey ? (
        <div className="absolute inset-y-0 right-0 w-full md:w-[60%] md:max-w-[1100px] flex items-center justify-center pointer-events-none [mask-image:linear-gradient(to_left,black_0%,black_60%,transparent_100%)] [-webkit-mask-image:linear-gradient(to_left,black_0%,black_60%,transparent_100%)]">
          <div className="w-full h-full max-w-none aspect-video">
            <iframe
              key={view.ytKey}
              src={`https://www.youtube.com/embed/${view.ytKey}?autoplay=1&mute=1&controls=0&loop=1&playlist=${view.ytKey}&modestbranding=1&playsinline=1&rel=0&iv_load_policy=3&disablekb=1`}
              title={`${view.title} — trailer`}
              className="w-full h-full"
              allow="autoplay; encrypted-media"
              referrerPolicy="strict-origin-when-cross-origin"
              loading="lazy"
            />
          </div>
        </div>
      ) : null}

      {/* Mobile-only bottom-up gradient so the title text remains
          legible when overlaid on the full-width image. Desktop uses
          the maskImage on the backdrop itself (above) — no extra
          overlay needed since the image already fades to transparent
          on its right edge. */}
      <div className="absolute inset-0 bg-gradient-to-t from-black via-black/70 to-transparent md:hidden" />

      {/* Edge fade — softens the iframe's hard edges so the carousel
          blends with the page background. */}
      <div className="absolute inset-0 pointer-events-none [box-shadow:inset_0_0_120px_60px_rgba(0,0,0,0.55)]" />

      {/* Text column. The container occupies the full vertical extent
          and uses justify-between so the title/meta/description anchor
          to the TOP and the buttons + carousel dots anchor to the
          BOTTOM (per user request). Inner wrapper caps width so long
          descriptions don't run all the way to the gradient
          transition. Mobile keeps the same split — title sits in the
          dark top area, controls in the bottom one. */}
      <div className="absolute inset-0 flex flex-col p-4 sm:p-6 md:p-10 lg:p-12">
        {/* Top group: title + meta + description. */}
        <div className="md:mr-auto md:max-w-[45%] md:text-left">
          <h1 className="text-2xl sm:text-3xl md:text-4xl lg:text-5xl font-bold text-white mb-2 md:mb-4 line-clamp-2 drop-shadow-lg">
            {view.title}
          </h1>

          <div className="flex items-center gap-3 mb-2 md:mb-4 text-xs sm:text-sm">
            {view.year && <span className="text-white drop-shadow">{view.year}</span>}
            {view.rating && (
              <>
                <span className="text-chino-muted">•</span>
                <span className="px-2 py-0.5 bg-chino-accent text-white rounded">{view.rating}</span>
              </>
            )}
          </div>

          {/* hidden on mobile; md+ uses line-clamp-3 directly (display
              is -webkit-box). The prior class set was
              `hidden md:block ... line-clamp-3` — `md:block` set
              display:block on desktop, which raced with line-clamp's
              display:-webkit-box and won depending on stylesheet
              ordering, so the description rendered un-clamped and
              spilled below the hero box for long synopses
              (e.g. Star Wars Rebels). */}
          <p className="hidden md:line-clamp-3 text-chino-text text-base lg:text-lg drop-shadow">
            {view.description}
          </p>
        </div>

        {/* Spacer pushes the controls group to the bottom. */}
        <div className="flex-1" />

        {/* Bottom group: Play + More Info, then the room for the
            rotation dots. */}
        <div className="md:mr-auto md:max-w-[45%]">
          <div className="flex gap-2 md:gap-4">
            <button
              onClick={onPlay}
              disabled={!view.playId || pending}
              className="flex items-center gap-2 px-4 py-2 md:px-6 md:py-3 bg-chino-accent hover:bg-chino-accent/80 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg transition-colors text-sm md:text-base"
            >
              <Play className="w-4 h-4 md:w-5 md:h-5 fill-white" />
              <span>Play</span>
            </button>
            <button
              onClick={onDetail}
              disabled={!view.playId}
              className="flex items-center gap-2 px-4 py-2 md:px-6 md:py-3 bg-white/20 hover:bg-white/30 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg backdrop-blur-sm transition-colors text-sm md:text-base"
            >
              <Info className="w-4 h-4 md:w-5 md:h-5" />
              <span>More Info</span>
            </button>
            {view.trailerHref ? (
              <a
                href={view.trailerHref}
                {...(view.localTrailer ? {} : { target: '_blank', rel: 'noopener noreferrer' })}
                className="flex items-center gap-2 px-4 py-2 md:px-6 md:py-3 bg-white/20 hover:bg-white/30 text-white rounded-lg backdrop-blur-sm transition-colors text-sm md:text-base"
                title={view.localTrailer ? 'Play the trailer' : 'Watch trailer on YouTube'}
              >
                {view.localTrailer ? (
                  <Clapperboard className="w-4 h-4 md:w-5 md:h-5" />
                ) : (
                  <Youtube className="w-4 h-4 md:w-5 md:h-5" />
                )}
                <span>Trailer</span>
              </a>
            ) : null}
          </div>

          {/* The dots' row, h-2 under mt-4: they sit over the slides. */}
          {dots ? <div aria-hidden="true" className="h-2 mt-4" /> : null}
        </div>
      </div>
    </>
  );
}
