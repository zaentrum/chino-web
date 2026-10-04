// What the detail page's certification badge says: a title's age rating as
// katalog-api sends it, in the words of the board that gave it. Pure:
// ratings.test.ts runs it under node --test.

export interface Rated {
  /** The age a viewer must be to be served the title; absent when nothing rates it. */
  min_age?: number;
  /** The certification the age comes from, as TMDB gives it in its country ("12", "PG-13"). */
  certification?: string;
  /** The certification's country, ISO 3166-1 alpha-2 ("DE"). */
  certification_country?: string;
}

/** The badge of a title's rating, or undefined when nothing rates it.
 *  `text` is what the badge reads: a German certification as the FSK writes
 *  it ("FSK 12"), any other with a word in it as its board does ("PG-13",
 *  "TV-MA", "12A"), a bare age with its country ("CH 12"); an admin's
 *  rating, which carries no certification, as the age ("16+"). `title` is
 *  the badge's tooltip. */
export function ratingBadge(item: Rated): { text: string; title: string } | undefined {
  const cert = (item.certification ?? '').trim();
  const country = (item.certification_country ?? '').trim().toUpperCase();
  if (cert && country) {
    const text = country === 'DE' ? `FSK ${cert}` : /^\d+\+?$/.test(cert) ? `${country} ${cert}` : cert;
    const age = typeof item.min_age === 'number' ? `, for ${item.min_age} and up` : '';
    return { text, title: `Rated ${cert} in ${country}${age}` };
  }
  if (typeof item.min_age === 'number' && Number.isFinite(item.min_age) && item.min_age >= 0) {
    return { text: `${item.min_age}+`, title: `Rated for ${item.min_age} and up` };
  }
  return undefined;
}
