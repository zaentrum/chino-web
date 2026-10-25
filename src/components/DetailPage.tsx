import { useEffect, useMemo, useState } from 'react';
import { useAuth } from 'react-oidc-context';
import { ArrowLeft, Clapperboard, House, Loader2, Play, Star, Youtube } from 'lucide-react';
import { useLikes } from '../hooks/useUserFlags';
import { useWatchedToggle } from '../hooks/useWatchedToggle';
import { useItem } from '../hooks/useItem';
import { useSeriesEpisodes } from '../hooks/useSeriesEpisodes';
import { useSimilarItems } from '../hooks/useSimilarItems';
import { useContinueWatching } from '../hooks/useContinueWatching';
import { usePlayTitle } from '../hooks/usePlayTitle';
import { useCatalogGen } from '../hooks/useCatalogEvents';
import { AddToListControl, LikedToggle, WatchedToggle } from './TitleActions';
import { EpisodesList, type EpisodeProgress } from './EpisodesList';
import { FadeImage } from './FadeImage';
import { CastNames, Starring } from './Credits';
import { MetaItem } from './MetaItem';
import { toApp } from '../lib/basepath';
import { groupCredits } from '../lib/credits';
import { languageName } from '../lib/languages';
import { ratingBadge } from '../lib/ratings';
import { trailerChoice, trailerPath } from '../lib/trailers';
import { episodeCode } from '../lib/episodeFiles';
import { seriesPlayTarget } from '../lib/seriesPlay';
import {
  ACTION_FOCUS,
  ACTION_GAP,
  ACTION_HEIGHT,
  ACTION_LABEL,
  OFF_LOOK,
  PLAY,
  PLAY_LOOK,
  START_OVER,
  TRAILER,
  resumeLabel,
  seriesPlayLabel,
} from '../lib/titleActions';
import { MediaRow } from './MediaRow';
import { StatusPage } from './StatusPage';

interface DetailPageProps {
  itemId: string;
}

/**
 * Movie / show detail page. Renders backdrop hero + poster + metadata +
 * play / resume buttons. For series, also renders an Episodes accordion.
 * Fetches catalogue metadata and the saved playback position in parallel
 * so the "Resume from X" button shows immediately if relevant.
 */
