import { useEffect, useId, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { useAuth, type AuthContextProps } from 'react-oidc-context';
import { AlertTriangle, Loader2, X } from 'lucide-react';
import {
  accountDeletionAnswer,
  accountDeletionTitle,
  deleteAccount,
  type AccountDeletion,
} from '../lib/account';
import { markAccountDeleted } from '../auth/accountDeleted';
import { forgetStreamToken } from '../hooks/useStreamToken';
import { toApp } from '../lib/basepath';

type Failure = Exclude<AccountDeletion, { kind: 'deleted' }>;

/** What the person types to confirm. */
const CONFIRM_WORD = 'DELETE';

/**
 * Delete Account, opened from the Profile page next to Sign out. It says
 * what goes — the person's watch progress, lists, likes and watch history
 * on this server, and their sign-in — asks them to type DELETE, and sends
 * DELETE /api/v1/me (lib/account.ts):
 *
 *  - deleted: the person is signed out here (the OIDC user and the cached
 *    stream token go) and the start screen says the account is deleted
 *    (AuthGate);
 *  - refused, or not available on this server: the reason, and Close —
 *    asking again changes nothing;
 *  - any other answer: Try Again Later, with the server's message. The
 *    person stays signed in and may try again.
 *
 * Escape, Cancel or a click outside close it, except while the request is
 * out. A modal dialog to assistive technology: labelled by its title,
 * described by what it deletes, Tab kept inside, progress announced, a
 * failure announced as an alert.
 */
export function DeleteAccountDialog({ onClose }: { onClose: () => void }) {
  const auth = useAuth();
  const [typed, setTyped] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [failure, setFailure] = useState<Failure | null>(null);
  const titleId = useId();
  const descriptionId = useId();
  const inputId = useId();
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const confirmRef = useRef<HTMLButtonElement | null>(null);
  const closeRef = useRef<HTMLButtonElement | null>(null);

  const confirmed = typed.trim().toUpperCase() === CONFIRM_WORD;
  // Refused, or a server that deletes no accounts: no point asking again.
  const final = failure?.kind === 'refused' || failure?.kind === 'unavailable';

  const profile = auth.user?.profile;
  const who = (profile?.email as string | undefined)
    || (profile?.preferred_username as string | undefined)
    || (profile?.name as string | undefined);

  // Focus the confirmation field on open; hand focus back to whatever
  // opened the dialog when it closes.
  useEffect(() => {
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    inputRef.current?.focus();
    return () => opener?.focus();
  }, []);

  // After an answer, focus lands on what comes next: Close when it is
  // final, Delete Account again otherwise.
  useEffect(() => {
    if (!failure) return;
    (final ? closeRef.current : confirmRef.current)?.focus();
  }, [failure, final]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !deleting) onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [deleting, onClose]);

  // Tab and Shift+Tab stay inside the dialog.
  const keepTabInside = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'Tab' || !dialogRef.current) return;
    const items = Array.from(
      dialogRef.current.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled])'),
    );
    if (items.length === 0) return;
    const first = items[0];
    const last = items[items.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  };

  const submit = async () => {
    if (!confirmed || deleting || final) return;
    setDeleting(true);
    setFailure(null);
    const token = await freshAccessToken(auth);
    const answer: AccountDeletion = token
      ? await deleteAccount({ token })
      : accountDeletionAnswer(401, null);
    if (answer.kind === 'deleted') {
      // The account is gone: sign out here. The mark first, so the start
      // screen says what happened instead of going on to the sign-in page.
      markAccountDeleted();
      forgetStreamToken();
      try {
        await auth.removeUser();
      } catch {
        window.location.replace(toApp('/'));
      }
      return;
    }
    setFailure(answer);
    setDeleting(false);
  };

  return (
    <div
      onClick={() => {
        if (!deleting) onClose();
      }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70"
    >
      <div
        ref={dialogRef}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={keepTabInside}
        className="w-full max-w-lg mx-4 max-h-[85vh] overflow-y-auto rounded-xl bg-chino-surface border border-white/10 shadow-2xl"
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/10">
          <h2 id={titleId} className="text-lg font-medium text-white">Delete Account</h2>
          <button
            onClick={onClose}
            disabled={deleting}
            className="p-1 rounded hover:bg-white/10 text-chino-text disabled:opacity-40"
            title="Close"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-4 text-sm">
          <div id={descriptionId} className="space-y-3 text-chino-text">
            <p>
              This deletes{' '}
              {who ? (
                <>the account <span className="text-white font-medium break-all">{who}</span></>
              ) : (
                'your account'
              )}{' '}
              on this server, and with it:
            </p>
            <ul className="list-disc pl-5 space-y-1">
              <li>your watch progress</li>
              <li>your lists</li>
              <li>your likes</li>
              <li>your watch history</li>
              <li>your sign-in: you can't sign in with this account again</li>
            </ul>
            <p>This can't be undone.</p>
          </div>

          {!final ? (
            <div>
              <label htmlFor={inputId} className="block text-white font-medium mb-2">
                Type {CONFIRM_WORD} to confirm
              </label>
              <input
                id={inputId}
                ref={inputRef}
                value={typed}
                onChange={(e) => setTyped(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    void submit();
                  }
                }}
                readOnly={deleting}
                autoComplete="off"
                autoCapitalize="characters"
                autoCorrect="off"
                spellCheck={false}
                className="w-full bg-chino-bg border border-chino-border rounded-md px-3 py-2 text-sm text-chino-text placeholder:text-chino-muted/70 focus:outline-none focus:border-chino-red"
              />
            </div>
          ) : null}

          {failure ? (
            <div
              role="alert"
              className="flex items-start gap-2 bg-chino-red/10 border border-chino-red/30 rounded-lg px-3 py-2"
            >
              <AlertTriangle className="w-4 h-4 text-chino-red mt-0.5 shrink-0" aria-hidden="true" />
              <div>
                <p className="text-white font-medium">{accountDeletionTitle(failure)}</p>
                <p className="text-chino-text">{failure.message}</p>
              </div>
            </div>
          ) : null}

          <div className="flex items-center justify-end gap-2 pt-1">
            {/* Progress, announced as it starts. */}
            <div role="status" aria-live="polite" className="mr-auto text-chino-muted">
              {deleting ? 'Deleting your account…' : null}
            </div>
            <button
              ref={closeRef}
              onClick={onClose}
              disabled={deleting}
              className="px-4 py-2 rounded-lg bg-white/10 hover:bg-white/20 disabled:opacity-40 text-sm text-chino-text"
            >
              {final ? 'Close' : 'Cancel'}
            </button>
            {!final ? (
              <button
                ref={confirmRef}
                onClick={() => void submit()}
                // aria-disabled, not disabled: the button keeps its focus
                // (and stays findable) while it cannot act.
                aria-disabled={!confirmed || deleting}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-chino-red hover:bg-chino-red/80 aria-disabled:opacity-50 aria-disabled:hover:bg-chino-red aria-disabled:cursor-not-allowed text-sm text-white font-medium"
              >
                {deleting ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" /> : null}
                Delete Account
              </button>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * The bearer to delete with: the current access token while it has a little
 * life left, else a silently renewed one — an expired token would only earn a
 * 401. A failed renewal sends the current token; the answer says the rest.
 */
async function freshAccessToken(auth: AuthContextProps): Promise<string | null> {
  const user = auth.user;
  if (user && (user.expires_in ?? Infinity) > 30) return user.access_token;
  try {
    const renewed = await auth.signinSilent();
    return renewed?.access_token ?? user?.access_token ?? null;
  } catch {
    return user?.access_token ?? null;
  }
}
