import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from 'react-oidc-context';
import {
  NOTICE_POLL_MS,
  loadNotices,
  markAllRead,
  markRead,
  removeNotice,
  sendNoticeChange,
  type Notice,
  type NoticeChange,
  type NoticeList,
} from '../lib/notices';

export interface Notices {
  /** The person's notices, newest first; null while there are none to show:
   *  before chino-api first answered, where it says there are none here, and
   *  signed out. */
  list: NoticeList | null;
  /** When the list was last read: what the notices' ages count from. */
  now: number;
  read: (n: Notice) => void;
  readAll: () => void;
  remove: (n: Notice) => void;
  /** Asks for the list again now. */
  refresh: () => void;
}

/**
 * useNotices reads what addons told the signed-in person, from chino-api's
 * /api/v1/notices (lib/notices.ts): now, every minute while the tab is shown
 * and whenever it is shown again, and not at all once they are signed out.
 * Best effort, as the slots are (useExtensions): with no notices here — no
 * portal-api behind chino-api, or one that does not answer — there is no
 * list, and a read that fails keeps the last one. Each change shows at once
 * and is sent; when chino-api does not make it, the list is read again, as
 * it is.
 */
export function useNotices(): Notices {
  const auth = useAuth();
  const signedIn = !auth.isLoading && auth.isAuthenticated;
  const [list, setList] = useState<NoticeList | null>(null);
  const [now, setNow] = useState(() => Date.now());

  // The bearer of the moment: a silent renew replaces it without starting
  // the polling over.
  const tokenRef = useRef('');
  useEffect(() => {
    tokenRef.current = auth.user?.access_token ?? '';
  }, [auth.user?.access_token]);

  // Moves on with every change, and when the person signs out: a list read
  // before then is out of date by the time it comes back.
  const epochRef = useRef(0);

  const load = useCallback(async () => {
    const token = tokenRef.current;
    if (!token) return;
    const epoch = epochRef.current;
    const answer = await loadNotices({ token });
    if (epoch !== epochRef.current) return;
    if (answer.kind === 'list') setList(answer.list);
    else if (answer.kind === 'unavailable') setList(null);
    setNow(Date.now());
  }, []);

  // Now, every minute while the tab is shown, and when it is shown again.
  useEffect(() => {
    if (!signedIn) return;
    void load();
    const shown = () => document.visibilityState === 'visible';
    const timer = window.setInterval(() => {
      if (shown()) void load();
    }, NOTICE_POLL_MS);
    const onShow = () => {
      if (shown()) void load();
    };
    document.addEventListener('visibilitychange', onShow);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onShow);
      epochRef.current++;
      setList(null);
    };
  }, [signedIn, load]);

  const send = useCallback(
    (change: NoticeChange) => {
      epochRef.current++;
      const token = tokenRef.current;
      if (!token) return;
      void sendNoticeChange({ token, change }).then((made) => {
        if (!made) void load();
      });
    },
    [load],
  );

  const read = useCallback(
    (n: Notice) => {
      if (n.readAt !== null) return;
      setList((l) => (l ? markRead(l, n.id, new Date().toISOString()) : l));
      send({ kind: 'read', id: n.id });
    },
    [send],
  );

  const readAll = useCallback(() => {
    setList((l) => (l ? markAllRead(l, new Date().toISOString()) : l));
    send({ kind: 'read-all' });
  }, [send]);

  const remove = useCallback(
    (n: Notice) => {
      setList((l) => (l ? removeNotice(l, n.id) : l));
      send({ kind: 'delete', id: n.id });
    },
    [send],
  );

  const refresh = useCallback(() => void load(), [load]);

  return { list, now, read, readAll, remove, refresh };
}
