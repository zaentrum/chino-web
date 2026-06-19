import { useState } from 'react';
import { Bug } from 'lucide-react';
import { useSettings, DEFAULT_SETTINGS } from '../../lib/settings';
import { BugReportDialog } from '../BugReportDialog';

/**
 * Client-side settings page. All values live in localStorage; the
 * server doesn't see them and they're per-device — that's the right
 * scope for playback ergonomics like binge auto-skip behaviour.
 */
export function SettingsPage() {
  const [settings, setSettings] = useSettings();
  const [bugDialogOpen, setBugDialogOpen] = useState(false);
  const binge = settings.binge;

  const updateBinge = (patch: Partial<typeof binge>) =>
    setSettings({ ...settings, binge: { ...binge, ...patch } });

  return (
    <div className="max-w-2xl">
      <h1 className="text-4xl font-bold text-white mb-6">Settings</h1>

      <Section
        title="Binge watching"
        subtitle="When you watch episodes back-to-back, Chino can auto-skip the recurring parts to keep momentum. A small countdown gives you the chance to cancel before it fires."
      >
        <Toggle
          label="Auto-skip intros"
          help="Skips the title sequence on every episode after the first in a series session. Disabled for the first episode in a session so you still see the intro at least once."
          value={binge.autoSkipIntro}
          onChange={(v) => updateBinge({ autoSkipIntro: v })}
        />
        <Toggle
          label="Auto-skip credits"
          help="Skips the closing credits at the end of an episode."
          value={binge.autoSkipCredits}
          onChange={(v) => updateBinge({ autoSkipCredits: v })}
        />
        <Toggle
          label="Auto-play next episode"
          help="Automatically starts the next episode when the credits roll. Off shows the Next Episode card and lets you click to continue."
          value={binge.autoPlayNext}
          onChange={(v) => updateBinge({ autoPlayNext: v })}
        />
        <NumberField
          label="Countdown before auto-skip"
          help="Seconds between the countdown appearing and the player actually skipping. Shorter feels snappier; longer gives you more time to cancel."
          value={binge.countdownSec}
          min={1}
          max={15}
          suffix="s"
          onChange={(v) => updateBinge({ countdownSec: v })}
        />
      </Section>

      <Section
        title="Audio"
        subtitle="Default audio language. Picks the closest matching audio track on each item. Choose Original to follow the item's source language (e.g. Japanese for anime). Manual switches in the audio menu only affect the current playback."
      >
        <ChipRow
          label="Preferred language"
          value={settings.audio.preferredLang}
          onChange={(v) =>
            setSettings({ ...settings, audio: { preferredLang: v } })
          }
          options={[
            { value: 'orig', label: 'Original (per item)' },
            { value: 'eng', label: 'English' },
            { value: 'deu', label: 'German' },
            { value: 'fra', label: 'French' },
            { value: 'spa', label: 'Spanish' },
            { value: 'ita', label: 'Italian' },
            { value: 'jpn', label: 'Japanese' },
            { value: 'por', label: 'Portuguese' },
            { value: 'nld', label: 'Dutch' },
          ]}
        />
      </Section>

      <Section
        title="Subtitles"
        subtitle="Default subtitle language. Picks the closest matching track on each item. Choose Off to keep subtitles disabled by default."
      >
        <ChipRow
          label="Preferred language"
          value={settings.subtitles.preferredLang}
          onChange={(v) =>
            setSettings({ ...settings, subtitles: { preferredLang: v } })
          }
          options={[
            { value: 'off', label: 'Off' },
            { value: 'eng', label: 'English' },
            { value: 'deu', label: 'German' },
            { value: 'fra', label: 'French' },
            { value: 'spa', label: 'Spanish' },
            { value: 'ita', label: 'Italian' },
            { value: 'jpn', label: 'Japanese' },
            { value: 'por', label: 'Portuguese' },
            { value: 'nld', label: 'Dutch' },
          ]}
        />
      </Section>

      <Section
        title="Feedback"
        subtitle="Found something broken or confusing? File a bug report — a screenshot of the current page is attached so we can see what you saw."
      >
        <div className="flex items-start justify-between gap-4 p-4">
          <span className="flex-1">
            <span className="block text-white font-medium">Report a bug</span>
            <span className="block text-xs text-[#8b949e] mt-1 leading-relaxed">
              Opens a short form. Crashes and playback failures are also reported automatically.
            </span>
          </span>
          <button
            onClick={() => setBugDialogOpen(true)}
            className="inline-flex items-center gap-2 shrink-0 px-4 py-2 rounded-lg bg-white/10 hover:bg-white/20 text-sm text-[#c9d1d9]"
          >
            <Bug className="w-4 h-4" />
            Report a bug
          </button>
        </div>
      </Section>

      <div className="mt-8 pt-6 border-t border-[#21262d]">
        <button
          onClick={() => setSettings(DEFAULT_SETTINGS)}
          className="px-4 py-2 rounded-lg bg-white/10 hover:bg-white/20 text-sm text-[#c9d1d9]"
        >
          Reset to defaults
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
      <h2 className="text-xl font-semibold text-white mb-1">{title}</h2>
      {subtitle ? <p className="text-sm text-[#8b949e] mb-5">{subtitle}</p> : null}
      <div className="rounded-xl bg-[#161b22] border border-[#21262d] divide-y divide-[#21262d]">
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
        {help ? <span className="block text-xs text-[#8b949e] mt-1 leading-relaxed">{help}</span> : null}
      </span>
      <span
        className={`relative shrink-0 w-11 h-6 rounded-full transition-colors ${value ? 'bg-[#58a6ff]' : 'bg-[#30363d]'}`}
      >
        <input
          type="checkbox"
          checked={value}
          onChange={(e) => onChange(e.target.checked)}
          className="sr-only"
        />
        <span
          className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white transition-transform ${
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
        {help ? <span className="block text-xs text-[#8b949e] mt-1 leading-relaxed">{help}</span> : null}
      </span>
      <div className="flex items-center gap-2 shrink-0">
        <input
          type="range"
          min={min}
          max={max}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          className="w-32 accent-[#58a6ff]"
        />
        <span className="text-sm text-[#c9d1d9] w-10 text-right tabular-nums">
          {value}{suffix}
        </span>
      </div>
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
          const active = value === o.value;
          return (
            <button
              key={o.value}
              onClick={() => onChange(o.value)}
              className={`px-3 py-1 rounded-full text-xs border transition-colors ${
                active
                  ? 'bg-[#58a6ff] border-[#58a6ff] text-white'
                  : 'bg-[#161b22] border-[#30363d] text-[#c9d1d9] hover:bg-[#21262d]'
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
