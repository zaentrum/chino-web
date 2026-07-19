import { useEffect, useRef, useState } from 'react';
import { Check, ChevronDown, ChevronRight, Eye, Play, Plus } from 'lucide-react';
import type { Season } from '../hooks/useSeriesEpisodes';
import { useWatchedToggle } from '../hooks/useWatchedToggle';
import { toApp } from '../lib/basepath';
import { AddToListPicker } from './AddToListPicker';
import { FadeImage } from './FadeImage';

// Saved playback position for one episode, cross-referenced by the
// caller from the continue-watching feed (the episodes payload itself
// carries no per-user progress).
export interface EpisodeProgress {
  position_sec: number;
  duration_sec: number;
}

interface EpisodesListProps {
  seasons: Season[];
  // When set (deep-link /i/<seriesId>?ep=<episodeId>), open the season
  // that contains this episode, scroll it into view, and highlight it.
  focusEpisodeId?: string;
  // episodeId -> in-progress resume state; rows present here render a
  // progress bar + "Resume · Xm left" line. Absent/undefined = no
  // resume affordance (row click still plays from the top / auto-
  // resumes server-side as before).
  progressById?: Record<string, EpisodeProgress>;
}

/**
 * Series detail page's episodes section. Each season is an accordion with
 * a stills strip; episodes are clickable rows that jump straight to the
 * player. Defaults to season 1 open; subsequent seasons toggle on click
 * so a 30-episode series doesn't render a huge wall of HTML.
 */
export function EpisodesList({ seasons, focusEpisodeId, progressById }: EpisodesListProps) {
  // Episodes that have no SxxEyy coordinates land in season 0; hide that
  // accordion unless it's the only one, since the rest are usually
  // already covered by named seasons.
  const visible = seasons.filter((s) => s.season > 0 || seasons.length === 1);

  // The season that holds the focused episode, if any — it drives the
  // default-open season so a deep-linked episode is revealed on load.
  const focusSeason = focusEpisodeId
    ? visible.find((s) => s.episodes.some((e) => e.id === focusEpisodeId))?.season
    : undefined;

  // Which accordions start open. seasons load ASYNC (useSeriesEpisodes), so the
  // first mount usually has an empty list — a useState *initializer* would lock
  // in "nothing open" forever and the season never reveals (the deep-linked
  // episode's season stays collapsed, so its row never mounts and never
  // scrolls). Instead seed once, in an effect, as soon as the seasons arrive:
  // the focused episode's season on a deep-link (?ep=), else the first season.
  // seeded guards against re-clobbering the user's later manual toggles.
  const [open, setOpen] = useState<Record<number, boolean>>({});
  const seeded = useRef(false);
  useEffect(() => {
    if (seeded.current || !visible.length) return;
    seeded.current = true;
    const next: Record<number, boolean> = {};
    visible.forEach((s, i) => {
      next[s.season] = focusSeason != null ? s.season === focusSeason : i === 0;
    });
    setOpen(next);
  }, [visible.length, focusSeason]);

  if (!visible.length) return null;

  return (
    <div className="mt-10">
      <h2 className="text-2xl font-semibold mb-4 text-white">Episodes</h2>
      <div className="space-y-3">
        {visible.map((s) => (
          <SeasonAccordion
            key={s.season}
            season={s}
            open={!!open[s.season]}
            onToggle={() => setOpen((m) => ({ ...m, [s.season]: !m[s.season] }))}
            focusEpisodeId={focusEpisodeId}
            progressById={progressById}
          />
        ))}
      </div>
    </div>
  );
}

