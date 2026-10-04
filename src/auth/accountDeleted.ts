// Once the person has deleted their account, the app signs them out and
// starts over, and the start screen says the account is deleted instead of
// sending them straight on to the sign-in page. The mark lives in
// sessionStorage: it is this tab's, and goes with it.

const KEY = 'chino:accountDeleted';

/** Set just before the deleted account is signed out. */
export function markAccountDeleted(): void {
  try {
    window.sessionStorage.setItem(KEY, '1');
  } catch {
    /* storage off: the start screen is the sign-in page, as after a sign-out */
  }
}

export function accountWasDeleted(): boolean {
  try {
    return window.sessionStorage.getItem(KEY) === '1';
  } catch {
    return false;
  }
}

export function forgetAccountDeleted(): void {
  try {
    window.sessionStorage.removeItem(KEY);
  } catch {
    /* storage off */
  }
}