export function DetailPage({ itemId }: DetailPageProps) {
  const auth = useAuth();
  const { data, loading, status, retry } = useItem(itemId);
  // Live refresh generation — bumps on catalog changes and on a bfcache
  // Back restore. Wired into the resume-position effect below so the
  // header Resume button refetches alongside the CW-driven row state
  // instead of showing the pre-playback position.
  const gen = useCatalogGen();
  const [resumeSec, setResumeSec] = useState<number>(0);

  // Episodes are fetched only for type=series — the hook short-circuits
  // when the id is undefined.
  const isSeries = data?.type === 'series';
  const { seasons, loading: seasonsLoading } = useSeriesEpisodes(isSeries ? itemId : undefined);
  // "More like this" — up to 12 recommendations scored on shared
  // genre + cast (tracker #115). Hook returns [] when nothing
  // scored above zero; the row below short-circuits in that case.
  const { items: similar } = useSimilarItems(itemId, 12);
  // Per-episode resume state for the Episodes accordion. The
  // /series/{id}/episodes payload carries NO per-user progress, so
  // cross-reference the continue-watching feed (it carries
  // position/duration for episodes too). Canonical cross-client
  // resume-row predicate: include iff !up_next && position_sec > 30 &&
  // (duration_sec <= 0 || position_sec < duration_sec - 60). up_next
  // rows are server-substituted "next episode" suggestions with no real
  // progress; <= 30 s isn't meaningfully started; >= duration - 60 is
  // the server's own finished cutoff. Rows with duration_sec <= 0 are
  // KEPT — the episode row falls back to the catalogue runtime
  // (duration_ms/1000) for the bar + remaining label.
  //
  // enabled: movie pages never mount the Episodes accordion, so the
  // /me/continue-watching fetch would be wasted there. `data?.type !==
  // 'movie'` is the simplest correct gate: fetch while the type is
  // still unknown (data == null) and for series; skip once the item is
  // known to be a movie. (An in-flight fetch from the unknown phase is
  // aborted by the hook's effect cleanup when the gate flips false.)
  const { items: cwItems } = useContinueWatching({ enabled: data?.type !== 'movie' });
  const episodeProgress = useMemo(() => {
    const map: Record<string, EpisodeProgress> = {};
    for (const it of cwItems ?? []) {
      if (it.up_next) continue;
      if (!(it.position_sec > 30)) continue;
      if (it.duration_sec > 0 && it.position_sec >= it.duration_sec - 60) continue;
      map[it.id] = { position_sec: it.position_sec, duration_sec: it.duration_sec };
    }
    return map;
  }, [cwItems]);
  const likes = useLikes();
  const liked = likes.has(itemId);

  // What Play on a series plays - a series has no stream of its own - as
  // the TV app has it (lib/seriesPlay.ts): the episode the viewer is in,
  // resumed, or the next one, else S01E01. null while Continue watching or
  // the episodes are still coming, and for a series with no episodes.
  const seriesKnown = isSeries && cwItems !== null && !seasonsLoading;
  const seriesPlay = useMemo(
    () => (seriesKnown ? seriesPlayTarget(itemId, cwItems, seasons) : null),
    [seriesKnown, itemId, cwItems, seasons],
  );
  // Until then Play looks the episode up itself (usePlayTitle).
  const { play: playTitle, pending: playPending } = usePlayTitle();

  // Watched state: seed from the catalogue payload's watched_at stamp,
  // override locally on toggle so the button reflects the user's most
  // recent click without a refetch. resetting when itemId changes
  // matters because <DetailPage> is reused across navigations.
  const toggleWatched = useWatchedToggle();
  const [watchedOverride, setWatchedOverride] = useState<boolean | null>(null);
  useEffect(() => {
    setWatchedOverride(null);
  }, [itemId]);
  const watched = watchedOverride ?? !!data?.watched_at;

  // Resume position. `gen` in the deps refetches it on catalog bumps —
  // most importantly the bfcache Back restore, where the pre-playback
  // position would otherwise stick on the Resume button.
  useEffect(() => {
    if (auth.isLoading || !auth.isAuthenticated) return;
    const ctrl = new AbortController();
    fetch(`/api/v1/items/${itemId}/progress`, {
      signal: ctrl.signal,
      headers: { Authorization: `Bearer ${auth.user?.access_token ?? ''}` },
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => setResumeSec(typeof j?.position_sec === 'number' ? j.position_sec : 0))
      .catch(() => undefined);
    return () => ctrl.abort();
  }, [itemId, auth.isAuthenticated, auth.isLoading, auth.user?.access_token, gen]);

  // An episode id has no standalone detail page — it duplicates the
  // series' Episodes list. Redirect to the parent series detail with the
  // episode carried in ?ep= so the season overview focuses + highlights
  // it. replace() keeps the episode URL out of history.
  const redirectEpisodeId =
    data?.type === 'episode' && data.parent_id ? data.parent_id : null;
  useEffect(() => {
    if (redirectEpisodeId) {
      window.location.replace(
        toApp(`/i/${encodeURIComponent(redirectEpisodeId)}?ep=${encodeURIComponent(itemId)}`),
      );
    }
  }, [redirectEpisodeId, itemId]);

  // Not there, or not loaded: say which, with a way back — not a
  // spinner that never stops.
  if (status === 'not-found') {
    return (
      <StatusPage
        title="Title not found"
        message="There's no title at this address in the library. The link may be wrong, or the title has been removed."
      />
    );
  }
  if (status === 'error' && !data) {
    return (
      <StatusPage
        title="Couldn't load this title"
        message="The catalog didn't answer. Check your connection, or try again in a moment."
        onRetry={retry}
      />
    );
  }

  if (loading || !data || redirectEpisodeId) {
    return (
      <div className="min-h-screen bg-chino-bg text-chino-muted flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin" aria-label="Loading" />
      </div>
    );
  }

  // Deep-link focus: /i/<seriesId>?ep=<episodeId> focuses that episode in
  // the season overview.
  const focusEpisodeId =
    new URLSearchParams(window.location.search).get('ep') || undefined;

  const goPlayer = (resume?: boolean) => {
    // The player auto-resumes by default. Pass ?startover=1 to force a
    // clean start, ?resume=<sec> as a hint for the resume-from path.
    const qp = resume ? `?resume=${resumeSec}` : resumeSec > 30 ? '?startover=1' : '';
    window.location.assign(toApp(`/player/${encodeURIComponent(itemId)}${qp}`));
  };
  // A series' episode, resumed where the viewer is, or from the start.
  const goEpisode = (episodeId: string, resumeAt: number | null) => {
    const qp = resumeAt != null ? `?resume=${resumeAt}` : seriesPlay && seriesPlay.resumeSec > 0 ? '?startover=1' : '';
    window.location.assign(toApp(`/player/${encodeURIComponent(episodeId)}${qp}`));
  };
  const seriesCode =
    seriesPlay && seriesPlay.season != null && seriesPlay.episode != null
      ? episodeCode(seriesPlay.season, seriesPlay.episode, seriesPlay.episodeEnd)
      : null;

  const runtimeMin = data.duration_ms ? Math.round(data.duration_ms / 60_000) : 0;
  const runtimeText = runtimeMin
    ? runtimeMin >= 60
      ? `${Math.floor(runtimeMin / 60)}h ${runtimeMin % 60}m`
      : `${runtimeMin}m`
    : null;

  // The actors, and the rest of the credits by role ("Created by",
  // "Directors", "Music", …) in the order lib/credits.ts lists them.
  const { actors, crew } = groupCredits(data.cast);
  // The trailer this server plays, on the trailer page; else the link to
  // one online (lib/trailers.ts). A movie's or a series'.
  const trailer = trailerChoice(data);
  const rated = ratingBadge(data);

  return (
    <div className="min-h-screen bg-chino-bg text-white">
      {/* Hero: full-width backdrop with a top-to-bottom gradient that
          fades into the page bg so the content below sits flush.
          aspect-[21/9] gives a cinematic shape on phones; max-h cap
          (60vh) keeps the title + Play button above the fold on
          typical desktop monitors so the user doesn't have to scroll
          to find the actionable controls. */}
      <div className="relative">
        <div className="aspect-[21/9] max-h-[60vh] w-full overflow-hidden">
          <FadeImage
            src={data.backdrop_url}
            alt=""
            fallbackTitle={data.title}
            className="w-full h-full object-cover opacity-70"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-chino-bg via-chino-bg/40 to-transparent" />
        </div>
        {/* Back and Home 1rem under the status bar's inset: the
            backdrop reaches up behind a translucent one, they don't. */}
        <button
          onClick={() => { if (window.history.length > 1) window.history.back(); else window.location.assign(toApp('/')); }}
          className="absolute top-[calc(1rem+var(--chino-safe-top))] left-4 p-2 bg-black/50 hover:bg-black/70 transition-colors"
          title="Back"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <button
          onClick={() => window.location.assign(toApp('/'))}
          className="absolute top-[calc(1rem+var(--chino-safe-top))] left-16 p-2 bg-black/50 hover:bg-black/70 transition-colors"
          title="Home"
          aria-label="Home"
        >
          <House className="w-5 h-5" />
        </button>
      </div>

      {/* Content overlapping the backdrop. */}
      <div className="max-w-6xl mx-auto px-6 -mt-32 relative z-10 pb-16">
        <div className="flex flex-col md:flex-row gap-8">
          <FadeImage
            src={data.poster_url}
            alt={data.title}
            fallbackTitle={data.title}
            className="w-48 md:w-64 aspect-[2/3] rounded-lg shadow-2xl object-cover shrink-0"
          />
          <div className="flex-1 pt-4">
            <h1 className="text-3xl md:text-4xl font-bold mb-2">{data.title}</h1>
            {data.tagline ? (
              <p className="italic text-chino-muted mb-4">{data.tagline}</p>
            ) : null}

            <div className="flex flex-wrap items-center gap-3 text-sm text-chino-text mb-4">
              {data.year ? <span>{data.year}</span> : null}
              {runtimeText ? (
                <>
                  <span className="text-chino-muted">•</span>
                  <span>{runtimeText}</span>
                </>
              ) : null}
              {data.rating ? (
                <>
                  <span className="text-chino-muted">•</span>
                  <span className="inline-flex items-center gap-1">
                    <Star className="w-4 h-4 fill-chino-accent text-chino-accent" />
                    {data.rating.toFixed(1)}
                  </span>
                </>
              ) : null}
              {rated ? (
                <span
                  className="px-1.5 py-0.5 border border-chino-muted text-chino-fg text-xs font-semibold tracking-wide"
                  title={rated.title}
                >
                  {rated.text}
                </span>
              ) : null}
              {data.type ? (
                <span className="px-2 py-0.5 bg-white/10 text-xs uppercase tracking-wide">
                  {data.type}
                </span>
              ) : null}
            </div>

            {data.genres && data.genres.length > 0 ? (
              <div className="flex flex-wrap gap-2 mb-5">
                {data.genres.map((g) => (
                  <span
                    key={g}
                    className="px-3 py-1 bg-chino-surface-2 text-chino-text text-xs border border-chino-border"
                  >
                    {g}
                  </span>
                ))}
              </div>
            ) : null}

            {/* The title actions (docs/chino, title actions): play, or
                resume and start over, then trailer, add to list, watched
                and liked - every control 48 px tall, 8 px apart, a control
                wrapping as a whole, its label lowercase in the mono face. */}
            <div className={`flex flex-wrap ${ACTION_GAP} mb-6`}>
              {isSeries ? (
                // A series plays an episode, named by its code: the one
                // the viewer is in ("resume S01E03", and start over, which
                // plays it from its beginning), the next ("play S01E02"),
                // or S01E01. Its position is in its row below.
                seriesPlay ? (
                  seriesPlay.resumeSec > 0 ? (
                    <>
                      <button
                        onClick={() => goEpisode(seriesPlay.episodeId, seriesPlay.resumeSec)}
                        className={`${ACTION_HEIGHT} px-5 ${PLAY_LOOK} ${ACTION_FOCUS} ${ACTION_LABEL} font-medium flex items-center gap-2 shrink-0`}
                      >
                        <Play aria-hidden className="w-5 h-5 fill-current" />
                        {seriesPlayLabel(true, seriesCode)}
                      </button>
                      <button
                        onClick={() => goEpisode(seriesPlay.episodeId, null)}
                        className={`${ACTION_HEIGHT} px-5 ${OFF_LOOK} ${ACTION_FOCUS} ${ACTION_LABEL} font-medium flex items-center gap-2 shrink-0`}
                      >
                        {START_OVER}
                      </button>
                    </>
                  ) : (
                    <button
                      onClick={() => goEpisode(seriesPlay.episodeId, null)}
                      className={`${ACTION_HEIGHT} px-5 ${PLAY_LOOK} ${ACTION_FOCUS} ${ACTION_LABEL} font-medium flex items-center gap-2 shrink-0`}
                    >
                      <Play aria-hidden className="w-5 h-5 fill-current" />
                      {seriesPlayLabel(false, seriesCode)}
                    </button>
                  )
                ) : !seriesKnown ? (
                  <button
                    onClick={() => void playTitle(itemId, 'series')}
                    disabled={playPending}
                    className={`${ACTION_HEIGHT} px-5 ${PLAY_LOOK} ${ACTION_FOCUS} ${ACTION_LABEL} font-medium flex items-center gap-2 shrink-0 disabled:opacity-60`}
                  >
                    <Play aria-hidden className="w-5 h-5 fill-current" />
                    {PLAY}
                  </button>
                ) : null
              ) : resumeSec > 30 ? (
                <>
                  <button
                    onClick={() => goPlayer(true)}
                    className={`${ACTION_HEIGHT} px-5 ${PLAY_LOOK} ${ACTION_FOCUS} ${ACTION_LABEL} font-medium flex items-center gap-2 shrink-0`}
                  >
                    <Play aria-hidden className="w-5 h-5 fill-current" />
                    {resumeLabel(resumeSec)}
                  </button>
                  <button
                    onClick={() => goPlayer(false)}
                    className={`${ACTION_HEIGHT} px-5 ${OFF_LOOK} ${ACTION_FOCUS} ${ACTION_LABEL} font-medium flex items-center gap-2 shrink-0`}
                  >
                    {START_OVER}
                  </button>
                </>
              ) : (
                <button
                  onClick={() => goPlayer(false)}
                  className={`${ACTION_HEIGHT} px-5 ${PLAY_LOOK} ${ACTION_FOCUS} ${ACTION_LABEL} font-medium flex items-center gap-2 shrink-0`}
                >
                  <Play aria-hidden className="w-5 h-5 fill-current" />
                  {PLAY}
                </button>
              )}
              {trailer?.local ? (
                <a
                  href={toApp(trailerPath(itemId, trailer.extra.id))}
                  className={`${ACTION_HEIGHT} px-4 ${OFF_LOOK} ${ACTION_FOCUS} ${ACTION_LABEL} font-medium flex items-center gap-2 shrink-0`}
                  title="Play the trailer"
                >
                  <Clapperboard aria-hidden className="w-5 h-5" />
                  {TRAILER}
                </a>
              ) : trailer ? (
                <a
                  href={trailer.link.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`${ACTION_HEIGHT} px-4 ${OFF_LOOK} ${ACTION_FOCUS} ${ACTION_LABEL} font-medium flex items-center gap-2 shrink-0`}
                  title="Watch trailer on YouTube"
                >
                  <Youtube aria-hidden className="w-5 h-5" />
                  {TRAILER}
                </a>
              ) : null}
              <AddToListControl key={itemId} itemId={itemId} />
              <WatchedToggle
                watched={watched}
                onToggle={() => {
                  const next = !watched;
                  setWatchedOverride(next);
                  void toggleWatched(itemId, next);
                }}
              />
              <LikedToggle liked={liked} onToggle={() => void likes.toggle(itemId, !liked)} />
            </div>

            {data.description ? (
              <p className="text-chino-text leading-relaxed max-w-3xl whitespace-pre-line">
                {data.description}
              </p>
            ) : (
              <p className="text-chino-muted italic">No description available.</p>
            )}

            {/* Meta strip: cast, the crew by role, subtitles. Two columns
                on a phone too: a film credits half a dozen roles now, and
                one block per row made the strip twice as long. */}
            <div className="mt-6 grid grid-cols-2 gap-4 max-w-3xl text-sm">
              {actors.length > 0 ? <Starring actors={actors} /> : null}
              {crew.map((group) => (
                <MetaItem key={group.role} label={group.label}>
                  <CastNames people={group.people} />
                </MetaItem>
              ))}
              {data.subtitles && data.subtitles.length > 0 ? (
                <MetaItem label="Subtitles">
                  {Array.from(new Set(data.subtitles.map((s) => languageName(s.lang)))).join(', ')}
                </MetaItem>
              ) : null}
              {data.segments && data.segments.count > 0 ? (
                <MetaItem label="Analyzed">
                  {[data.segments.has_intro && 'Intro', data.segments.has_credits && 'Credits', data.segments.has_recap && 'Recap']
                    .filter(Boolean)
                    .join(' · ') || 'Segments available'}
                </MetaItem>
              ) : null}
            </div>
          </div>
        </div>

        {isSeries ? (
          <EpisodesList seasons={seasons} focusEpisodeId={focusEpisodeId} progressById={episodeProgress} />
        ) : null}

        {/* "More like this" — only renders when the backend scored at
            least one candidate (#115). Episode detail pages don't
            mount this — the row is for the top-level title only,
            which matches the backend filter (it short-circuits when
            the source is an episode). */}
        {similar.length > 0 ? (
          <div className="mt-10">
            <MediaRow
              title="More like this"
              noLoop
              items={similar.map((it) => ({
                id: it.id,
                title: it.title,
                image: it.poster_url || '',
                year: it.year ? String(it.year) : undefined,
                rating: it.rating ? it.rating.toFixed(1) : undefined,
                type: (it.type === 'series' ? 'series' : 'movie') as 'series' | 'movie',
                watchedAt: it.watched_at,
              }))}
            />
          </div>
        ) : null}
      </div>
    </div>
  );
}
