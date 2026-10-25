// node --test (type stripping, Node >= 22.18). Excluded from the app's tsc program.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { LOADING_NAME, PLAYER_STATUS, switchingTo } from './playerStatus.ts';

test("the player's line says what it is doing, in plain words", () => {
  assert.deepEqual(PLAYER_STATUS, {
    retrying: 'Trying again…',
    reconnecting: 'Reconnecting…',
    skipping: "Skipping a part that couldn't be played…",
    switchingAudio: 'Switching audio…',
    otherFormat: "This browser can't play this video's format. Switching to one it can…",
    converting: 'Converting the video for this browser…',
  });
  assert.equal(switchingTo('Medium (720p)'), 'Switching to Medium (720p)…');
  for (const line of [...Object.values(PLAYER_STATUS), switchingTo('High (1080p)')]) {
    // The body face: sentence case, an ongoing action.
    assert.match(line, /^[A-Z]/, line);
    assert.match(line, /…$/, line);
    // No codec or pipeline words, no "please", no exclamation, no promise
    // of how long.
    assert.doesNotMatch(line, /HEVC|H\.264|transcod|decod|unpackaged|please|!|a moment|almost|hold tight/i, line);
  }
  // A title starting says nothing beyond the spinner's name.
  assert.equal(LOADING_NAME, 'Loading');
});

// Every source file of the app, tests aside.
function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sources(path);
    return /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name) ? [path] : [];
  });
}

test('no joke or cute copy anywhere in the app, and no rotating loading lines', () => {
  const src = fileURLToPath(new URL('..', import.meta.url));
  const files = sources(src);
  assert.ok(files.length > 50);
  const cute =
    /popcorn|projectionist|codec gods|cinema magic|film reels|reel tape|one more reel|house lights|hold tight|play nice|satellite dish|orchestra|mood-lighting|buffering atmosphere|rounding up the cast|polishing the lens|keep momentum|snappier|want us to see/i;
  for (const file of files) {
    // What the screen can show: the code without its comments.
    const code = readFileSync(file, 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/(^|[^:'"`])\/\/.*$/gm, '$1');
    assert.equal(cute.exec(code)?.[0] ?? null, null, file);
    assert.ok(!code.includes('LOADING_MESSAGES'), file);
  }
});
