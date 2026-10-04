// A packaged title's quality menu: what /play/info offers and which entry
// the player is on. Pure: qualities.test.ts runs it.
//
// chino-stream serves a packaged title as the ladder of rungs this client
// decodes (its caps), or one rung of it. /play/info's qualities lists the
// choice - Auto, the ladder, which hls.js steps through as the network and
// the player's size allow, then the rungs the client may pick, tallest
// first, each named by its picture size ("720p") - and is null when there
// is nothing to choose: a package of one rendition (every package from
// before the ladder). A pick reloads the master with q=<name>, Auto with
// q=auto.

export const AUTO = 'auto';

export interface PlayQuality {
  /** The ?q= value: "auto", or a rung's id ("v1"). */
  name: string;
  /** What the menu says: "Auto", "1080p". */
  label: string;
  id?: string;
  width?: number;
  height?: number;
  codec?: string;
  /** bit/s, the variant's BANDWIDTH. */
  bitrate?: number;
  video_range?: string;
}

/**
 * The quality menu of a packaged title: /play/info's qualities when there
 * are two or more to show, Auto first (put there should the server leave it
 * out); null for anything else - a title that is not packaged, a package
 * of one rendition.
 */
export function packagedQualityMenu(
  info: { mode?: string; qualities?: readonly PlayQuality[] | null } | null | undefined,
): PlayQuality[] | null {
  if (!info || info.mode !== 'packaged' || !Array.isArray(info.qualities)) return null;
  const entries = info.qualities.filter(
    (e): e is PlayQuality => !!e && typeof e.name === 'string' && e.name !== '' && typeof e.label === 'string' && e.label !== '',
  );
  if (entries.length < 2) return null;
  const auto = entries.find((e) => e.name === AUTO) ?? { name: AUTO, label: 'Auto' };
  return [auto, ...entries.filter((e) => e.name !== AUTO)];
}

/**
 * The entry the player is on, for the q it asked with: the rung of that
 * name when the menu has it, else Auto - which is what chino-stream serves
 * a packaged title for any other q (auto, the high the player starts with,
 * a rung this client can no longer pick).
 */
export function chosenQuality(menu: readonly PlayQuality[], q: string): PlayQuality {
  return menu.find((e) => e.name !== AUTO && e.name === q) ?? menu.find((e) => e.name === AUTO) ?? menu[0];
}
