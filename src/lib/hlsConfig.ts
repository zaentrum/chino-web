import Hls, { type HlsConfig } from 'hls.js';

/**
 * What every hls.js instance of the web client is set up with - the
 * player's and a Zap card's - on top of its own buffer and retry settings.
 * The level cap to the player's size is turned on by startOnFirstVariant,
 * after the first fragment.
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

/**
 * Start on the variant the master lists first, then cap the level to the
 * player's size. chino-stream lists first the variant a client is to start
 * on, and that is the one it warms when the master is fetched (and the Zap
 * prefetch warms); left to itself, hls.js starts on the best level under
 * min(first BANDWIDTH, 5 Mbit/s) - below an HEVC top rung over 5 Mbit/s, a
 * rung nobody warmed. hls.js sorts the levels; MANIFEST_PARSED says where
 * the first one went, before any loading starts.
 *
 * The cap (capLevelToPlayerSize: Auto fetches no rung bigger than the
 * picture on screen needs) starts once the first fragment is in. hls.js
 * caps the first fragment too, which in a window or a Zap card smaller
 * than the first variant would start on a rung nobody warmed. Turned on
 * then, it caps Auto from the next fragment on and flushes nothing.
 */
export function startOnFirstVariant(hls: Hls): void {
  hls.on(Hls.Events.MANIFEST_PARSED, (_event, data) => {
    if (data.firstLevel >= 0) hls.startLevel = data.firstLevel;
  });
  const capFromNow = (_event: string, data: { id: string }) => {
    if (data.id !== 'main') return;
    hls.off(Hls.Events.FRAG_BUFFERED, capFromNow);
    hls.capLevelToPlayerSize = true;
  };
  hls.on(Hls.Events.FRAG_BUFFERED, capFromNow);
}
