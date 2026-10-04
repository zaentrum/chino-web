// A packaged title's quality menu: what /play/info offers, which entry the
// player is on, and the name of the rung that plays - Auto says it ("Auto ·
// 720p"). Pure: qualities.test.ts runs it.
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

/** What is playing: a level of hls.js (its variant's URI and size), or the picture's size where the browser plays HLS itself. */
export interface PlayingLevel {
  uri?: string;
  width?: number;
  height?: number;
}

/** The rung a variant playlist belongs to: its directory (".../play/v1/playlist.m3u8?…" → "v1"). */
export function rungOfUri(uri: string | undefined): string {
  const parts = (uri ?? '').split(/[?#]/)[0].split('/').filter(Boolean);
  return parts.length >= 2 ? parts[parts.length - 2] : '';
}

// The heights quality labels name, as chino-stream's rungLabel does.
const SIZE_CLASSES = [240, 360, 480, 540, 576, 720, 1080, 1440, 2160, 4320];

/**
 * A picture size named as chino-stream names a rung: the smallest class
 * whose 16:9 box holds the frame, with 10% of the width to spare for DCI
 * frames - so a 2.39:1 film's 1280x536 is 720p and 4096x2160 is 2160p.
 * null for no size.
 */
export function sizeLabel(width: number | undefined, height: number | undefined): string | null {
  if (!height || height <= 0) return null;
  const w = width && width > 0 ? width : 0;
  for (const c of SIZE_CLASSES) {
    const boxW = (Math.floor((c * 16) / 9) + 1) & ~1;
    if (height <= c && w * 10 <= boxW * 11) return `${c}p`;
  }
  return `${height}p`;
}

/**
 * The name of what is playing: the menu's label of its rung - found by
 * the rung's id in the variant URI, else by its picture size - else the
 * size's class. null when nothing is known yet.
 */
export function playingLabel(level: PlayingLevel | null | undefined, menu: readonly PlayQuality[] | null | undefined): string | null {
  if (!level) return null;
  const rungs = (menu ?? []).filter((e) => e.name !== AUTO);
  const rung = rungOfUri(level.uri);
  const byId = rung ? rungs.find((e) => (e.id ?? e.name) === rung) : undefined;
  if (byId) return byId.label;
  const bySize = level.width && level.height ? rungs.find((e) => e.width === level.width && e.height === level.height) : undefined;
  if (bySize) return bySize.label;
  return sizeLabel(level.width, level.height);
}

/** Auto with the rung it plays: "Auto · 720p"; plain "Auto" until that is known. */
export function autoLabel(auto: string, playing: string | null): string {
  return playing ? `${auto} · ${playing}` : auto;
}
