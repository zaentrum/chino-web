import { useEffect, useId, useState } from 'react';
import { useAuth } from 'react-oidc-context';
import { Bug } from 'lucide-react';
import { useSettings, DEFAULT_SETTINGS } from '../../lib/settings';
import { BugReportDialog } from '../BugReportDialog';
import { CouldntLoad } from '../CouldntLoad';
import { LoadingState } from '../LoadingState';
import { feedbackAvailable } from '../../lib/runtimeConfig';
import { SUBTITLE_SETTING_TEXT, settingsSubtitleLanguages } from '../../lib/subtitles';
import { couldntLoad } from '../../lib/loadFailure';
import { AUDIO_SETTING_TEXT, audioOptions, sameChoice, subtitleOptions, type LanguageOptions } from '../../lib/settingsLanguages';
import { PAGE_HEADING, QUIET_BUTTON, SECTION_HEADING, SETTINGS_HINTS, SETTINGS_WORDS } from '../../lib/chromeWords';

/**
 * The server's subtitle languages for Settings (GET
 * /api/v1/subtitles/languages, lib/subtitles.ts settingsSubtitleLanguages):
 * the list, or why it couldn't load, and try again.
 */
function useSubtitleLanguages() {
  const auth = useAuth();
  const token = auth.user?.access_token;
  const [state, setState] = useState<{ list: readonly string[] | null; error: unknown }>({ list: null, error: null });
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!token) return;
    let live = true;
    setState({ list: null, error: null });
    settingsSubtitleLanguages(async () => {
      const r = await fetch('/api/v1/subtitles/languages', { headers: { Authorization: `Bearer ${token}` } });
      return { status: r.status, body: r.ok ? await r.json().catch(() => null) : null };
    })
      .then((list) => {
        if (live) setState({ list, error: null });
      })
      .catch((error: unknown) => {
        if (live) setState({ list: null, error });
      });
    return () => {
      live = false;
    };
    // A renewed bearer asks nothing new; try again does.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [!!token, attempt]);
  return { ...state, retry: () => setAttempt((a) => a + 1) };
}

/**
 * Client-side settings page. All values live in localStorage; the
 * server doesn't see them and they're per-device — that's the right
 * scope for playback ergonomics like binge auto-skip behaviour.
 */
export function SettingsPage() {
  const [settings, setSettings] = useSettings();
  const [bugDialogOpen, setBugDialogOpen] = useState(false);
  const subtitleLanguages = useSubtitleLanguages();
  const binge = settings.binge;

  const updateBinge = (patch: Partial<typeof binge>) =>
    setSettings({ ...settings, binge: { ...binge, ...patch } });

  return (
    <div className="max-w-2xl">
      {/* The page's chrome - its heading, the sections' titles, the buttons -
          in the mono face, lowercase; labels and hints in the body face. */}
      <h1 className={PAGE_HEADING}>{SETTINGS_WORDS.heading}</h1>

      <Section
        title={SETTINGS_WORDS.binge}
        subtitle="When you watch episodes back-to-back, the player can skip the parts that repeat. A countdown shows first, so you can cancel."
      >
        <Toggle
          label="Auto-skip intros"
          help={SETTINGS_HINTS.autoSkipIntro}
          value={binge.autoSkipIntro}
          onChange={(v) => updateBinge({ autoSkipIntro: v })}
        />
        <Toggle
          label="Auto-play next episode"
          help={SETTINGS_HINTS.autoPlayNext}
          value={binge.autoPlayNext}
          onChange={(v) => updateBinge({ autoPlayNext: v })}
        />
        <NumberField
          label="Countdown before auto-skip"
          help="Seconds between the countdown appearing and the player skipping."
          value={binge.countdownSec}
          min={1}
          max={15}
          suffix="s"
          onChange={(v) => updateBinge({ countdownSec: v })}
        />
      </Section>

      <Section title={SETTINGS_WORDS.audio} subtitle={AUDIO_SETTING_TEXT}>
        <LanguageSetting
          label="Preferred language"
          value={settings.audio.preferredLang}
          options={audioOptions(settings.audio.preferredLang)}
          onChange={(v) => setSettings({ ...settings, audio: { preferredLang: v } })}
        />
      </Section>

      {/* The server's subtitle languages, named as the player's menus name
          them; every language where the server names none; why, where they
          couldn't load. */}
      <Section title={SETTINGS_WORDS.subtitles} subtitle={SUBTITLE_SETTING_TEXT}>
        {subtitleLanguages.error ? (
          <CouldntLoad
            title={couldntLoad('the subtitle languages')}
            error={subtitleLanguages.error}
            onRetry={subtitleLanguages.retry}
            level={3}
          />
        ) : subtitleLanguages.list ? (
          <LanguageSetting
            label="Preferred language"
            value={settings.subtitles.preferredLang}
            options={subtitleOptions(subtitleLanguages.list, settings.subtitles.preferredLang)}
            onChange={(v) => setSettings({ ...settings, subtitles: { preferredLang: v } })}
          />
        ) : (
          <div className="p-4">
            <LoadingState message="Loading the subtitle languages…" />
          </div>
        )}
      </Section>

      {/* Offered only when this server files reports; otherwise the form would fail. */}
      {feedbackAvailable() && (
      <Section
        title={SETTINGS_WORDS.feedback}
        subtitle="Reports go to the people who run this server, with a screenshot of the page if you attach one."
      >
        <div className="flex items-start justify-between gap-4 p-4">
          <span className="flex-1">
            <span className="block text-white font-medium">Report a bug</span>
            <span className="block text-xs text-chino-muted mt-1 leading-relaxed">
              Opens a short form. Crashes and playback failures are also reported automatically, without a screenshot.
            </span>
          </span>
          <button onClick={() => setBugDialogOpen(true)} className={`shrink-0 ${QUIET_BUTTON}`}>
            <Bug className="w-4 h-4" aria-hidden />
            {SETTINGS_WORDS.reportBug}
          </button>
        </div>
      </Section>
      )}

      <div className="mt-8 pt-6 border-t border-chino-border-2">
        <button onClick={() => setSettings(DEFAULT_SETTINGS)} className={QUIET_BUTTON}>
          {SETTINGS_WORDS.reset}
        </button>
      </div>

      {bugDialogOpen && <BugReportDialog onClose={() => setBugDialogOpen(false)} />}
    </div>
  );
}

