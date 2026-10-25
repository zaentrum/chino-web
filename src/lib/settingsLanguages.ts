// The languages Settings offers (docs/chino, subtitles: the setting;
// playback: the audio setting): the server's subtitle languages, read from
// its configuration as the player's menu reads them, never a list fixed in
// the app; a server that names none offers every language by name. Each is
// named as the player's menus name it ("Chinese (Simplified)"). Pure:
// settingsLanguages.test.ts runs it under node --test.

import { LIBRARY_LANGUAGES, languageName, languageTag } from './languages.ts';

/** The text under Settings' audio language, the same in every chino app
 *  (docs/chino, playback: the audio setting). */
export const AUDIO_SETTING_TEXT =
  'Titles play with audio in the language you pick here, where they have it. ' +
  'With Original, each title plays in the language it was made in. ' +
  "A choice in the player applies only to what's playing now.";

/** The subtitle setting's value for none, and the audio setting's for the
 *  language each title was made in. */
export const SUBTITLES_OFF = 'off';
export const AUDIO_ORIGINAL = 'orig';

/** A choice of a language setting: the value kept, the name shown. */
export interface LanguageChoice {
  value: string;
  label: string;
}

/** Whether two values of a setting name one language ("eng" and "en",
 *  "zh-Hans" and "zh-hans"); the setting's own words by themselves. */
export function sameChoice(a: string, b: string): boolean {
  if (a === b) return true;
  const [ta, tb] = [languageTag(a), languageTag(b)];
  return ta !== '' && ta.toLowerCase() === tb.toLowerCase();
}

const COLLATOR = new Intl.Collator('en');

/** Languages by their names, in alphabetical order - those the platform
 *  has a name for: a code is no name to pick by. */
function byName(tags: readonly string[]): LanguageChoice[] {
  return tags
    .map((value) => ({ value, label: languageName(value) }))
    .filter((c) => c.label.toLowerCase() !== c.value.toLowerCase())
    .sort((a, b) => COLLATOR.compare(a.label, b.label));
}

/** Every language by name - the languages a library carries, Chinese in
 *  either script too where the subtitles are meant. */
export function everyLanguage(scripts: boolean): LanguageChoice[] {
  return byName([...LIBRARY_LANGUAGES, ...(scripts ? ['zh-Hans', 'zh-Hant'] : [])]);
}

/** The setting's current value, where the choices don't name it: kept in
 *  the list, so what is set shows as set. */
function withCurrent(choices: LanguageChoice[], current: string): LanguageChoice[] {
  if (!current || choices.some((c) => sameChoice(c.value, current))) return choices;
  const tag = languageTag(current);
  return tag ? [...choices, { value: current, label: languageName(current) }] : choices;
}

/** What a setting offers, and whether as the server names it (a few) or as
 *  every language (a list to pick from). */
export interface LanguageOptions {
  choices: LanguageChoice[];
  every: boolean;
}

/**
 * The subtitle setting's choices: "Off", then the server's subtitle
 * languages in its order (GET /api/v1/subtitles/languages), named as the
 * player's menus name them; a server that names none (an empty list, or an
 * older one without the route) offers every language by name. The current
 * value stays among them.
 */
export function subtitleOptions(serverLanguages: readonly string[], current: string): LanguageOptions {
  const off = { value: SUBTITLES_OFF, label: 'Off' };
  const named: string[] = [];
  for (const l of serverLanguages) {
    if (languageTag(l) && !named.some((n) => sameChoice(n, l))) named.push(l);
  }
  if (named.length === 0) return { choices: [off, ...withCurrent(everyLanguage(true), current === SUBTITLES_OFF ? '' : current)], every: true };
  const choices = named.map((value) => ({ value, label: languageName(value) }));
  return { choices: [off, ...withCurrent(choices, current === SUBTITLES_OFF ? '' : current)], every: false };
}

/**
 * The audio setting's choices: "Original", then every language by name -
 * no server names its audio languages (chino-api has no such route), so
 * none is fixed in the app either.
 */
export function audioOptions(current: string): LanguageOptions {
  const original = { value: AUDIO_ORIGINAL, label: 'Original' };
  return { choices: [original, ...withCurrent(everyLanguage(false), current === AUDIO_ORIGINAL ? '' : current)], every: true };
}
