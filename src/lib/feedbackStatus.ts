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

/** The bug-report dialog's words (BugReportDialog). Its title and buttons
 *  are chrome - lowercase, in the mono face, a verb and its object, never
 *  "submit"; its messages are in the body face, without "please". */
export const BUG_REPORT = {
  title: 'report a bug',
  cancel: 'cancel',
  send: 'send report',
  close: 'close',
  retake: 'retake',
  /** The form sent without a description. */
  describe: 'Describe what happened to send the report.',
  thanks: 'Thanks for the report.',
} as const;

/** What the dialog says once a report is filed, before the issue's number
 *  (its link): sent to the people who run this server (docs/chino, words),
 *  or added to the one they already have. */
export function feedbackFiled(duplicate: boolean): string {
  return duplicate
    ? 'The people who run this server already have this one. Your details were added to'
    : 'It went to the people who run this server as';
}

/** What the form says when a report couldn't be filed: that, and why -
 *  never "please try again", which its button already offers. */
export function feedbackFailure(error: unknown): string {
  if (error instanceof FeedbackOffError) return "Bug reporting is switched off on this server, so this report can't be filed.";
  const kind = caseOf(error, 'list');
  return `Couldn't file the report. ${failureReason(kind === 'signed-out' ? 'sign-in-refused' : kind) || failureReason('refused')}`;
}
