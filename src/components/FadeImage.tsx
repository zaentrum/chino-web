import { useEffect, useState, type ImgHTMLAttributes } from 'react';
import { ArtworkPlaceholder } from './ArtworkPlaceholder';

interface FadeImageProps extends ImgHTMLAttributes<HTMLImageElement> {
  /**
   * When set, a missing/empty `src` or an image that fails to load
   * renders an <ArtworkPlaceholder> filling the identical slot (same
   * `className`, so no layout shift) instead of a broken-image glyph.
   * The value drives the placeholder initials; pass '' for the `>c`
   * brand mark. Leave undefined to opt out (legacy behaviour: alt text
   * / parent fallback shows through).
   */
  fallbackTitle?: string;
}

/**
 * <img> that stays invisible until the browser has decoded the full
 * image, then fades in over 500ms. On slow connections this replaces
 * the partial top-to-bottom paint of a JPEG/AVIF with a clean
 * placeholder→image transition — the wait feels like an intentional
 * UX touch instead of a network hiccup.
 *
 * Behaviour notes:
 *  - When `fallbackTitle` is set, a genuinely un-loadable image (empty
 *    src or terminal 404) is replaced by an <ArtworkPlaceholder>. The
 *    caller's own onError still runs FIRST — call sites that retry by
 *    swapping `src` (EpisodesList backdrop→poster, ZapCard) get a fresh
 *    load attempt, and a later successful onLoad clears the error, so
 *    the placeholder only ever shows for images that truly can't load.
 *  - Cached images load synchronously enough that onLoad fires before
 *    the first paint; the fade is then sub-perceivable.
 */
export function FadeImage({ className = '', onLoad, onError, fallbackTitle, src, ...rest }: FadeImageProps) {
  const [loaded, setLoaded] = useState(false);
  const [errored, setErrored] = useState(false);

  // A src change (including a call-site onError retry that swaps it)
  // re-arms the element for a fresh load attempt.
  useEffect(() => {
    setErrored(false);
    setLoaded(false);
  }, [src]);

  const showPlaceholder = fallbackTitle !== undefined && (errored || !src);
  if (showPlaceholder) {
    return <ArtworkPlaceholder title={fallbackTitle} className={className} />;
  }

  return (
    <img
      {...rest}
      src={src}
      onLoad={(e) => { setLoaded(true); setErrored(false); onLoad?.(e); }}
      onError={(e) => {
        setLoaded(true);
        // Resolved URL of the image that just failed.
        const failedSrc = e.currentTarget.src;
        // Let the caller's retry run first — it may swap e.currentTarget.src
        // (EpisodesList backdrop→poster), which fires a fresh load.
        onError?.(e);
        // Only fall back to the placeholder when the handler did NOT swap
        // to a different URL — otherwise the new load is in flight and a
        // premature placeholder would flash over it.
        if (e.currentTarget.src === failedSrc) setErrored(true);
      }}
      className={`${className} transition-opacity duration-500 ease-out ${loaded ? 'opacity-100' : 'opacity-0'}`}
    />
  );
}
