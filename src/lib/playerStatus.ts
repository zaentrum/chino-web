// What a loading screen and the player say while they wait (the design
// system's loading pattern and its writing rules): what is happening, in
// plain words, or nothing - the spinner says "loading" by itself. No
// rotating lines, no jokes. Pure: playerStatus.test.ts runs it.

/** The spinner's name for a screen reader, where no line says more. */
export const LOADING_NAME = 'Loading';

/** The player's line under its spinner, while it does something the
 *  spinner alone doesn't say. While a title starts, nothing. */
export const PLAYER_STATUS = {
  /** "try again" after the player gave up. */
  retrying: 'Trying again…',
  /** The stream broke off and the player picks it up where it was. */
  reconnecting: 'Reconnecting…',
  /** A part of the video couldn't be decoded, and the player jumps past it. */
  skipping: "Skipping a part that couldn't be played…",
  /** A pick in the audio menu. */
  switchingAudio: 'Switching audio…',
  /** The browser can't play the source's format: the player asks for one
   *  it can. */
  otherFormat: "This browser can't play this video's format. Switching to one it can…",
  /** Still waiting for the first picture of a stream the server converts
   *  for this browser as it plays. */
  converting: 'Converting the video for this browser…',
} as const;

/** A pick in the quality menu, by the quality's name: "Switching to Medium
 *  (720p)…". */
export function switchingTo(quality: string): string {
  return `Switching to ${quality}…`;
}
