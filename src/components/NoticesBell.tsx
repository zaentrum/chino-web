import { Component, useEffect, useRef, useState, type ReactNode } from 'react';
import { Bell, CheckCheck, X } from 'lucide-react';
import { useNotices } from '../hooks/useNotices';
import { toApp } from '../lib/basepath';
import { ageText, badgeText, bellLabel, fromText, noticeTarget, type Notice } from '../lib/notices';

/**
 * The bell in the header: what addons told the signed-in person
 * (useNotices) — how many are unread, and the list, newest first, each with
 * whom it is from, when, its title and its body. A notice is its addon's
 * plain text and is shown as text, its line breaks kept. Opening one reads
 * it and goes where it leads (lib/notices.ts): its title, on the item route,
 * which holds a capped viewer to their cap; else its link, while that stays
 * on this server. Mark All Read, and a delete on each.
 *
 * Where chino-api has no notices to show — no portal-api behind it, or one
 * that does not answer — there is no bell at all, not an error. The bell is
 * its own error boundary too: whatever a notice holds, the worst it can do
 * is not show up. It never takes the header, or the home under it, down.
 */
export function NoticesBell() {
  return (
    <NoticesBoundary>
      <BellAndList />
    </NoticesBoundary>
  );
}

function BellAndList() {
  const { list, now, read, readAll, remove, refresh } = useNotices();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const bellRef = useRef<HTMLButtonElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);

  // No list to show: nothing left open for when there is one again.
  useEffect(() => {
    if (!list) setOpen(false);
  }, [list]);

  // The list closes on a click outside it, and on Escape, back to the bell.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      setOpen(false);
      bellRef.current?.focus();
    };
    window.addEventListener('mousedown', onDown);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('mousedown', onDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  if (!list) return null;
  const unread = list.unread;

  const toggle = () => {
    if (!open) refresh();
    setOpen(!open);
  };

  // Opening a notice reads it, and goes where it leads with a page load, as
  // chino opens a title anywhere else. The read is sent first, and outlives
  // the page.
  const follow = (n: Notice) => {
    read(n);
    const target = noticeTarget(n, window.location.href);
    if (!target) return;
    setOpen(false);
    window.location.assign(target.kind === 'item' ? toApp(target.path) : target.href);
  };

  // A button that goes away with what it did leaves the focus in the list.
  const markAllRead = () => {
    readAll();
    panelRef.current?.focus();
  };
  const del = (n: Notice) => {
    remove(n);
    panelRef.current?.focus();
  };

  return (
    <div ref={rootRef} className="relative">
      <button
        ref={bellRef}
        type="button"
        onClick={toggle}
        className="relative p-2 text-chino-text hover:bg-chino-surface rounded-lg transition-colors"
        title="Notices"
        aria-label={bellLabel(unread)}
        aria-haspopup="dialog"
        aria-expanded={open}
      >
        <Bell className="w-5 h-5" aria-hidden="true" />
        {unread > 0 ? (
          <span
            aria-hidden="true"
            className="absolute top-0.5 right-0.5 min-w-4 h-4 px-1 bg-chino-accent text-chino-bg font-mono text-[10px] font-bold leading-4 text-center"
          >
            {badgeText(unread)}
          </span>
        ) : null}
      </button>

      {open ? (
        // Under the bell; across the screen on a phone, under the header.
        <div
          ref={panelRef}
          role="dialog"
          aria-label="Notices"
          tabIndex={-1}
          className="fixed left-3 right-3 top-[var(--chino-header)] sm:absolute sm:left-auto sm:right-0 sm:top-full sm:mt-1 sm:w-[360px] max-h-[70vh] flex flex-col bg-chino-surface border border-chino-border shadow-2xl z-50 focus:outline-none"
        >
          <div className="flex items-center justify-between gap-2 pl-3 pr-1.5 py-1.5 border-b border-chino-border">
            <h2 className="text-sm font-medium text-white py-1">Notices</h2>
            {unread > 0 ? (
              <button
                type="button"
                onClick={markAllRead}
                className="inline-flex items-center gap-1.5 px-2 py-1 text-xs text-chino-text hover:text-white hover:bg-chino-surface-2"
              >
                <CheckCheck className="w-4 h-4" aria-hidden="true" />
                Mark All Read
              </button>
            ) : null}
          </div>
          {list.notices.length === 0 ? (
            <p className="px-3 py-4 text-sm text-chino-muted">No notices yet.</p>
          ) : (
            <ul className="overflow-y-auto">
              {list.notices.map((n) => (
                <NoticeRow key={n.id} notice={n} now={now} onOpen={() => follow(n)} onDelete={() => del(n)} />
              ))}
            </ul>
          )}
        </div>
      ) : null}
    </div>
  );
}

function NoticeRow({
  notice: n,
  now,
  onOpen,
  onDelete,
}: {
  notice: Notice;
  now: number;
  onOpen: () => void;
  onDelete: () => void;
}) {
  const unread = n.readAt === null;
  const target = noticeTarget(n, window.location.href);
  return (
    <li
      className={`flex items-start border-b border-chino-border last:border-b-0 border-l-2 ${
        unread ? 'border-l-chino-accent' : 'border-l-transparent'
      }`}
    >
      <button
        type="button"
        onClick={onOpen}
        className="flex-1 min-w-0 text-left pl-2.5 pr-1 py-2.5 hover:bg-chino-surface-2 focus:outline-none focus-visible:bg-chino-surface-2"
      >
        <span className="flex items-baseline justify-between gap-2 text-xs text-chino-dim">
          <span className="truncate">{fromText(n)}</span>
          <span className="shrink-0">{ageText(n.createdAt, now)}</span>
        </span>
        {/* Text, never markup: React puts what the addon wrote in as it is. */}
        <span className={`block mt-0.5 text-sm break-words ${unread ? 'font-semibold text-white' : 'text-chino-text'}`}>
          {unread ? <span className="sr-only">Unread: </span> : null}
          {n.title}
        </span>
        {n.body ? (
          <span className="block mt-0.5 text-sm text-chino-muted whitespace-pre-line break-words">{n.body}</span>
        ) : null}
        {target ? (
          <span className="block mt-1 text-xs font-medium text-chino-accent">
            {target.kind === 'item' ? 'Open Title' : 'Open'}
          </span>
        ) : null}
      </button>
      <button
        type="button"
        onClick={onDelete}
        className="shrink-0 m-1 p-1.5 text-chino-muted hover:text-white hover:bg-chino-surface-2"
        title="Delete"
        aria-label={`Delete notice: ${n.title}`}
      >
        <X className="w-4 h-4" aria-hidden="true" />
      </button>
    </li>
  );
}

/** Renders nothing in place of a bell that failed to render. Not reported:
 *  what the list shows comes from addons, not from chino. */
class NoticesBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: Error) {
    // eslint-disable-next-line no-console
    console.warn('[notices] not rendered:', error);
  }

  render() {
    return this.state.failed ? null : this.props.children;
  }
}
