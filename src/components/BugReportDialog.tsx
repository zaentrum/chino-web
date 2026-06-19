import { useEffect, useState } from 'react';
import { Camera, ExternalLink, Loader2, X } from 'lucide-react';
import { captureScreenshot } from '../lib/screenshot';
import { submitBugReport, type FeedbackResult } from '../lib/feedback';
import { baseContext } from '../lib/errorReporter';

type Phase = 'capturing' | 'editing' | 'submitting' | 'done';

/**
 * Manual bug-report dialog. Opened from the Settings page and the
 * player's error overlay.
 *
 * Screenshot choreography: the dialog renders NOTHING while a capture
 * is in flight ('capturing' phase) so the dialog itself never appears
 * in the shot. Initial mount starts in that phase; "Retake" re-enters
 * it — React commits the null render before the effect fires, so
 * html2canvas clones a dialog-free DOM both times.
 */
export function BugReportDialog({
  initialDescription = '',
  extraContext = {},
  onClose,
}: {
  /** Pre-filled description (e.g. the player's technical error string). */
  initialDescription?: string;
  /** Merged on top of the shared baseContext (route/version/UA/viewport). */
  extraContext?: Record<string, string>;
  onClose: () => void;
}) {
  const [phase, setPhase] = useState<Phase>('capturing');
  const [description, setDescription] = useState(initialDescription);
  const [shot, setShot] = useState<Blob | null>(null);
  const [shotUrl, setShotUrl] = useState<string | null>(null);
  const [includeShot, setIncludeShot] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<FeedbackResult | null>(null);

  // Capture runs as an effect of the 'capturing' phase so the dialog's
  // null render is committed to the DOM before html2canvas walks it.
  useEffect(() => {
    if (phase !== 'capturing') return;
    let cancelled = false;
    captureScreenshot().then((blob) => {
      if (cancelled) return;
      setShot(blob);
      setPhase('editing');
    });
    return () => {
      cancelled = true;
    };
  }, [phase]);

  // Thumbnail object URL lifecycle — revoke the old one whenever the
  // blob changes (Retake) or the dialog unmounts.
  useEffect(() => {
    if (!shot) {
      setShotUrl(null);
      return;
    }
    const url = URL.createObjectURL(shot);
    setShotUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [shot]);

  const submit = async () => {
    if (!description.trim()) {
      setError('Please describe what happened.');
      return;
    }
    setError(null);
    setPhase('submitting');
    try {
      const r = await submitBugReport({
        source: 'web',
        kind: 'manual',
        description: description.trim(),
        context: { ...baseContext(), ...extraContext },
        screenshot: includeShot && shot ? shot : undefined,
      });
      setResult(r);
      setPhase('done');
    } catch {
      // Keep the text so the user can retry without retyping.
      setError("Couldn't file the report. Please try again in a moment.");
      setPhase('editing');
    }
  };

  // Nothing on screen while the screenshot is being taken.
  if (phase === 'capturing') return null;

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-lg mx-4 max-h-[85vh] overflow-y-auto rounded-xl bg-[#161b22] border border-white/10 shadow-2xl"
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/10">
          <h2 className="text-lg font-medium text-white">Report a bug</h2>
          <button onClick={onClose} className="p-1 rounded hover:bg-white/10 text-[#c9d1d9]" title="Close">
            <X className="w-5 h-5" />
          </button>
        </div>

        {phase === 'done' && result ? (
          <div className="p-6 space-y-4 text-sm">
            <p className="text-white font-medium">
              {result.duplicate ? 'Thanks — this one is already on file.' : 'Thanks for the report!'}
            </p>
            <p className="text-[#c9d1d9]">
              {result.duplicate
                ? 'Your details were added to the existing ticket '
                : 'Filed bug '}
              <a
                href={result.url}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-[#58a6ff] hover:underline"
              >
                #{result.id}
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
              .
            </p>
            <div className="flex justify-end">
              <button
                onClick={onClose}
                className="px-4 py-2 rounded-lg bg-white/10 hover:bg-white/20 text-sm text-[#c9d1d9]"
              >
                Close
              </button>
            </div>
          </div>
        ) : (
          <div className="p-6 space-y-4 text-sm">
            <div>
              <label className="block text-white font-medium mb-2" htmlFor="bug-description">
                What happened?
              </label>
              <textarea
                id="bug-description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={5}
                autoFocus
                placeholder="What were you doing, what did you expect, what happened instead?"
                className="w-full bg-[#0d1117] border border-[#30363d] rounded-md px-3 py-2 text-sm text-[#c9d1d9] placeholder:text-[#8b949e]/70 focus:outline-none focus:border-[#58a6ff] resize-y"
              />
            </div>

            {shotUrl ? (
              <div>
                <img
                  src={shotUrl}
                  alt="Screenshot preview"
                  className="max-h-40 rounded-lg border border-[#30363d]"
                />
                <div className="mt-2 flex items-center justify-between gap-3">
                  <label className="flex items-center gap-2 text-[#c9d1d9] cursor-pointer">
                    <input
                      type="checkbox"
                      checked={includeShot}
                      onChange={(e) => setIncludeShot(e.target.checked)}
                      className="accent-[#58a6ff]"
                    />
                    Include screenshot
                  </label>
                  <button
                    onClick={() => setPhase('capturing')}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-xs text-[#c9d1d9]"
                  >
                    <Camera className="w-3.5 h-3.5" />
                    Retake
                  </button>
                </div>
              </div>
            ) : (
              <p className="text-xs text-[#8b949e]">
                Couldn't capture a screenshot on this page — the report will be sent without one.
              </p>
            )}

            {error ? (
              <p className="text-sm text-rose-300 bg-rose-500/10 border border-rose-500/30 rounded-lg px-3 py-2">
                {error}
              </p>
            ) : null}

            <div className="flex justify-end gap-2 pt-1">
              <button
                onClick={onClose}
                className="px-4 py-2 rounded-lg bg-white/10 hover:bg-white/20 text-sm text-[#c9d1d9]"
              >
                Cancel
              </button>
              <button
                onClick={submit}
                disabled={phase === 'submitting'}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[#58a6ff] hover:bg-[#58a6ff]/80 disabled:opacity-60 text-sm text-white font-medium"
              >
                {phase === 'submitting' ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                Submit report
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
