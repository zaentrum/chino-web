// What an addon's slot row may make chino do. The rows come from the portal's
// registry (through chino-api's /api/v1/extensions), so chino treats them as
// data from elsewhere: a row is rendered only when what it points at is safe
// to put behind a native chino button. Pure: extensions.test.ts runs it under
// node --test.

/** A slot row as chino-api serves it (portal-api's model.Extension). Typed
 *  loosely on purpose: every field is checked before it is used. */
export interface SlotRow {
  key?: unknown;
  kind?: unknown;
  label?: unknown;
  icon?: unknown;
  url?: unknown;
  method?: unknown;
  enabled?: unknown;
}

export type SlotKind = 'link' | 'action';

/** The icons a row may name: the portal's palette (zaentrum-portal
 *  src/lib/icons.tsx), so a row shows the same glyph on the launchpad and in
 *  chino. A fixed list, not a lookup into lucide's exports: those include
 *  components that are not icons at all ("icon" crashed the app), and
 *  reaching any of them by name puts all ~1,500 in the bundle. */
export const SLOT_ICON_NAMES = [
  'library',
  'radar',
  'download',
  'tv',
  'music',
  'clapperboard',
  'settings',
  'layout-grid',
  'server',
  'boxes',
  'globe',
  'wrench',
  'file-text',
  'image',
  'list-video',
  'users',
  'gauge',
  'database',
  'puzzle',
] as const;

export type SlotIconName = (typeof SLOT_ICON_NAMES)[number];

/** A row that passed: what the slot renders, with the address resolved. */
export interface SlotButton {
  key: string;
  kind: SlotKind;
  label: string;
  icon: SlotIconName;
  /** A link's href, or the URL an action POSTs to. */
  href: string;
}

/** The portal's app proxy: /api/portal/apps/<key>/… reaches an addon's own
 *  backend, forwarding the viewer's bearer for the addon to authorise. */
export const PORTAL_APP_PROXY = '/api/portal/apps/';

/** {var} tokens in a slot URL, replaced by the encoded value (unknown: ''). */
export function substitute(url: string, vars: Record<string, string>): string {
  return url.replace(/\{(\w+)\}/g, (_, k: string) =>
    Object.prototype.hasOwnProperty.call(vars, k) ? encodeURIComponent(vars[k]) : '',
  );
}

/** A row's icon as a palette name: kebab or lower case as the portal stores
 *  it ("list-video"), or as lucide spells the export ("ListVideo"). Any
 *  other name is the puzzle, the portal's icon for an installed addon. */
export function slotIconName(raw: unknown): SlotIconName {
  if (typeof raw !== 'string') return 'puzzle';
  const name = raw
    .trim()
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .replace(/[\s_]+/g, '-')
    .toLowerCase();
  return (SLOT_ICON_NAMES as readonly string[]).includes(name) ? (name as SlotIconName) : 'puzzle';
}

/** The two kinds chino renders; anything else (an unknown or empty kind) is
 *  not something it knows how to show, so it shows nothing. */
export function slotKind(raw: unknown): SlotKind | null {
  if (typeof raw !== 'string') return null;
  const k = raw.trim().toLowerCase();
  return k === 'link' || k === 'action' ? k : null;
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

/**
 * The URL a slot `action` row may POST to, or null. An action sends the
 * viewer's bearer, so it goes only to the portal's app proxy on this
 * instance's own origin (/api/portal/apps/<key>/…) and only as a POST (no
 * method means POST): the token never leaves the origin, and a row cannot
 * spend it on chino-api's or the portal's own endpoints.
 */
export function slotActionUrl(
  raw: unknown,
  method: unknown,
  pageUrl: string,
  vars: Record<string, string> = {},
): string | null {
  if (method !== undefined && method !== null && method !== '') {
    if (typeof method !== 'string' || method.trim().toUpperCase() !== 'POST') return null;
  }
  const u = resolve(raw, pageUrl, vars);
  if (!u) return null;
  // An encoded separator may become a real one behind a proxy.
  if (/%2f|%5c/i.test(u.pathname)) return null;
  // The path is already normalised: "..", "%2e%2e" are resolved away.
  if (!new RegExp(`^${PORTAL_APP_PROXY}[^/]+(/|$)`).test(u.pathname)) return null;
  return u.href;
}

/** The rows of a slot that chino can render, in the order given. */
export function slotButtons(rows: unknown, pageUrl: string, vars: Record<string, string> = {}): SlotButton[] {
  if (!Array.isArray(rows)) return [];
  const out: SlotButton[] = [];
  rows.forEach((row: SlotRow, i) => {
    if (!row || typeof row !== 'object' || !row.enabled) return;
    const label = typeof row.label === 'string' ? row.label.trim() : '';
    if (!label) return;
    const kind = slotKind(row.kind);
    if (!kind) return;
    const href =
      kind === 'link' ? slotLinkHref(row.url, pageUrl, vars) : slotActionUrl(row.url, row.method, pageUrl, vars);
    if (!href) return;
    out.push({
      key: typeof row.key === 'string' && row.key ? row.key : `row-${i}`,
      kind,
      label,
      icon: slotIconName(row.icon),
      href,
    });
  });
  return out;
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
