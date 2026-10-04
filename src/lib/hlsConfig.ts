import type { HlsConfig } from 'hls.js';

/**
 * What every hls.js instance of the web client is set up with - the
 * player's and a Zap card's - on top of its own buffer and retry settings.
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
  renderTextTracksNatively: false,
  subtitleStreamController: undefined,
  subtitleTrackController: undefined,
  timelineController: undefined,
};
