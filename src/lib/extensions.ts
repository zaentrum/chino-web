// What an addon's slot row may make chino do. The rows come from the portal's
// registry (through chino-api's /api/v1/extensions), so chino treats them as
// data from elsewhere: a row is rendered only when what it points at is safe
// to put behind a native chino button. Pure: extensions.test.ts runs it under
// node --test.

/** {var} tokens in a slot URL, replaced by the encoded value (unknown: ''). */
export function substitute(url: string, vars: Record<string, string>): string {
  return url.replace(/\{(\w+)\}/g, (_, k: string) =>
    Object.prototype.hasOwnProperty.call(vars, k) ? encodeURIComponent(vars[k]) : '',
  );
}

/**
 * The address a slot `link` row may open, resolved against the page it is
 * on, or null when it may open nothing: only an http(s) page of this
 * instance's own origin, given relative ("/portal/app/x", "?q=") or
 * absolute. Anything else - a javascript: or data: URL, which would run in
 * chino's origin, another host, a protocol-relative "//host", a URL with
 * credentials - renders no button at all.
 */
export function slotLinkHref(raw: unknown, pageUrl: string, vars: Record<string, string> = {}): string | null {
  const u = resolve(raw, pageUrl, vars);
  return u ? u.href : null;
}

/** The URL a row names, resolved; null unless it stays on the page's origin
 *  over http(s), without credentials. */
function resolve(raw: unknown, pageUrl: string, vars: Record<string, string>): URL | null {
  if (typeof raw !== 'string' || !raw.trim()) return null;
  let page: URL;
  let u: URL;
  try {
    page = new URL(pageUrl);
    u = new URL(substitute(raw.trim(), vars), page);
  } catch {
    return null;
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
  if (u.origin !== page.origin) return null;
  if (u.username || u.password) return null;
  return u;
}
