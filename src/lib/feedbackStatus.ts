import { HttpError, caseOf, failureReason } from './loadFailure.ts';

/**
 * What a failed bug-report submission means. A 503 is the server saying
 * reporting is off (its issue tracker is not connected), which the form must
 * say as such; anything else is a failure worth retrying.
 */
export class FeedbackOffError extends Error {
  constructor() {
    super('bug reporting is off on this server');
    this.name = 'FeedbackOffError';
  }
}

/** The error to throw for a non-2xx answer from POST /api/v1/feedback: an
 *  HttpError with its status, so the form says why by its case
 *  (lib/loadFailure.ts). */
export function feedbackError(status: number): Error {
  return status === 503 ? new FeedbackOffError() : new HttpError(status);
}

/** What the form says when a report couldn't be filed: that, and why -
 *  never "please try again", which its button already offers. */
export function feedbackFailure(error: unknown): string {
  if (error instanceof FeedbackOffError) return "Bug reporting is switched off on this server, so this report can't be filed.";
  const kind = caseOf(error, 'list');
  return `Couldn't file the report. ${failureReason(kind === 'signed-out' ? 'sign-in-refused' : kind) || failureReason('refused')}`;
}
