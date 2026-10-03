import { ArrowLeft, House, RotateCw } from 'lucide-react';
import { toApp } from '../lib/basepath';

interface StatusPageProps {
  /** What happened, as the page's heading: "Title not found". */
  title: string;
  message: string;
  /** Offered when trying again can help — a request that failed, not a
   *  thing that is not there. */
  onRetry?: () => void;
}

/**
 * A page that cannot show what was asked for — because it is not there,
 * or because it could not be loaded — says which, and offers a way back:
 * Back where the viewer came from (home when they came from nowhere),
 * Home, and Try again where it can help.
 */
export function StatusPage({ title, message, onRetry }: StatusPageProps) {
  const back = () => {
    if (window.history.length > 1) window.history.back();
    else window.location.assign(toApp('/'));
  };
  const btn = 'inline-flex items-center gap-2 px-5 py-2.5 font-medium transition-colors';
  return (
    <main className="min-h-screen bg-chino-bg text-white flex items-center justify-center p-6">
      <div className="max-w-md w-full text-center">
        <h1 className="text-2xl md:text-3xl font-semibold mb-3">{title}</h1>
        <p className="text-chino-muted leading-relaxed mb-8">{message}</p>
        <div className="flex flex-wrap justify-center gap-3">
          {onRetry ? (
            <button type="button" onClick={onRetry} className={`${btn} bg-chino-accent hover:bg-chino-accent/80 text-white`}>
              <RotateCw className="w-4 h-4" aria-hidden />
              Try again
            </button>
          ) : null}
          <button type="button" onClick={back} className={`${btn} bg-white/10 hover:bg-white/20 text-white`}>
            <ArrowLeft className="w-4 h-4" aria-hidden />
            Back
          </button>
          <a href={toApp('/')} className={`${btn} bg-white/10 hover:bg-white/20 text-white`}>
            <House className="w-4 h-4" aria-hidden />
            Home
          </a>
        </div>
      </div>
    </main>
  );
}
