// Artwork URLs an <img> can load. chino-api's artwork routes (posters,
// backdrops, a person's portrait) sit in its stream-token group: an <img>
// cannot send the bearer header, so the URL carries the long-lived stream
// token as ?stream=. Being the same for six hours, unlike the OIDC token, it
// keeps the URL - and the browser's cached image - stable across silent
// renewals. Pure: artwork.test.ts runs it under node --test.

/** `url` with the stream token as ?stream= (or &stream=); the URL unchanged
 *  while there is no token yet, nothing when there is no URL. */
export function withStreamToken(url: string | undefined, token: string | null | undefined): string | undefined {
  if (!url) return undefined;
  if (!token) return url;
  return `${url}${url.includes('?') ? '&' : '?'}stream=${encodeURIComponent(token)}`;
}
