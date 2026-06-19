import { authority, clientId } from '../auth/oidc';

/**
 * Client for the chino-api bug-report endpoint (POST /api/v1/feedback).
 * Reports land as tickets on the connected server's issue tracker; the
 * server dedups by fingerprint (same signature appends a comment to the
 * existing ticket instead of opening a new one) and rate-limits to
 * 5 reports per user per 10 minutes.
 */

export type FeedbackKind = 'manual' | 'error' | 'crash' | 'player';

export interface FeedbackResult {
  /** Ticket id of the created (or matched) ticket. */
  id: number;
  /** Deep link into the connected server's issue tracker for the ticket. */
  url: string;
  /** True when the report matched an existing ticket by fingerprint. */
  duplicate: boolean;
}

export interface BugReport {
  source: 'web';
  kind: FeedbackKind;
  title?: string;
  description: string;
  /**
   * Lowercase hex sha-256 of the normalized error signature. Only set
   * for auto reports — manual reports omit it so they never collapse
   * into an unrelated ticket.
   */
  fingerprint?: string;
  /** Flat string map: route, appVersion, userAgent, viewport, … */
  context: Record<string, string>;
  /** Optional PNG/JPEG screenshot. Server rejects > 3 MB. */
  screenshot?: Blob | null;
}

/**
 * Access token for the Authorization header. The rest of the app reads
 * `auth.user?.access_token` via react-oidc-context's useAuth() hook —
 * but feedback submission also happens OUTSIDE React (window error
 * listeners, ErrorBoundary), so we read the same persisted user that
 * hook is backed by: oidc-client-ts stores it in localStorage (see
 * `userStore` in auth/oidc.ts) under a well-known key.
 */
function accessToken(): string | null {
  try {
    const key = `oidc.user:${authority}:${clientId}`;
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    return JSON.parse(raw)?.access_token ?? null;
  } catch {
    return null;
  }
}

/**
 * Submit a bug report. Builds the multipart body per the /api/v1/feedback
 * contract: a "report" JSON part plus an optional "screenshot" image
 * part. Resolves with the ticket id/url; throws on any non-2xx (callers
 * on the auto-report path swallow that — manual UI surfaces it).
 */
export async function submitBugReport(report: BugReport): Promise<FeedbackResult> {
  const { screenshot, ...payload } = report;
  const form = new FormData();
  // Wrapping the JSON in a Blob is what gives the part an explicit
  // application/json content type — a plain string part would be
  // text/plain and the server would reject it.
  form.append(
    'report',
    new Blob([JSON.stringify(payload)], { type: 'application/json' }),
  );
  if (screenshot) {
    const ext = screenshot.type === 'image/png' ? 'png' : 'jpg';
    form.append('screenshot', screenshot, `screenshot.${ext}`);
  }

  const headers = new Headers();
  const token = accessToken();
  if (token) headers.set('Authorization', `Bearer ${token}`);
  // NOTE: no explicit Content-Type — fetch derives the multipart
  // boundary from the FormData body; setting it by hand would break it.
  const res = await fetch('/api/v1/feedback', {
    method: 'POST',
    headers,
    body: form,
  });
  if (!res.ok) throw new Error(`chino-api ${res.status}`);
  return res.json() as Promise<FeedbackResult>;
}
