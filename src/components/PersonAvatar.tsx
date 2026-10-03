import { useState } from 'react';
import { FadeImage } from './FadeImage';

interface PersonAvatarProps {
  /** Person's name — drives the initials and the a11y label. */
  name: string;
  /**
   * The person's portrait: a profile_url with the stream token on it. The
   * initials show while it loads and stay when it fails — chino-api answers
   * 404 for a person without a portrait.
   */
  src?: string;
  /** Width in pixels. Defaults to 48. */
  size?: number;
  /** A 2:3 portrait frame (the person page) instead of a square. */
  portrait?: boolean;
  /** Extra Tailwind classes for the outer element. */
  className?: string;
}

/**
 * A catalogue person's picture: their portrait when the catalog has one,
 * otherwise a token-coloured box with their initials — the same visual
 * language as the account Avatar's initials fallback, but driven by an
 * arbitrary name string rather than OIDC claims. Shared by the search
 * "Cast & crew" section and the Person surface header.
 *
 * The portrait is an <img alt={name}> laid over the initials, so they show
 * through while it loads (FadeImage fades it in) and take over if it fails.
 * Without a portrait the box itself is the image (role="img", the name as its
 * label); with one, the <img> is, and the initials are hidden from assistive
 * tech so the name is not announced twice.
 */
export function PersonAvatar({ name, src, size = 48, portrait = false, className = '' }: PersonAvatarProps) {
  // Which src failed, rather than a flag: a new src (the stream token
  // arriving, another person) gets a fresh attempt without an effect.
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const showPhoto = !!src && src !== failedSrc;

  // First letter of the first two words, uppercased. Falls back to '?'
  // so the box is never empty.
  const initials = name
    .split(/[\s._-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('') || '?';

  const dim = { width: `${size}px`, height: `${portrait ? Math.round(size * 1.5) : size}px` };
  const fontSize = `${Math.max(11, Math.round(size * 0.4))}px`;

  return (
    <div
      style={{ ...dim, fontSize }}
      className={`relative overflow-hidden bg-chino-surface-2 text-chino-accent font-semibold flex items-center justify-center select-none shrink-0 ${className}`}
      role={showPhoto ? undefined : 'img'}
      aria-label={showPhoto ? undefined : name}
      title={name}
    >
      <span aria-hidden={showPhoto ? true : undefined}>{initials}</span>
      {showPhoto ? (
        <FadeImage
          src={src}
          alt={name}
          // Faces sit in the upper part of a portrait: keep them in a square crop.
          className="absolute inset-0 w-full h-full object-cover object-[50%_20%]"
          decoding="async"
          onError={() => setFailedSrc(src ?? null)}
        />
      ) : null}
    </div>
  );
}
