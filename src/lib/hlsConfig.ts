import Hls, { type HlsConfig } from 'hls.js';

/**
 * What every hls.js instance of the web client is set up with - the
 * player's and a Zap card's - on top of its own buffer and retry settings.
 *
 * The level is capped to the player's size (capLevelToPlayerSize): on a
 * ladder, Auto fetches no rung bigger than the picture on screen needs.
 *
 * No HLS subtitles. The page draws the sidecar subtitles itself (<track>
 * elements, libpgs for PGS), and hls.js's subtitle and captions
 * controllers take every text track on the <video> for theirs: when a
 * source is torn down and when the next one starts loading they switch
 * the sidecar's track off and clear its cues, so the subtitles went away
 * at every quality switch, stall reload, resumed tab or Try again. A
 * master that carries a SUBTITLES group would also have them load its
 * renditions next to the sidecars - the same subtitles twice, or a DEFAULT
 * rendition shown on its own. Without those controllers hls.js ignores a
 * SUBTITLES group and leaves the page's text tracks alone, as its light
 * build does (closed captions inside the video go with them; nothing here
 * carries any). renderTextTracksNatively is off as well: a controller that
 * came back would hand its cues to the page instead of drawing them.
 */
export const HLS_BASE_CONFIG: Partial<HlsConfig> = {
  capLevelToPlayerSize: true,
  renderTextTracksNatively: false,
  subtitleStreamController: undefined,
  subtitleTrackController: undefined,
  timelineController: undefined,
};

/**
 * Start on the variant the master lists first. chino-stream lists first
 * the variant a client is to start on, and that is the one it warms when
 * the master is fetched (and the Zap prefetch warms); left to itself,
 * hls.js starts on the best level under min(first BANDWIDTH, 5 Mbit/s) -
 * below an HEVC top rung over 5 Mbit/s, a rung nobody warmed. hls.js sorts
 * the levels; MANIFEST_PARSED says where the first one went, before any
 * loading starts. Auto (ABR) takes over from there.
 */
export function startOnFirstVariant(hls: Hls): void {
  hls.on(Hls.Events.MANIFEST_PARSED, (_event, data) => {
    if (data.firstLevel >= 0) hls.startLevel = data.firstLevel;
  });
}
