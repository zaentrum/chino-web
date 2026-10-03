// Which failures chino reports by itself. A viewer who follows a bad or
// old link, or opens a title that has been removed, is told so on the page;
// that is not a bug, and a ticket for it is only noise. Pure:
// reportPolicy.test.ts runs it under node --test.

/** HTTP statuses that mean what was asked for is not there: 404, 410. */
export function isNotFoundStatus(status: number | null | undefined): boolean {
  return status === 404 || status === 410;
}

/** An error the app's own fetch helpers throw for such a status:
 *  "chino-api 404", "watchlist 410". */
export function isNotFoundError(message: string): boolean {
  return /^[\w-]+ (404|410)$/.test(message.trim());
}
