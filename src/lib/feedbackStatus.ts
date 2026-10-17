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

/** The error to throw for a non-2xx answer from POST /api/v1/feedback. */
export function feedbackError(status: number): Error {
  return status === 503 ? new FeedbackOffError() : new Error(`chino-api ${status}`);
}
