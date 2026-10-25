import { Loader2 } from 'lucide-react';
import { LOADING_NAME } from '../lib/playerStatus';

interface LoadingStateProps {
  /** What is happening, where the spinner alone doesn't say it ("Signing
   *  you in…"); none shows the spinner alone. */
  message?: string;
  /** Compact = inline single line; full = centred block (for first-paint). */
  variant?: 'inline' | 'full';
}

/**
 * The spinner while something loads (the design system's loading pattern):
 * with a line only where it says what is happening in plain words, else
 * nothing beside it - a screen reader hears "Loading". No rotating lines.
 */
export function LoadingState({ message, variant = 'inline' }: LoadingStateProps) {
  const line = message ? <span>{message}</span> : <span className="sr-only">{LOADING_NAME}</span>;
  if (variant === 'full') {
    return (
      <div role="status" className="min-h-[40vh] flex flex-col items-center justify-center gap-3 text-sm text-chino-muted">
        <Loader2 aria-hidden className="w-8 h-8 animate-spin text-chino-accent" />
        {line}
      </div>
    );
  }
  return (
    <div role="status" className="flex items-center gap-2 text-sm text-chino-muted">
      <Loader2 aria-hidden className="w-4 h-4 animate-spin text-chino-accent" />
      {line}
    </div>
  );
}
