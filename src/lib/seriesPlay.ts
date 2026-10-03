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
  const withEpisodes = (seasons ?? []).filter((s) => (s.episodes?.length ?? 0) > 0);
  const regular = withEpisodes.filter((s) => s.season >= 1);
  const season = [...(regular.length ? regular : withEpisodes)].sort((a, b) => a.season - b.season)[0];
  if (!season) return null;
  const byNumber = [...(season.episodes ?? [])].sort(
    (a, b) => (a.episode_number ?? Number.MAX_SAFE_INTEGER) - (b.episode_number ?? Number.MAX_SAFE_INTEGER),
  );
  return byNumber[0]?.id ?? null;
}
