// Taking a title off Continue watching. Pure: continueWatching.test.ts runs
// it under node --test.

/** What "remove from Continue watching" saves as the title's progress. */
export interface DismissProgress {
  position_sec: number;
  duration_sec: number;
  dismiss: true;
}

/** No length known (a live item, a file mis-scanned): a day, well past any
 *  title's end. */
const UNKNOWN_LENGTH_SEC = 86_400;

/**
 * The title saved at its end, as a dismiss: chino-api's feed drops a title
 * finished by its one rule (its last 5 % or 2 minutes) - a film leaves, an
 * episode's next takes its place - and with `dismiss` it leaves the title
 * unwatched, where it marks one saved at its end watched otherwise: the
 * viewer did not finish it. [durationSec] is the row's length, chino-api's.
 */
export function dismissProgress(durationSec: number | null | undefined): DismissProgress {
  const end = durationSec && durationSec > 0 ? durationSec : UNKNOWN_LENGTH_SEC;
  return { position_sec: end, duration_sec: end, dismiss: true };
}
