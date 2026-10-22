// What "Play" on a series plays: a series is not itself playable - its
// episodes are. Pure: seriesPlay.test.ts runs it under node --test.

/** A Continue watching row as chino-api sends it (the fields used here). */
export interface ContinueRow {
  id: string;
  type?: string;
  /** The series an episode belongs to. */
  parent_id?: string;
  /** chino-api's next episode after one the viewer finished. */
  up_next?: boolean;
}

export interface SeasonRef {
  season: number;
  episodes?: { id: string; episode_number?: number }[];
}

/**
 * The episode to play for a series: the one Continue watching names first
 * for it - the episode the viewer is in the middle of, or the next one
 * after the last they finished (the feed lists the most recent first) -
 * else the series' first episode. Null when the series has no episodes.
 */
export function episodeToPlay(
  seriesId: string,
  continueWatching: readonly ContinueRow[] | null | undefined,
  seasons: readonly SeasonRef[] | null | undefined,
): string | null {
  const row = (continueWatching ?? []).find((r) => r.type === 'episode' && r.parent_id === seriesId);
  return row ? row.id : firstEpisode(seasons);
}

/** S01E01: the lowest episode of the lowest season from 1 on; the
 *  specials of season 0 only when there is nothing else. */
export function firstEpisode(seasons: readonly SeasonRef[] | null | undefined): string | null {
  return firstEpisodeOf(seasons)?.id ?? null;
}

function firstEpisodeOf(seasons: readonly SeasonRef[] | null | undefined): { id: string; season: number; episode_number?: number } | null {
  const withEpisodes = (seasons ?? []).filter((s) => (s.episodes?.length ?? 0) > 0);
  const regular = withEpisodes.filter((s) => s.season >= 1);
  const season = [...(regular.length ? regular : withEpisodes)].sort((a, b) => a.season - b.season)[0];
  if (!season) return null;
  const byNumber = [...(season.episodes ?? [])].sort(
    (a, b) => (a.episode_number ?? Number.MAX_SAFE_INTEGER) - (b.episode_number ?? Number.MAX_SAFE_INTEGER),
  );
  const first = byNumber[0];
  return first ? { id: first.id, season: season.season, episode_number: first.episode_number } : null;
}

/** A Continue watching row with where the viewer is in it. */
export interface ContinueProgressRow extends ContinueRow {
  position_sec?: number;
  duration_sec?: number;
  season_number?: number;
  episode_number?: number;
  /** The last episode of a file that holds several. */
  episodeEnd?: number;
}

/** What Play on a series' page plays (seriesPlayTarget). */
export interface SeriesPlayTarget {
  episodeId: string;
  /** Its season and episode, where known: what the button names. */
  season: number | null;
  episode: number | null;
  episodeEnd: number | null;
  /** The saved position Resume picks up; 0 plays it from the start. */
  resumeSec: number;
}

/**
 * The canonical cross-client "in the middle of it": more than 30 s in and
 * not within its last minute (chino-api's finished cutoff); a length not
 * known (0) does not count as finished.
 */
export function isMidWatch(positionSec: number, durationSec: number): boolean {
  return positionSec > 30 && (durationSec <= 0 || positionSec < durationSec - 60);
}

/**
 * What Play on a series' page plays, as on the TV: the series' first row in
 * Continue watching - the episode the viewer is in, resumed where they
 * are, or the next one after the last they finished (an up-next row), from
 * the start - else S01E01. Null when the series has no episodes.
 */
export function seriesPlayTarget(
  seriesId: string,
  continueWatching: readonly ContinueProgressRow[] | null | undefined,
  seasons: readonly SeasonRef[] | null | undefined,
): SeriesPlayTarget | null {
  const row = (continueWatching ?? []).find((r) => r.type === 'episode' && r.parent_id === seriesId);
  if (row) {
    const position = row.position_sec ?? 0;
    return {
      episodeId: row.id,
      season: row.season_number ?? null,
      episode: row.episode_number ?? null,
      episodeEnd: row.episodeEnd ?? null,
      resumeSec: !row.up_next && isMidWatch(position, row.duration_sec ?? 0) ? position : 0,
    };
  }
  const first = firstEpisodeOf(seasons);
  return first ? { episodeId: first.id, season: first.season, episode: first.episode_number ?? null, episodeEnd: null, resumeSec: 0 } : null;
}