function Section({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mb-10">
      <h2 className={SECTION_HEADING}>{title}</h2>
      {subtitle ? <p className="text-sm text-chino-muted mb-5">{subtitle}</p> : null}
      <div className="bg-chino-surface border border-chino-border-2 divide-y divide-chino-border-2">
        {children}
      </div>
    </section>
  );
}

function Toggle({
  label,
  help,
  value,
  onChange,
}: {
  label: string;
  help?: string;
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex items-start justify-between gap-4 p-4 cursor-pointer">
      <span className="flex-1">
        <span className="block text-white font-medium">{label}</span>
        {help ? <span className="block text-xs text-chino-muted mt-1 leading-relaxed">{help}</span> : null}
      </span>
      <span
        className={`relative shrink-0 w-11 h-6 transition-colors ${value ? 'bg-chino-accent' : 'bg-chino-border'}`}
      >
        <input
          type="checkbox"
          checked={value}
          onChange={(e) => onChange(e.target.checked)}
          className="sr-only"
        />
        <span
          className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white transition-transform ${
            value ? 'translate-x-5' : 'translate-x-0'
          }`}
        />
      </span>
    </label>
  );
}

function NumberField({
  label,
  help,
  value,
  min,
  max,
  suffix,
  onChange,
}: {
  label: string;
  help?: string;
  value: number;
  min: number;
  max: number;
  suffix?: string;
  onChange: (v: number) => void;
}) {
  return (
    <div className="flex items-start justify-between gap-4 p-4">
      <span className="flex-1">
        <span className="block text-white font-medium">{label}</span>
        {help ? <span className="block text-xs text-chino-muted mt-1 leading-relaxed">{help}</span> : null}
      </span>
      <div className="flex items-center gap-2 shrink-0">
        <input
          type="range"
          min={min}
          max={max}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          className="w-32 accent-chino-accent"
        />
        <span className="text-sm text-chino-text w-10 text-right tabular-nums">
          {value}{suffix}
        </span>
      </div>
    </div>
  );
}

/** A language setting: the few the server names as chips, every language
 *  as a list to pick from. */
function LanguageSetting({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: LanguageOptions;
  onChange: (v: string) => void;
}) {
  const id = useId();
  if (!options.every) return <ChipRow label={label} value={value} options={options.choices} onChange={onChange} />;
  const picked = options.choices.find((c) => sameChoice(c.value, value))?.value ?? value;
  return (
    <div className="p-4">
      <label htmlFor={id} className="block text-white font-medium mb-3">
        {label}
      </label>
      <select
        id={id}
        value={picked}
        onChange={(e) => onChange(e.target.value)}
        className="w-full sm:w-72 h-10 px-3 bg-chino-bg border border-chino-border text-sm text-chino-text focus:outline-none focus:border-chino-accent"
      >
        {options.choices.map((c) => (
          <option key={c.value} value={c.value}>
            {c.label}
          </option>
        ))}
      </select>
    </div>
  );
}

function ChipRow({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (v: string) => void;
}) {
  return (
    <div className="p-4">
      <span className="block text-white font-medium mb-3">{label}</span>
      <div className="flex flex-wrap gap-2">
        {options.map((o) => {
          const active = sameChoice(o.value, value);
          return (
            <button
              key={o.value}
              onClick={() => onChange(o.value)}
              className={`px-3 py-1 text-xs border transition-colors ${
                active
                  ? 'bg-chino-accent border-chino-accent text-chino-bg'
                  : 'bg-chino-surface border-chino-border text-chino-text hover:bg-chino-surface-2'
              }`}
            >
              {o.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
