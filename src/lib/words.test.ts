// node --test (type stripping, Node >= 22.18). Excluded from the app's tsc program.
//
// The word list (docs/chino, words) over what the app's screens say: the
// text of their elements and the names they give controls - not comments,
// not code.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const SRC = join(import.meta.dirname, '..');

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sources(path);
    return /\.tsx$/.test(name) ? [path] : [];
  });
}

/** What a viewer reads in a .tsx file: its elements' text, and the
 *  strings it gives as a title, a label or a heading. */
function shownTexts(code: string): string[] {
  const noComments = code.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/[^\n]*/g, '$1');
  const texts = [...noComments.matchAll(/>([^<>{}]+)</g)].map((m) => m[1].trim()).filter(Boolean);
  const attributes = [...noComments.matchAll(/\b(?:title|aria-label|label|placeholder)=["']([^"']+)["']/g)].map((m) => m[1]);
  return [...texts, ...attributes];
}

test('"account", not "profile": nothing a viewer reads says Profile', () => {
  const found: string[] = [];
  for (const file of sources(SRC)) {
    for (const text of shownTexts(readFileSync(file, 'utf8'))) {
      if (/\bprofile\b/i.test(text)) found.push(`${file.slice(SRC.length + 1)}: ${text}`);
    }
  }
  assert.deepEqual(found, []);
});

test("the header's account menu says account and sign out", () => {
  const header = shownTexts(readFileSync(join(SRC, 'components', 'Header.tsx'), 'utf8'));
  assert.ok(header.includes('account'), 'account');
  assert.ok(header.includes('sign out'), 'sign out');
});
