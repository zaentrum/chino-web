// Notices: what an addon tells the signed-in person — "your title is ready" —
// as chino-api lists them (GET /api/v1/notices, read from portal-api with the
// person's bearer) and changes them (POST …/{noticeId}/read, POST …/read-all,
// DELETE …/{noticeId}). What a notice says is the addon's: plain text, shown
// as text and never as markup. Its link is followed only while it stays on
// this server, and its item opens on the item route, which holds a capped
// viewer to their cap. portal-api checks a notice when it is posted; chino
// checks it again before it acts on one. Pure: notices.test.ts runs it under
// node --test, against a fake fetch.

// ─── the documents (chino-api's Notice and NoticeList) ──────────────────────

export interface Notice {
  id: string;
  /** The key of the addon it is from. */
  addon: string;
  /** The addon's app, as the registry has it: whom the notice is from. */
  addonTitle: string;
  addonIcon: string;
  title: string;
  body: string;
  /** '' for none. */
  link: string;
  /** '' for none. */
  itemId: string;
  createdAt: string;
  /** null while unread. */
  readAt: string | null;
}

export interface NoticeList {
  /** Newest first, as chino-api lists them. */
  notices: Notice[];
  unread: number;
}

/** How often the list is asked for again while the tab is shown. */
export const NOTICE_POLL_MS = 60_000;

/** chino-api's notices routes; the app is served next to it. */
export const NOTICES_PATH = '/api/v1/notices';

/** A notice's id as chino-api takes it back (its NoticeID): letters, digits
 *  and dashes — portal-api's are UUIDs — so nothing else goes into a path. */
const NOTICE_ID = /^[A-Za-z0-9-]{1,64}$/;

/** A catalog item's id as portal-api takes it in a notice: letters, digits
 *  and . _ : -, at most 128, a letter or digit first. */
const NOTICE_ITEM = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;

const str = (v: unknown): string => (typeof v === 'string' ? v : '');

/** The list as it came, read defensively: what is no notice — no id
 *  chino-api would take back, no title — is left out, a field that is not
 *  text is empty, and the unread count is never below the unread notices
 *  listed. */
export function noticeListOf(raw: unknown): NoticeList {
  const doc = (raw && typeof raw === 'object' ? raw : {}) as { notices?: unknown; unread?: unknown };
  const notices: Notice[] = [];
  if (Array.isArray(doc.notices)) {
    for (const n of doc.notices as Record<string, unknown>[]) {
      if (!n || typeof n !== 'object' || !NOTICE_ID.test(str(n.id)) || !str(n.title)) continue;
      notices.push({
        id: str(n.id),
        addon: str(n.addon),
        addonTitle: str(n.addonTitle),
        addonIcon: str(n.addonIcon),
        title: str(n.title),
        body: str(n.body),
        link: str(n.link),
        itemId: str(n.itemId),
        createdAt: str(n.createdAt),
        readAt: typeof n.readAt === 'string' && n.readAt ? n.readAt : null,
      });
    }
  }
  const listed = notices.filter((n) => n.readAt === null).length;
  const unread = typeof doc.unread === 'number' && Number.isInteger(doc.unread) && doc.unread >= 0 ? doc.unread : listed;
  return { notices, unread: Math.max(unread, listed) };
}

// ─── asking chino-api ────────────────────────────────────────────────────────

/**
 * What GET /api/v1/notices came to:
 *
 *   list         the person's notices
 *   unavailable  none to show: chino-api says portal-api did not answer it
 *                (available false), or it has no notices at all (404) — the
 *                app shows nothing then, not an error
 *   failed       no answer from chino-api: the app keeps what it shows
 */
export type NoticesAnswer = { kind: 'list'; list: NoticeList } | { kind: 'unavailable' } | { kind: 'failed' };

/** What a 200 carried: a list only where chino-api says portal-api answered
 *  — its list is empty otherwise, and says nothing. */
export function noticesAnswer(body: unknown): NoticesAnswer {
  if (!body || typeof body !== 'object' || (body as { available?: unknown }).available !== true) {
    return { kind: 'unavailable' };
  }
  return { kind: 'list', list: noticeListOf(body) };
}

/** What a notices call sends; the browser's fetch takes it as it is. */
export interface NoticeCall {
  method: 'GET' | 'POST' | 'DELETE';
  headers: Record<string, string>;
  keepalive?: boolean;
}

type Fetch = (input: string, init: NoticeCall) => Promise<Response>;

const browserFetch: Fetch = (input, init) => fetch(input, init);

/** The bearer goes in the Authorization header, never in the URL: chino-api
 *  takes no stream token on these routes. */
const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });

/** Reads the person's notices. Never throws. */
export async function loadNotices(opts: {
  /** The person's access token. */
  token: string;
  /** For tests; the browser's fetch otherwise. */
  fetch?: Fetch;
}): Promise<NoticesAnswer> {
  const doFetch = opts.fetch ?? browserFetch;
  let res: Response;
  try {
    res = await doFetch(NOTICES_PATH, { method: 'GET', headers: bearer(opts.token) });
  } catch {
    return { kind: 'failed' };
  }
  // A chino-api older than notices has no such route.
  if (res.status === 404) return { kind: 'unavailable' };
  if (res.status !== 200) return { kind: 'failed' };
  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    // Not JSON — a page something else answered with: no list.
  }
  return noticesAnswer(body);
}

export type NoticeChange = { kind: 'read'; id: string } | { kind: 'read-all' } | { kind: 'delete'; id: string };

