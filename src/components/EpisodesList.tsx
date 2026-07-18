import { useEffect, useRef, useState } from 'react';
import { Check, ChevronDown, ChevronRight, Eye, Play } from 'lucide-react';
import type { Season } from '../hooks/useSeriesEpisodes';
import { useWatchedToggle } from '../hooks/useWatchedToggle';
import { toApp } from '../lib/basepath';
import { FadeImage } from './FadeImage';

interface EpisodesListProps {
  seasons: Season[];
  // When set (deep-link /i/<seriesId>?ep=<episodeId>), open the season
  // that contains this episode, scroll it into view, and highlight it.
  focusEpisodeId?: string;
}

/**
 * Series detail page's episodes section. Each season is an accordion with
 * a stills strip; episodes are clickable rows that jump straight to the
 * player. Defaults to season 1 open; subsequent seasons toggle on click
 * so a 30-episode series doesn't render a huge wall of HTML.
 */
export function EpisodesList({ seasons, focusEpisodeId }: EpisodesListProps) {
  // Episodes that have no SxxEyy coordinates land in season 0; hide that
  // accordion unless it's the only one, since the rest are usually
  // already covered by named seasons.
  const visible = seasons.filter((s) => s.season > 0 || seasons.length === 1);

  // The season that holds the focused episode, if any — it drives the
  // default-open season so a deep-linked episode is revealed on load.
  const focusSeason = focusEpisodeId
    ? visible.find((s) => s.episodes.some((e) => e.id === focusEpisodeId))?.season
    : undefined;

  // Open state: focused episode's season if deep-linked, else first open.
  const initial: Record<number, boolean> = {};
  visible.forEach((s, i) => {
    initial[s.season] = focusSeason != null ? s.season === focusSeason : i === 0;
  });
  const [open, setOpen] = useState<Record<number, boolean>>(initial);

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
}: {
  season: Season;
  open: boolean;
  onToggle: () => void;
  focusEpisodeId?: string;
}) {
  return (
    <div className="rounded-lg bg-chino-surface border border-chino-border-2 overflow-hidden">
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
}: {
  ep: Season['episodes'][number];
  seasonNum: number;
  focused?: boolean;
}) {
  // Deep-link focus: scroll the row into the viewport centre once mounted.
  const rowRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (focused && rowRef.current) {
      rowRef.current.scrollIntoView({ block: 'center' });
    }
  }, [focused]);

  const runtimeMin = ep.duration_ms ? Math.round(ep.duration_ms / 60_000) : 0;
  const epNum = ep.episode_number ?? 0;
  const epLabel = `S${seasonNum.toString().padStart(2, '0')}E${epNum.toString().padStart(2, '0')}`;

  // Seed from the catalogue stamp; flip locally on toggle so the row
  // reflects the user's click without a refetch. Reset if the ep prop
  // identity changes (e.g. season swap reuses the same row position).
  const toggleWatched = useWatchedToggle();
  const [watchedOverride, setWatchedOverride] = useState<boolean | null>(null);
  useEffect(() => {
    setWatchedOverride(null);
  }, [ep.id]);
  const watched = watchedOverride ?? !!ep.watched_at;

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
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          open();
        }
      }}
      className={`w-full flex items-stretch gap-4 px-4 py-3 text-left hover:bg-chino-surface-2 transition-colors group cursor-pointer focus:outline-none focus:bg-chino-surface-2 ${
        focused ? 'bg-chino-surface-2 ring-1 ring-inset ring-chino-accent' : ''
      }`}
    >
      <div className="relative w-40 aspect-video rounded overflow-hidden bg-chino-bg shrink-0">
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

        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-colors flex items-center justify-center pointer-events-none">
          <Play className="w-8 h-8 text-white opacity-0 group-hover:opacity-100 fill-white transition-opacity" />
        </div>
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
        {ep.description ? (
          <p className="text-chino-muted text-sm mt-1 line-clamp-2">{ep.description}</p>
        ) : null}
      </div>
    </div>
  );
}
