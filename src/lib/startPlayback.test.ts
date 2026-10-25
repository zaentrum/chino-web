// node --test (type stripping, Node >= 22.18). Excluded from the app's tsc program.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { playFromPress, type Playable } from './startPlayback.ts';

/** A <video> as a browser's autoplay policy treats it: inside the press
 *  (`gesture`) it plays with its sound; outside it only muted, or not at
 *  all (`mutedOutside: false`). It notes what was done to it, in order. */
function video({ muted = true, mutedOutside = true, refuseSoundInGesture = false } = {}) {
  const log: string[] = [];
  let gesture = false;
  let isMuted = muted;
  const v: Playable & { log: string[]; press: (f: () => void) => void } = {
    log,
    get muted() {
      return isMuted;
    },
    set muted(m: boolean) {
      log.push(`muted=${m}${gesture ? ' (in the press)' : ''}`);
      isMuted = m;
    },
    play() {
      const withSound = !isMuted;
      log.push(`play ${withSound ? 'with sound' : 'muted'}${gesture ? ' (in the press)' : ''}`);
      if (withSound && gesture && !refuseSoundInGesture) return Promise.resolve();
      if (!withSound && (gesture || mutedOutside)) return Promise.resolve();
      return Promise.reject(new Error('NotAllowedError'));
    },
    // The press: what runs synchronously inside it is the gesture; what
    // runs after a promise settles is not.
    press(f) {
      gesture = true;
      try {
        f();
      } finally {
        gesture = false;
      }
    },
  };
  return v;
}

test('the start button starts the title with its sound: unmuted in the press itself, before play() - one press', async () => {
  // The browser refused to start it at all; the player muted it trying.
  const v = video({ muted: true, mutedOutside: false });
  let outcome: Promise<string> | null = null;
  v.press(() => {
    outcome = playFromPress(v, true);
  });
  assert.equal(await outcome, 'sound');
  assert.equal(v.muted, false);
  assert.deepEqual(v.log, ['muted=false (in the press)', 'play with sound (in the press)']);
});

test('a browser that refuses even the press its sound plays the picture muted, and the player offers "unmute"', async () => {
  const v = video({ muted: true, refuseSoundInGesture: true });
  let outcome: Promise<string> | null = null;
  v.press(() => {
    outcome = playFromPress(v, true);
  });
  assert.equal(await outcome, 'muted');
  assert.equal(v.muted, true);
  assert.deepEqual(v.log, ['muted=false (in the press)', 'play with sound (in the press)', 'muted=true', 'play muted']);
});

test('refused with its sound and without: "refused", so the start button comes back', async () => {
  const v = video({ muted: true, mutedOutside: false, refuseSoundInGesture: true });
  let outcome: Promise<string> | null = null;
  v.press(() => {
    outcome = playFromPress(v, true);
  });
  assert.equal(await outcome, 'refused');
});

test("a press on a video the viewer muted leaves the sound as it is: muted is the viewer's", async () => {
  const v = video({ muted: true });
  let outcome: Promise<string> | null = null;
  v.press(() => {
    outcome = playFromPress(v, false);
  });
  assert.equal(await outcome, 'muted');
  assert.deepEqual(v.log, ['play muted (in the press)']);
  const loud = video({ muted: false });
  loud.press(() => {
    outcome = playFromPress(loud, false);
  });
  assert.equal(await outcome, 'sound');
  assert.deepEqual(loud.log, ['play with sound (in the press)']);
});

test('play() that throws, or an old browser\'s undefined, is a refusal or a start', async () => {
  const throws: Playable = {
    muted: true,
    play() {
      if (!this.muted) throw new Error('NotAllowedError');
    },
  };
  assert.equal(await playFromPress(throws, true), 'muted');
  const old: Playable = { muted: true, play: () => undefined };
  assert.equal(await playFromPress(old, true), 'sound');
});

test('in the player, the start button and every press of play go through playFromPress, and "unmute" goes once the press brought the sound', () => {
  const source = readFileSync(new URL('../components/PlayerPage.tsx', import.meta.url), 'utf8');
  // The start button's own press: no bare play() that leaves it muted.
  const start = source.indexOf('{needsClickToPlay && (');
  assert.ok(start > 0);
  const button = source.slice(start, source.indexOf('</button>', start));
  assert.match(button, /onClick=\{startFromButton\}/);
  assert.doesNotMatch(button, /\.play\(\)/);
  const handler = source.slice(source.indexOf('const pressPlay = '), source.indexOf('const startFromButton = '));
  assert.match(handler, /playFromPress\(v, unmute\)/);
  assert.match(handler, /setPlayerMuted\(false\)/);
  // The bar's play and the keyboard's space go the same way.
  const toggle = source.slice(source.indexOf('const userTogglePlay = '), source.indexOf('// Switch history'));
  assert.match(toggle, /pressPlay\(v\)/);
  assert.doesNotMatch(toggle, /\.play\(\)/);
});
