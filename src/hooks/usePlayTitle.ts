import { useState } from 'react';
import { useAuth } from 'react-oidc-context';
import { toApp } from '../lib/basepath';
import { episodeToPlay, type ContinueRow, type SeasonRef } from '../lib/seriesPlay';

/**
 * Play a title. A movie (or an episode) opens the player for itself. A
 * series is not playable itself — the player opened for its id waited for
 * a stream that never comes — so it plays the episode lib/seriesPlay.ts
 * picks: the one the viewer is in, or the next, or S01E01. A series with
 * no episodes to play opens its page instead. `pending` is true while the
 * episode is looked up.
 */
export function usePlayTitle() {
  const auth = useAuth();
  const [pending, setPending] = useState(false);

  const play = async (id: string, type: string | undefined, query = '') => {
    if (type !== 'series') {
      window.location.assign(toApp(`/player/${encodeURIComponent(id)}${query}`));
      return;
    }
    setPending(true);
    try {
      const headers = { Authorization: `Bearer ${auth.user?.access_token ?? ''}` };
      const get = <T,>(path: string, empty: T): Promise<T> =>
        fetch(path, { headers })
          .then((r) => (r.ok ? (r.json() as Promise<T>) : empty))
          .catch(() => empty);
      const [cw, eps] = await Promise.all([
        get<{ items?: ContinueRow[] }>('/api/v1/me/continue-watching', { items: [] }),
        get<{ seasons?: SeasonRef[] }>(`/api/v1/series/${encodeURIComponent(id)}/episodes`, { seasons: [] }),
      ]);
      const episode = episodeToPlay(id, cw.items, eps.seasons);
      window.location.assign(
        toApp(episode ? `/player/${encodeURIComponent(episode)}` : `/i/${encodeURIComponent(id)}`),
      );
    } finally {
      setPending(false);
    }
  };

  return { play, pending };
}
