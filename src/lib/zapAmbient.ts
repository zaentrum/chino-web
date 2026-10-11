// A Zap card's ambient light: the playing clip's colours on a coarse grid,
// blown up, blurred and dimmed behind the clip, so the card reads full screen
// while the clip plays whole in the middle. It follows the clip slowly: the
// clip is sampled once a second, and the light eases towards each sample
// instead of jumping to it, so a cut in the clip is a drift on the card and
// the light never dips towards black between two samples. The grid and the
// timing are the app's (chino-mobile's ZapAmbientLight).

/** The grid the clip's colours are averaged to. */
export const AMBIENT_COLUMNS = 16;
export const AMBIENT_ROWS = 9;

/** How often the clip is sampled, and how often the light moves towards the
 *  last sample. */
export const AMBIENT_SAMPLE_MS = 1000;
export const AMBIENT_STEP_MS = 100;

/** How long the light takes to be (all but) at a sample. */
export const AMBIENT_EASE_MS = 1800;

/**
 * The share of the way to the sample the light goes in one step, so that
 * after `easeMs` it has gone all but `left` of it: an exponential ease, each
 * step drawn over the light as it is. Pure: zapAmbient.test.ts.
 */
export function ambientStep(stepMs = AMBIENT_STEP_MS, easeMs = AMBIENT_EASE_MS, left = 0.05): number {
  const steps = Math.max(1, easeMs / stepMs);
  return 1 - Math.pow(left, 1 / steps);
}

/**
 * Light `canvas` from `video` while it plays: `onLit` once the first sample
 * is drawn. Returns what stops it. The canvas is only drawn to, never read,
 * so a clip from another origin lights it as any other.
 */
export function followClip(video: HTMLVideoElement, canvas: HTMLCanvasElement, onLit: () => void): () => void {
  const ctx = canvas.getContext('2d');
  const sample = document.createElement('canvas');
  sample.width = canvas.width;
  sample.height = canvas.height;
  const sctx = sample.getContext('2d');
  if (!ctx || !sctx) return () => undefined;
  sctx.imageSmoothingQuality = 'high';
  const step = ambientStep();
  let have = false;
  let lit = false;
  const take = () => {
    if (video.paused || video.readyState < 2 || !video.videoWidth) return;
    try {
      sctx.drawImage(video, 0, 0, sample.width, sample.height);
      have = true;
    } catch {
      // A frame the browser cannot draw (a protected one): the light stays.
    }
  };
  const move = () => {
    if (!have) return;
    ctx.globalAlpha = lit ? step : 1;
    ctx.drawImage(sample, 0, 0);
    if (!lit) {
      lit = true;
      onLit();
    }
  };
  const taking = window.setInterval(take, AMBIENT_SAMPLE_MS);
  const moving = window.setInterval(move, AMBIENT_STEP_MS);
  video.addEventListener('playing', take);
  take();
  return () => {
    window.clearInterval(taking);
    window.clearInterval(moving);
    video.removeEventListener('playing', take);
  };
}
