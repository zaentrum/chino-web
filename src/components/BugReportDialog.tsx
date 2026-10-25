import { useEffect, useState } from 'react';
import { Camera, ExternalLink, Loader2, X } from 'lucide-react';
import { captureScreenshot } from '../lib/screenshot';
import { submitBugReport, type FeedbackResult } from '../lib/feedback';
import { BUG_REPORT, feedbackFailure, feedbackFiled, reportDescription } from '../lib/feedbackStatus';
import { baseContext } from '../lib/errorReporter';

type Phase = 'capturing' | 'editing' | 'submitting' | 'done';

/**
 * Manual bug-report dialog. Opened from the Settings page and the
 * player's error overlay.
 *
 * The box the viewer types in opens empty: it is for their words alone.
 * What the app knows of a failure (the player's technical signature) is a
 * part of its own under "details", shown as it is, not editable, and sent
 * with the report after the viewer's words (reportDescription). "send
 * report" needs the viewer's words.
 *
 * A screenshot is the viewer's to give: nothing is captured until they
 * tick "Attach a screenshot of the page", and only a ticked box sends
 * one. (The dialog used to capture the page as it opened and send the
 * shot unless the box was cleared.)
 *
 * Screenshot choreography: the dialog renders NOTHING while a capture
 * is in flight ('capturing' phase) so the dialog itself never appears
 * in the shot. Ticking the box enters that phase; "Retake" re-enters
 * it — React commits the null render before the effect fires, so
 * html2canvas clones a dialog-free DOM both times.
 */
export function BugReportDialog({
  details,
  extraContext = {},
  onClose,
}: {
  /** What the app knows of the failure (the player's technical error
   *  string): shown under "details", not editable, and sent with the
   *  report - never put in the box the viewer types in. */
  details?: string;
  /** Merged on top of the shared baseContext (route/version/UA/viewport). */
  extraContext?: Record<string, string>;
  onClose: () => void;
}) {
  const [phase, setPhase] = useState<Phase>('editing');
  const [description, setDescription] = useState('');
  const [shot, setShot] = useState<Blob | null>(null);
  const [shotUrl, setShotUrl] = useState<string | null>(null);
  const [includeShot, setIncludeShot] = useState(false);
  // Whether a capture was attempted: a failed one says so.
  const [captured, setCaptured] = useState(false);
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
      setCaptured(true);
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
      setError(BUG_REPORT.describe);
      return;
    }
    setError(null);
    setPhase('submitting');
    try {
      const r = await submitBugReport({
        source: 'web',
        kind: 'manual',
        description: reportDescription(description, details),
        context: { ...baseContext(), ...extraContext },
        screenshot: includeShot && shot ? shot : undefined,
      });
      setResult(r);
      setPhase('done');
    } catch (e) {
      // Keep the text so the user can retry without retyping; say why it
      // failed - reporting switched off, where a retry cannot help, or the
      // case of the answer (lib/feedbackStatus.ts).
      setError(feedbackFailure(e));
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
        // Square, as every frame in the design system.
        className="w-full max-w-lg mx-4 max-h-[85vh] overflow-y-auto bg-chino-surface border border-white/10 shadow-2xl"
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/10">
          {/* The dialog's title and its buttons: chrome, in the mono face,
              lowercase. */}
          <h2 className="font-mono text-lg font-medium text-white">{BUG_REPORT.title}</h2>
          <button onClick={onClose} className="p-1 hover:bg-white/10 text-chino-text" title={BUG_REPORT.close} aria-label={BUG_REPORT.close}>
            <X className="w-5 h-5" />
          </button>
        </div>

        {phase === 'done' && result ? (
          <div className="p-6 space-y-4 text-sm">
            <p className="text-white font-medium">{BUG_REPORT.thanks}</p>
            <p className="text-chino-text">
              {feedbackFiled(!!result.duplicate)}{' '}
              <a
                href={result.url}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-chino-accent hover:underline"
              >
                #{result.id}
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
              .
            </p>
            <div className="flex justify-end">
              <button
                onClick={onClose}
                className="px-4 py-2 bg-white/10 hover:bg-white/20 font-mono text-sm text-chino-text"
              >
                {BUG_REPORT.close}
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
                className="w-full bg-chino-bg border border-chino-border px-3 py-2 text-sm text-chino-text placeholder:text-chino-muted/70 focus:outline-none focus:border-chino-accent resize-y"
              />
            </div>

            {details ? (
              <details className="text-xs text-chino-muted">
                <summary className="font-mono cursor-pointer hover:text-chino-text">{BUG_REPORT.details}</summary>
                <p className="mt-2">{BUG_REPORT.detailsSent}</p>
                <pre className="mt-1 max-h-40 overflow-auto whitespace-pre-wrap break-words bg-chino-bg border border-chino-border px-3 py-2 font-mono text-chino-text">
                  {details}
                </pre>
              </details>
            ) : null}

            <div>
              <div className="flex items-center justify-between gap-3">
                <label className="flex items-center gap-2 text-chino-text cursor-pointer">
                  <input
                    type="checkbox"
                    checked={includeShot}
                    onChange={(e) => {
                      setIncludeShot(e.target.checked);
                      // The first tick takes the picture.
                      if (e.target.checked && !captured) setPhase('capturing');
                    }}
                    className="accent-chino-accent"
                  />
                  Attach a screenshot of the page
                </label>
                {includeShot && shotUrl ? (
                  <button
                    onClick={() => setPhase('capturing')}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white/10 hover:bg-white/20 font-mono text-xs text-chino-text"
                  >
                    <Camera className="w-3.5 h-3.5" />
                    {BUG_REPORT.retake}
                  </button>
                ) : null}
              </div>
              {includeShot && shotUrl ? (
                <img
                  src={shotUrl}
                  alt="Screenshot preview"
                  className="mt-2 max-h-40 border border-chino-border"
                />
              ) : includeShot && captured && !shot ? (
                <p className="mt-2 text-xs text-chino-muted">
                  Couldn't capture a screenshot on this page — the report will be sent without one.
                </p>
              ) : null}
            </div>

            {error ? (
              <p className="text-sm text-chino-red bg-chino-red/10 border border-chino-red/30 px-3 py-2">
                {error}
              </p>
            ) : null}

            <div className="flex justify-end gap-2 pt-1">
              <button
                onClick={onClose}
                className="px-4 py-2 bg-white/10 hover:bg-white/20 font-mono text-sm text-chino-text"
              >
                {BUG_REPORT.cancel}
              </button>
              <button
                onClick={submit}
                disabled={phase === 'submitting'}
                className="inline-flex items-center gap-2 px-4 py-2 bg-chino-accent hover:bg-chino-accent/80 disabled:opacity-60 font-mono text-sm text-chino-bg font-medium"
              >
                {phase === 'submitting' ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                {BUG_REPORT.send}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
