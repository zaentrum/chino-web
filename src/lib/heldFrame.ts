// The last picture a quality pick keeps on screen: a pick rebuilds the
// stream's source, and the <video> goes black from the moment the old one
// goes until the new one's first frame. The player draws the last frame
// onto a canvas over the video as it switches, under "Switching to …", and
// takes it away once the new quality shows its own. Pure: heldFrame.test.ts
// runs it under node --test.

/** What the video element says of the picture it shows. */
export interface VideoPicture {
  /** HTMLMediaElement.readyState: 2 (HAVE_CURRENT_DATA) and up has the
   *  frame at the playhead. */
  readyState: number;
  videoWidth: number;
  videoHeight: number;
}

/** HAVE_CURRENT_DATA: the frame at the playhead is there to show. */
const HAVE_CURRENT_DATA = 2;

/** The size of the picture on screen, to hold while the source is rebuilt;
 *  null where it shows none yet (nothing decoded, no video track). */
export function frameToHold(video: VideoPicture): { width: number; height: number } | null {
  if (video.readyState < HAVE_CURRENT_DATA || !(video.videoWidth > 0) || !(video.videoHeight > 0)) return null;
  return { width: video.videoWidth, height: video.videoHeight };
}

/** The video as a held picture waits on it: which source it plays (the
 *  player counts them, one more each time it builds one), whether it has
 *  the frame at the playhead, and whether it is still seeking there. */
export interface SourceNow {
  source: number;
  readyState: number;
  seeking: boolean;
}

/**
 * Whether the held picture goes: once a later source than the one it was
 * held on - the new quality's - has its first frame, at the playhead, not
 * seeking there any more. Never on the old source's own events, which can
 * still come while it is torn down; nothing is held where `heldOn` is null.
 */
export function releasesHeldFrame(heldOn: number | null, now: SourceNow): boolean {
  return heldOn !== null && now.source > heldOn && now.readyState >= HAVE_CURRENT_DATA && !now.seeking;
}

/** The canvas's look: over the whole video, the picture fitted the way the
 *  video fits its own (contain), taking no presses. */
export const HELD_FRAME = 'absolute inset-0 w-full h-full pointer-events-none object-contain';
