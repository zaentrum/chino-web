interface ArtworkPlaceholderProps {
  /** Title the placeholder derives its initials from. Empty / missing
   *  falls back to the `>c` brand mark. */
  title?: string;
  /** Extra Tailwind classes — pass the same sizing/aspect classes the
   *  <img> used so the placeholder fills the identical slot with no
   *  layout shift (e.g. "w-full h-full", "aspect-[2/3]"). */
  className?: string;
}

/**
 * Graceful stand-in for a poster / backdrop / thumbnail whose artwork
 * is missing or 404s (common for un-enriched catalogue items). Fills
 * the same slot at the same aspect ratio with an intentional DS-styled
 * block instead of a broken-image glyph.
 *
 * Look: surface-2 over surface, 1px hairline border, SQUARE corners,
 * centred JetBrains Mono initials in fg-dim — or the `>c` brand mark
 * when there's no usable title.
 */
export function ArtworkPlaceholder({ title = '', className = '' }: ArtworkPlaceholderProps) {
  // First letter of the first two words, uppercased — mirrors the
  // PersonAvatar / Avatar initials idiom.
  const initials = title
    .split(/[\s._-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('');

  return (
    <div
      className={`bg-chino-surface-2 border border-chino-border flex items-center justify-center select-none overflow-hidden ${className}`}
      aria-hidden="true"
    >
      {initials ? (
        <span className="font-mono text-chino-dim text-2xl md:text-3xl tracking-wide">
          {initials}
        </span>
      ) : (
        // Brand mark fallback for generic / untitled artwork.
        <span className="font-mono text-chino-dim text-2xl md:text-3xl">&gt;c</span>
      )}
    </div>
  );
}
