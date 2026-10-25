// node --test (type stripping, Node >= 22.18). Excluded from the app's tsc program.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AUDIO_SETTING_TEXT, audioOptions, everyLanguage, sameChoice, subtitleOptions } from './settingsLanguages.ts';
import { SUBTITLES_OFF_ROW } from './playerMenus.ts';

const labels = (o: { choices: { label: string }[] }) => o.choices.map((c) => c.label);

test("the audio setting's text, word for word as every chino app has it", () => {
  assert.equal(
    AUDIO_SETTING_TEXT,
    "Titles play with audio in the language you pick here, where they have it. With Original, each title plays in the language it was made in. A choice in the player applies only to what's playing now.",
  );
});

test("the subtitle setting offers the server's languages, named as the player's menus name them", () => {
  const o = subtitleOptions(['en', 'de', 'zh-Hans'], 'off');
  assert.equal(o.every, false);
  assert.deepEqual(labels(o), ['off', 'English', 'German', 'Chinese (Simplified)']);
  assert.deepEqual(o.choices.map((c) => c.value), ['off', 'en', 'de', 'zh-Hans']);
  // A region in the standard form, as the menu has it.
  assert.deepEqual(labels(subtitleOptions(['pt-BR'], 'off')), ['off', 'Portuguese (Brazil)']);
  // Codes that name no language, or one twice, offer nothing more.
  assert.deepEqual(labels(subtitleOptions(['und', 'en', 'eng'], 'off')), ['off', 'English']);
});

test('the subtitle setting says "off" as the player\'s subtitles menu does, with or without the server\'s languages', () => {
  assert.equal(SUBTITLES_OFF_ROW, 'off');
  for (const server of [['en', 'de'], []]) {
    const off = subtitleOptions(server, 'off').choices[0];
    assert.deepEqual(off, { value: 'off', label: SUBTITLES_OFF_ROW });
    // Never "Off": the menu's word, lowercase.
    assert.ok(!subtitleOptions(server, 'eng').choices.some((c) => c.label === 'Off'));
  }
});

test('what is set stays among the choices, and shows as set', () => {
  // An older setting's code is the server's language.
  const o = subtitleOptions(['en', 'de'], 'eng');
  assert.deepEqual(labels(o), ['off', 'English', 'German']);
  assert.equal(sameChoice('eng', 'en'), true);
  assert.equal(sameChoice('zh-Hans', 'zh-Hant'), false);
  assert.equal(sameChoice('off', 'off'), true);
  // A language the server no longer names: kept, last.
  assert.deepEqual(labels(subtitleOptions(['en', 'de'], 'jpn')), ['off', 'English', 'German', 'Japanese']);
});

test('a server that names none offers every language by name, in alphabetical order', () => {
  const o = subtitleOptions([], 'eng');
  assert.equal(o.every, true);
  assert.equal(o.choices[0].label, 'off');
  const names = labels(o).slice(1);
  assert.deepEqual(names, [...names].sort(new Intl.Collator('en').compare));
  for (const name of ['English', 'German', 'Japanese', 'Chinese', 'Chinese (Simplified)', 'Chinese (Traditional)', 'Tagalog']) {
    assert.ok(names.includes(name), name);
  }
  // Each language once, and each by a name, never by its code.
  assert.equal(new Set(names).size, names.length);
  for (const c of o.choices.slice(1)) assert.notEqual(c.label.toLowerCase(), c.value.toLowerCase(), c.value);
});

test('the audio setting: Original, then every language by name - no list fixed in the app', () => {
  const o = audioOptions('orig');
  assert.equal(o.every, true);
  assert.equal(o.choices[0].label, 'Original');
  assert.equal(o.choices[0].value, 'orig');
  assert.ok(labels(o).includes('Dutch'));
  assert.ok(labels(o).includes('Korean'));
  // Audio has no scripts.
  assert.ok(!labels(o).includes('Chinese (Simplified)'));
  assert.equal(everyLanguage(false).length + 2, everyLanguage(true).length);
  for (const c of o.choices.slice(1)) assert.notEqual(c.label.toLowerCase(), c.value.toLowerCase(), c.value);
  // An older setting's code shows as the language it names.
  assert.equal(audioOptions('deu').choices.find((c) => sameChoice(c.value, 'deu'))?.label, 'German');
});