function SeasonAccordion({
  season,
  open,
  onToggle,
  focusEpisodeId,
  progressById,
}: {
  season: Season;
  open: boolean;
  onToggle: () => void;
  focusEpisodeId?: string;
  progressById?: Record<string, EpisodeProgress>;
}) {
  // No overflow-hidden here: corners are square (theme maps rounded-* to
  // 0) so it clipped nothing visible, but it DID clip a row's
  // add-to-list popover past the accordion's bottom edge.
  return (
    <div className="rounded-lg bg-chino-surface border border-chino-border-2">
      <button
        onClick={onToggle}
        className="w-full px-4 py-3 flex items-center justify-between text-left hover:bg-chino-surface-2 transition-colors"
      >
        <span className="text-white font-medium">
          Season {season.season} <span className="text-chino-muted text-sm ml-2">{season.episodes.length} episodes</span>
        </span>
        {open ? (
          <ChevronDown className="w-5 h-5 text-chino-muted" />
        ) : (
          <ChevronRight className="w-5 h-5 text-chino-muted" />
        )}
      </button>
      {open ? (
        <div className="divide-y divide-chino-border-2">
          {season.episodes.map((e) => (
            <EpisodeRow
              key={e.id}
              ep={e}
              seasonNum={season.season}
              focused={!!focusEpisodeId && e.id === focusEpisodeId}
              progress={progressById?.[e.id]}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

function EpisodeRow({
  ep,
  seasonNum,
  focused,
  progress,
}: {
  ep: Season['episodes'][number];
  seasonNum: number;
  focused?: boolean;
  progress?: EpisodeProgress;
}) {
  // Deep-link focus: scroll the row into the viewport centre once mounted. The
  // row only exists after its season auto-expands, so defer one frame (rAF) to
  // let the just-expanded accordion + hero settle before measuring — a bare
  // scrollIntoView can fire mid-layout and land short.
  const rowRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!focused) return;
    const id = requestAnimationFrame(() => {
      rowRef.current?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    });
    return () => cancelAnimationFrame(id);
  }, [focused]);

  const runtimeMin = ep.duration_ms ? Math.round(ep.duration_ms / 60_000) : 0;
  const epNum = ep.episode_number ?? 0;
  const epLabel = `S${seasonNum.toString().padStart(2, '0')}E${epNum.toString().padStart(2, '0')}`;

  // Seed from the catalogue stamp; flip locally on toggle so the row
  // reflects the user's click without a refetch. Reset if the ep prop
  // identity changes (e.g. season swap reuses the same row position).
  const toggleWatched = useWatchedToggle();
  const [watchedOverride, setWatchedOverride] = useState<boolean | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  // Handed to the picker as ignoreRef so a mousedown on the open "+"
  // trigger doesn't count as outside-click: the picker would close on
  // mousedown and the trigger's click toggle would instantly reopen it.
  const pickerTriggerRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    setWatchedOverride(null);
    setPickerOpen(false);
  }, [ep.id]);
  const watched = watchedOverride ?? !!ep.watched_at;

  // Resume state (from the continue-watching feed via progressById).
  // duration_sec can be 0 on rows that never recorded one — fall back
  // to the catalogue runtime so the bar / remaining still render.
  const durSec =
    progress && progress.duration_sec > 0
      ? progress.duration_sec
      : ep.duration_ms
        ? ep.duration_ms / 1000
        : 0;
  const progressPct =
    progress && durSec > 0 ? Math.min(100, (progress.position_sec / durSec) * 100) : 0;
  // CEIL per the cross-client resume spec: 30 s left reads "1m left",
  // 61 s reads "2m left" — never under-report the remainder.
  const remainingMin =
    progress && durSec > 0 ? Math.max(1, Math.ceil((durSec - progress.position_sec) / 60)) : null;

  const open = () => window.location.assign(toApp(`/player/${encodeURIComponent(ep.id)}`));

  // The outer is a div + role=button so we can host real <button>
  // elements inside (watched toggle). Native <button> nesting is
  // invalid HTML and React warns about it. Keyboard handler covers
  // Enter / Space for the same parity as the previous <button>.
  return (
    <div
      ref={rowRef}
      role="button"
      tabIndex={0}
      aria-current={focused ? 'true' : undefined}
      onClick={open}
      onKeyDown={(e) => {
        // Only when the ROW itself is the focused target — keys inside
        // nested controls (the add-to-list picker's "New list" input,
        // the overlay buttons) bubble here and must not hijack Enter /
        // Space into opening the player.
        if (e.target !== e.currentTarget) return;
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          open();
        }
      }}
      className={`w-full flex items-stretch gap-4 px-4 py-3 text-left hover:bg-chino-surface-2 transition-colors group cursor-pointer focus:outline-none focus:bg-chino-surface-2 ${
        focused ? 'bg-chino-surface-2 ring-1 ring-inset ring-chino-accent' : ''
      }`}
    >
      {/* overflow lifts to visible while the add-to-list picker is open
          so the popover isn't clipped to the 160px thumbnail — same
          idiom as MediaCard. */}
      <div
        className={`relative w-40 aspect-video rounded bg-chino-bg shrink-0 ${
          pickerOpen ? 'overflow-visible z-40' : 'overflow-hidden'
        }`}
      >
        <FadeImage
          src={ep.backdrop_url || ep.poster_url}
          alt=""
          fallbackTitle={ep.title}
          className="w-full h-full object-cover"
          loading="lazy"
          // If the backdrop endpoint 404s (artwork stored only as
          // poster from older enrichment runs), retry with poster_url
          // so the row still gets an image. When that also fails (or no
          // poster exists), FadeImage renders the DS artwork placeholder.
          onError={(e) => {
            const img = e.currentTarget;
            if (ep.poster_url && img.src !== ep.poster_url) img.src = ep.poster_url;
          }}
        />

        {/* Watched toggle. Always rendered so a watched episode keeps a
            visible green check; on unwatched rows it stays hidden until
            hover (or focus, for keyboard users). Click swallows the
            row's open handler so the user toggles instead of opening
            the player. */}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            const next = !watched;
            setWatchedOverride(next);
            void toggleWatched(ep.id, next);
          }}
          className={`absolute top-1.5 right-1.5 w-6 h-6 flex items-center justify-center shadow-md ring-1 ring-black/30 transition-opacity ${
            watched
              ? 'bg-chino-green/95 hover:bg-chino-green opacity-100'
              : 'bg-black/60 hover:bg-black/80 opacity-0 group-hover:opacity-100 focus:opacity-100'
          }`}
          title={watched ? 'Mark as unwatched' : 'Mark as watched'}
          aria-pressed={watched}
          aria-label={watched ? 'Mark episode as unwatched' : 'Mark episode as watched'}
        >
          {watched ? (
            <Check className="w-3.5 h-3.5 text-white" strokeWidth={3} />
          ) : (
            <Eye className="w-3.5 h-3.5 text-white" />
          )}
        </button>

        {/* Add-to-list. Same overlay idiom as the watched toggle: hidden
            until hover/focus (pinned visible while its picker is open),
            stopPropagation so the click doesn't open the player. Sits
            left of the watched toggle. */}
        <button
          ref={pickerTriggerRef}
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setPickerOpen((v) => !v);
          }}
          className={`absolute top-1.5 right-9 w-6 h-6 flex items-center justify-center shadow-md ring-1 ring-black/30 transition-opacity bg-black/60 hover:bg-black/80 ${
            pickerOpen ? 'opacity-100' : 'opacity-0 group-hover:opacity-100 focus:opacity-100'
          }`}
          title="Add to list…"
          aria-haspopup="menu"
          aria-expanded={pickerOpen}
          aria-label="Add episode to a list"
        >
          <Plus className="w-3.5 h-3.5 text-white" />
        </button>
        {pickerOpen ? (
          // alignX="left": the anchor is the 160px thumbnail, so a
          // right-anchored 256px popover would stick 96px out past the
          // thumbnail's LEFT edge — off-viewport below ~1260px wide.
          // Left-anchoring opens it rightward over the text column.
          <AddToListPicker
            itemId={ep.id}
            alignX="left"
            ignoreRef={pickerTriggerRef}
            onClose={() => setPickerOpen(false)}
          />
        ) : null}

        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-colors flex items-center justify-center pointer-events-none">
          <Play className="w-8 h-8 text-white opacity-0 group-hover:opacity-100 fill-white transition-opacity" />
        </div>

        {/* In-progress state cross-referenced from the continue-watching
            feed — thin accent bar across the thumbnail bottom, same as
            the home CW cards. */}
        {progressPct > 0 ? (
          <div className="absolute bottom-0 left-0 right-0 h-1 bg-chino-border">
            <div className="h-full bg-chino-accent" style={{ width: `${progressPct}%` }} />
          </div>
        ) : null}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-3">
          <span className="text-chino-accent text-sm font-medium">{epLabel}</span>
          <span className={`font-medium truncate ${watched ? 'text-chino-muted' : 'text-white'}`}>
            {ep.title}
          </span>
          {runtimeMin ? (
            <span className="text-chino-muted text-xs ml-auto shrink-0">{runtimeMin}m</span>
          ) : null}
        </div>
        {progress ? (
          <div className="text-chino-accent text-xs font-medium mt-0.5">
            {remainingMin != null ? `Resume · ${remainingMin}m left` : 'Resume'}
          </div>
        ) : null}
        {ep.description ? (
          <p className="text-chino-muted text-sm mt-1 line-clamp-2">{ep.description}</p>
        ) : null}
      </div>
    </div>
  );
}