/** Where a change goes on chino-api; null for an id it would not take. The
 *  id rule leaves nothing in an id to encode. */
export function noticeChangeRoute(change: NoticeChange): { method: 'POST' | 'DELETE'; path: string } | null {
  if (change.kind === 'read-all') return { method: 'POST', path: `${NOTICES_PATH}/read-all` };
  if (!NOTICE_ID.test(change.id)) return null;
  return change.kind === 'read'
    ? { method: 'POST', path: `${NOTICES_PATH}/${change.id}/read` }
    : { method: 'DELETE', path: `${NOTICES_PATH}/${change.id}` };
}

/**
 * Sends a change; true once chino-api made it. Any other answer — 404 for a
 * notice the person no longer has, 502 or 503 when portal-api did not make
 * it — and a change that never reached the server are false: the app reads
 * the list again, as it is. keepalive, so a notice opened is read even as the
 * page goes on to where it leads. Never throws.
 */
export async function sendNoticeChange(opts: {
  token: string;
  change: NoticeChange;
  fetch?: Fetch;
}): Promise<boolean> {
  const route = noticeChangeRoute(opts.change);
  if (!route) return false;
  const doFetch = opts.fetch ?? browserFetch;
  try {
    const res = await doFetch(route.path, { method: route.method, headers: bearer(opts.token), keepalive: true });
    return res.ok;
  } catch {
    return false;
  }
}

// ─── reading ─────────────────────────────────────────────────────────────────

/** The unread count on the bell: nothing at none, 99+ past 99. */
export function badgeText(unread: number): string {
  if (!(unread > 0)) return '';
  return unread > 99 ? '99+' : String(Math.floor(unread));
}

/** What the bell is called to a screen reader. */
export function bellLabel(unread: number): string {
  return unread > 0 ? `Notices, ${unread} unread` : 'Notices';
}

/** Whom a notice is from: its addon's title, else its key. */
export function fromText(n: Pick<Notice, 'addon' | 'addonTitle'>): string {
  return n.addonTitle.trim() || n.addon || 'An addon';
}

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** When a notice came, short: now, 5m, 3h, 2d — and from a week on its day,
 *  in the browser's time zone: Sep 12. */
export function ageText(createdAt: string, now: number): string {
  const t = Date.parse(createdAt);
  if (Number.isNaN(t)) return '';
  const ago = now - t;
  if (ago < MINUTE) return 'now';
  if (ago < HOUR) return `${Math.floor(ago / MINUTE)}m`;
  if (ago < DAY) return `${Math.floor(ago / HOUR)}h`;
  if (ago < 7 * DAY) return `${Math.floor(ago / DAY)}d`;
  const d = new Date(t);
  return `${MONTHS[d.getMonth()]} ${d.getDate()}`;
}

// ─── where a notice leads ────────────────────────────────────────────────────

/**
 * Where a notice's link may lead: an http(s) page on the origin of the page
 * the app is on — given as a path or absolute — and nothing else: no
 * javascript: or data: URL, no other host, no "//host", no credentials. null
 * when it leads nowhere it may. The portal's bell holds a link to the same
 * rule.
 */
export function noticeHref(link: string, pageUrl: string): string | null {
  const raw = link.trim();
  // A path, or an absolute http(s) URL: nothing relative to the page, and no
  // protocol-relative "//host" (which a backslash spells too).
  if (!/^(\/(?![/\\])|https?:\/\/)/i.test(raw)) return null;
  let page: URL;
  let u: URL;
  try {
    page = new URL(pageUrl);
    u = new URL(raw, page);
  } catch {
    return null;
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
  if (u.origin !== page.origin || u.username || u.password) return null;
  return u.href;
}

/** The item route a notice's item opens — /i/<id> inside the app, for toApp
 *  to put the base in front of — or null when it names no item it may. */
export function noticeItemPath(itemId: string): string | null {
  const id = itemId.trim();
  return NOTICE_ITEM.test(id) ? `/i/${encodeURIComponent(id)}` : null;
}

export type NoticeTarget = { kind: 'item'; path: string } | { kind: 'link'; href: string };

/** Where opening a notice leads: its item first — a title is what chino opens
 *  itself — else its link while that stays on this server; null for neither,
 *  and opening it only reads it. */
export function noticeTarget(n: Pick<Notice, 'link' | 'itemId'>, pageUrl: string): NoticeTarget | null {
  const path = noticeItemPath(n.itemId);
  if (path) return { kind: 'item', path };
  const href = noticeHref(n.link, pageUrl);
  return href ? { kind: 'link', href } : null;
}

// ─── changing ────────────────────────────────────────────────────────────────

/** The list once a notice is read, before chino-api answers. */
export function markRead(list: NoticeList, id: string, at: string): NoticeList {
  let changed = 0;
  const notices = list.notices.map((n) => {
    if (n.id !== id || n.readAt !== null) return n;
    changed++;
    return { ...n, readAt: at };
  });
  return { notices, unread: Math.max(0, list.unread - changed) };
}

/** The list once every notice is read. */
export function markAllRead(list: NoticeList, at: string): NoticeList {
  return { notices: list.notices.map((n) => (n.readAt === null ? { ...n, readAt: at } : n)), unread: 0 };
}

/** The list without a notice. */
export function removeNotice(list: NoticeList, id: string): NoticeList {
  const gone = list.notices.find((n) => n.id === id);
  return {
    notices: list.notices.filter((n) => n.id !== id),
    unread: Math.max(0, list.unread - (gone && gone.readAt === null ? 1 : 0)),
  };
}
