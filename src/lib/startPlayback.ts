// A press of play on a video the browser wouldn't start by itself. A
// browser lets a video start with its sound only inside the viewer's
// gesture: so where the player muted it (the browser refused its sound,
// or refused to start it at all), the press unmutes it before it asks to
// play, in the same task - never after the play() promise settles, which
// is outside the gesture, and never on a second press. Pure:
// startPlayback.test.ts runs it under node --test.

/** What playFromPress needs of a <video>. */
export interface Playable {
  muted: boolean;
  play(): Promise<void> | void;
}

/** How a press came out: playing with its sound, playing muted (the
 *  browser refused even the press its sound), or not playing at all. */
export type PressOutcome = 'sound' | 'muted' | 'refused';

/** play(), as a promise: an old browser's undefined is a start, a throw a
 *  refusal. */
function ask(v: Playable): Promise<void> {
  try {
    return Promise.resolve(v.play());
  } catch (e) {
    return Promise.reject(e);
  }
}

/**
 * Starts `v` on the viewer's press. With `unmute` (the player had muted
 * it), the sound comes on in the press itself: `muted` is set false before
 * play() is asked, synchronously. A browser that still refuses the sound
 * gets the video muted, so the picture at least plays ('muted', and the
 * player offers "unmute"); one that refuses that too, 'refused'. Without
 * `unmute`, the sound is the viewer's own and stays as it is.
 */
export function playFromPress(v: Playable, unmute: boolean): Promise<PressOutcome> {
  if (unmute) v.muted = false;
  return ask(v).then(
    (): PressOutcome => (v.muted ? 'muted' : 'sound'),
    (): Promise<PressOutcome> | PressOutcome => {
      if (!unmute) return 'refused';
      v.muted = true;
      return ask(v).then(
        (): PressOutcome => 'muted',
        (): PressOutcome => 'refused',
      );
    },
  );
}
