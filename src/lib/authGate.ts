// What the gate (auth/AuthGate.tsx) shows in place of the app, or the app.
// Pure: authGate.test.ts runs it under node --test.

/** The splash ("Signing you in…"), the start screen that says the account
 *  is deleted (docs/chino, settings 16.5.6), the sign-in that failed, or
 *  the app's screens. */
export type GateScreen = 'splash' | 'account-deleted' | 'sign-in-failed' | 'app';

export function gateScreen(s: {
  /** The tab loads anew for another account (lib/tabAccount.ts). */
  leaving: boolean;
  isLoading: boolean;
  isAuthenticated: boolean;
  /** The sign-in came back with an error. */
  error: boolean;
  /** The tab's mark that its account is deleted (auth/accountDeleted.ts). */
  accountDeleted: boolean;
}): GateScreen {
  // Loading anew for another account: none of the old screens is shown, so
  // none of them is clicked, re-rendered with that account's token, or
  // writes under it, until the page goes.
  if (s.leaving) return 'splash';
  if (!s.isLoading && !s.isAuthenticated && s.accountDeleted) return 'account-deleted';
  if (s.error) return 'sign-in-failed';
  if (s.isLoading || !s.isAuthenticated) return 'splash';
  return 'app';
}
