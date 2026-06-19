import { captureScreenshot } from './screenshot';
import { submitBugReport, type FeedbackKind, type FeedbackResult } from './feedback';

/**
 * Automatic error reporting. installErrorReporting() hooks window
 * 'error' + 'unhandledrejection' once at bootstrap; the ErrorBoundary
 * and the player's fatal-error path file through the shared
 * fileAutoReport() helper so they all share the same session guards:
 *
 *   - one report per unique fingerprint per session (module-level Set)
 *   - hard cap of 3 auto reports per session
 *
 * Auto reports are strictly fire-and-forget — every failure mode
 * (offline API, 429 rate limit, 503 unconfigured) is swallowed
 * silently. Only the MANUAL dialog surfaces submit errors.
 */

// No build-time version constant exists yet (package.json's version
// isn't injected into the bundle) — report 'dev' until one does.
const APP_VERSION = 'dev';

const MAX_AUTO_REPORTS_PER_SESSION = 3;

// Fingerprints already filed this session. Survives route changes but
// not reloads — the server-side dedup catches repeats across sessions.
const reportedFingerprints = new Set<string>();
let autoReportCount = 0;
let installed = false;

// Noise we never report:
//   - ResizeObserver loop…    benign browser-internal warning
//   - bare "Script error."    opaque cross-origin frame, zero signal
//   - AbortError              our own cancelled fetches (route changes)
//   - Failed to fetch / NetworkError   the API is unreachable — it
//     couldn't receive the report anyway
const IGNORED_MESSAGE_RE = /ResizeObserver loop|Failed to fetch|NetworkError/i;

function shouldIgnore(name: string, message: string): boolean {
  if (name === 'AbortError') return true;
  if (message.trim() === 'Script error.') return true;
  return IGNORED_MESSAGE_RE.test(message);
}

async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;

/**
 * Normalized error signature → sha-256 hex, per the feedback contract:
 * name + "|" + message with digits/uuids stripped + "|" + top 3 stack
 * frames with line:column numbers and URL query strings stripped. The
 * stripping makes "item 4f3a… failed at chunk-B9x.js:1:8231" from two
 * different sessions hash to the same ticket.
 */
export async function fingerprintFor(
  name: string,
  message: string,
  stack?: string,
): Promise<string> {
  const normMessage = message.replace(UUID_RE, '<uuid>').replace(/\d+/g, '<n>');
  const frames = (stack ?? '')
    .split('\n')
    .map((l) => l.trim())
    // Chrome frames start with "at "; Firefox/Safari use "fn@url".
    .filter((l) => l.startsWith('at ') || l.includes('@'))
    .slice(0, 3)
    .map((l) => l.replace(/\?[^\s):]*/g, '').replace(/:\d+:\d+\)?$/, ''))
    .join('|');
  return sha256Hex(`${name}|${normMessage}|${frames}`);
}

/** Context every report carries; callers merge their extras on top. */
export function baseContext(): Record<string, string> {
  return {
    route: window.location.pathname,
    appVersion: APP_VERSION,
    userAgent: navigator.userAgent,
    viewport: `${window.innerWidth}x${window.innerHeight}`,
  };
}

export interface AutoReportInput {
  kind: Exclude<FeedbackKind, 'manual'>;
  /** Error class/name for the fingerprint, e.g. 'TypeError'. */
  errorName: string;
  /** Raw error message for the fingerprint (pre-normalization). */
  message: string;
  stack?: string;
  title?: string;
  /** Full text for the ticket body (message + stack trace etc.). */
  description: string;
  extraContext?: Record<string, string>;
}

/**
 * Shared auto-report path: ignore-list → session guards → fingerprint →
 * best-effort screenshot → submit. Resolves with the ticket (so the
 * ErrorBoundary can show "#<id>") or null when skipped/failed. Never
 * throws.
 */
export async function fileAutoReport(input: AutoReportInput): Promise<FeedbackResult | null> {
  try {
    if (shouldIgnore(input.errorName, input.message)) return null;
    if (autoReportCount >= MAX_AUTO_REPORTS_PER_SESSION) return null;
    const fingerprint = await fingerprintFor(input.errorName, input.message, input.stack);
    if (reportedFingerprints.has(fingerprint)) return null;
    // Reserve the slot BEFORE the await points below — a render-loop
    // error can re-fire while the screenshot is still in flight.
    reportedFingerprints.add(fingerprint);
    autoReportCount += 1;

    const screenshot = await captureScreenshot(); // null is fine
    return await submitBugReport({
      source: 'web',
      kind: input.kind,
      title: input.title,
      description: input.description,
      fingerprint,
      context: { ...baseContext(), ...input.extraContext },
      screenshot: screenshot ?? undefined,
    });
  } catch {
    return null;
  }
}

/**
 * Hook the global error listeners. Called once from main.tsx; repeat
 * calls are no-ops (StrictMode / HMR safety).
 */
export function installErrorReporting() {
  if (installed) return;
  installed = true;

  window.addEventListener('error', (ev) => {
    const err = ev.error instanceof Error ? ev.error : null;
    const message = err?.message ?? (typeof ev.message === 'string' ? ev.message : 'Unknown error');
    const name = err?.name ?? 'Error';
    void fileAutoReport({
      kind: 'error',
      errorName: name,
      message,
      stack: err?.stack,
      title: `${name}: ${message}`.slice(0, 120),
      description:
        err?.stack ??
        // Resource / non-Error events carry no stack — synthesize the
        // source location the event reports.
        `${name}: ${message}\n    at ${ev.filename || '?'}:${ev.lineno ?? 0}:${ev.colno ?? 0}`,
    });
  });

  window.addEventListener('unhandledrejection', (ev) => {
    const reason: unknown = ev.reason;
    const err = reason instanceof Error ? reason : null;
    const message = err?.message ?? String(reason);
    const name = err?.name ?? 'UnhandledRejection';
    void fileAutoReport({
      kind: 'error',
      errorName: name,
      message,
      stack: err?.stack,
      title: `Unhandled rejection — ${name}: ${message}`.slice(0, 120),
      description: err?.stack ?? `Unhandled rejection: ${message}`,
    });
  });
}
