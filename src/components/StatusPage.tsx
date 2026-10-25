import type { ReactNode } from 'react';
import { ArrowLeft, Loader2, RotateCw } from 'lucide-react';
import { toApp } from '../lib/basepath';
import {
  NO_ACCESS,
  TRY_AGAIN,
  canTryAgain,
  couldntLoad,
  failureCase,
  failureReason,
  failureStatus,
  removedTitle,
} from '../lib/loadFailure';
import { FailureDetails, shownCase, useSignInAgain } from './CouldntLoad';

interface StatusPageProps {
  /** What is true, as the page's heading, lowercase in the mono face:
   *  "this title isn't in the library anymore". */
  title: string;
  /** Why, where there is a reason to give: "Can't reach the server." */
  message?: string;
  /** Offered when trying again can help — a request that failed, not a
   *  thing that is not there. */
  onRetry?: () => void;
  /** The same thing elsewhere, offered first and opened in a new tab: a
   *  title's trailer online, where the one on this server cannot play. */
  link?: { href: string; label: string; icon?: ReactNode };
  /** The status the request was answered with, under details. */
  status?: number | null;
}

/**
 * A page that cannot show what was asked for — because it is not there,
 * or because it could not be loaded — says which, and offers the one way
 * forward, emphasized: the same thing elsewhere, or "try again" where it
 * can help, else "back" (home when the viewer came from nowhere); with
 * "back" beside it, quiet, where that is not already the way.
 */
export function StatusPage({ title, message, onRetry, link, status }: StatusPageProps) {
  const back = () => {
    if (window.history.length > 1) window.history.back();
    else window.location.assign(toApp('/'));
  };
  const btn = 'inline-flex items-center gap-2 h-12 px-5 font-mono font-medium transition-colors';
  const primary = `${btn} bg-chino-accent hover:brightness-110 text-chino-bg`;
  const quiet = `${btn} bg-chino-surface-2 hover:bg-chino-border-2 text-chino-text`;
  return (
    <main className="min-h-screen bg-chino-bg text-white flex items-center justify-center p-6">
      <div className="max-w-md w-full text-center">
        <h1 className="font-mono text-2xl md:text-3xl font-semibold mb-3">{title}</h1>
        {message ? <p className="text-chino-muted leading-relaxed">{message}</p> : null}
        <div className="mt-8 flex flex-wrap justify-center gap-2">
          {link ? (
            <a href={link.href} target="_blank" rel="noopener noreferrer" className={primary}>
              {link.icon}
              {link.label}
            </a>
          ) : onRetry ? (
            <button type="button" onClick={onRetry} className={primary}>
              <RotateCw className="w-4 h-4" aria-hidden />
              {TRY_AGAIN}
            </button>
          ) : null}
          <button type="button" onClick={back} className={link || onRetry ? quiet : primary}>
            <ArrowLeft className="w-4 h-4" aria-hidden />
            back
          </button>
        </div>
        {status !== undefined ? (
          <div className="mt-6">
            <FailureDetails status={status} />
          </div>
        ) : null}
      </div>
    </main>
  );
}

/**
 * A page of one thing - a title, a person, a trailer - that couldn't load,
 * by the case its error is (lib/loadFailure.ts): removed, "this title isn't
 * in the library anymore", with back; no access; signed out, which signs in
 * again; else "couldn't load this title", the reason, and "try again".
 */
export function CouldntLoadPage({
  what,
  thing,
  error,
  onRetry,
}: {
  /** The screen's own words: "this title". */
  what: string;
  /** What a removed one is: "title", "person". */
  thing: 'title' | 'person';
  error: unknown;
  onRetry: () => void;
}) {
  const status = failureStatus(error);
  const signIn = useSignInAgain(failureCase(status, 'one') === 'signed-out', onRetry);
  const kind = shownCase(failureCase(status, 'one'), signIn);
  if (!kind) {
    return (
      <div className="min-h-screen bg-chino-bg text-chino-muted flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin" aria-label="Loading" />
      </div>
    );
  }
  if (kind === 'removed') return <StatusPage title={removedTitle(thing)} />;
  if (kind === 'no-access') return <StatusPage title={NO_ACCESS} />;
  return (
    <StatusPage
      title={couldntLoad(what)}
      message={failureReason(kind)}
      onRetry={canTryAgain(kind) ? onRetry : undefined}
      status={status}
    />
  );
}
