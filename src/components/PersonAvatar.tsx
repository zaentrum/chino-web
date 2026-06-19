interface PersonAvatarProps {
  /** Person's name — drives the initials and the a11y label. */
  name: string;
  /** Pixel size. Defaults to 48. */
  size?: number;
  /** Extra Tailwind classes for the outer element. */
  className?: string;
}

/**
 * Initials-avatar placeholder for a catalogue person. No person photos
 * exist in katalog yet, so every person renders as a token-coloured
 * circle with their initials — same visual language as the account
 * Avatar's initials fallback, but driven by an arbitrary name string
 * rather than OIDC claims. Shared by the search "Cast & crew" section
 * and the Person surface header.
 */
export function PersonAvatar({ name, size = 48, className = '' }: PersonAvatarProps) {
  // First letter of the first two words, uppercased. Falls back to '?'
  // so the circle is never empty.
  const initials = name
    .split(/[\s._-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('') || '?';

  const dim = { width: `${size}px`, height: `${size}px` };
  const fontSize = `${Math.max(11, Math.round(size * 0.4))}px`;

  return (
    <div
      style={{ ...dim, fontSize }}
      className={`rounded-full bg-[#21262d] text-[#58A6FF] font-semibold flex items-center justify-center select-none shrink-0 ${className}`}
      aria-label={name}
      title={name}
    >
      {initials}
    </div>
  );
}
