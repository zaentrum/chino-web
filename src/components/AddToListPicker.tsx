import { useEffect, useRef, useState } from 'react';
import { useAuth } from 'react-oidc-context';
import { Check, Loader2, Plus, X } from 'lucide-react';
import { useWatchlists, useMemberships, toggleMembership } from '../hooks/useWatchlists';

interface AddToListPickerProps {
  itemId: string;
  /** Called to close the popover (outside click / Escape / done). */
  onClose: () => void;
  /**
   * Anchor alignment. Cards open the picker upward/left to stay inside
   * the rail; the detail page opens it below the button. Defaults to
   * 'down'.
   */
  align?: 'down' | 'up';
  /**
   * Horizontal anchor edge. 'right' (default) pins the popover's right
   * edge to the container's right edge — correct when the trigger sits
   * near the viewport's right half. 'left' pins the LEFT edges instead
   * so the 256px popover opens rightward: the episode rows use this
   * because their anchor is the 160px thumbnail and a right-anchored
   * popover would extend 96px past the thumbnail's left edge (clipped
   * off-viewport on narrow windows).
   */
  alignX?: 'left' | 'right';
  /**
   * Element whose mousedowns the outside-click closer must IGNORE —
   * pass the trigger button here. Without it, pressing the open
   * trigger again closes the picker on mousedown (outside-click) and
   * instantly reopens it on the trigger's own click toggle.
   */
  ignoreRef?: React.RefObject<HTMLElement | null>;
}

/**
 * Small popover listing the user's watchlists with a checkbox each
 * (checked = item is in that list). Toggling a row optimistically flips
 * the membership and calls PUT/DELETE items. An inline "+ New list…" row
 * creates a list then adds the item to it.
 *
 * Shared by the DetailPage add-to-list control and the MediaCard hover
 * overlay. The caller owns open/close state and positions this absolutely
 * relative to the trigger button.
 */
export function AddToListPicker({ itemId, onClose, align = 'down', alignX = 'right', ignoreRef }: AddToListPickerProps) {
  const auth = useAuth();
  const token = auth.user?.access_token;
  const { lists, loading, create } = useWatchlists();
  const { map } = useMemberships([itemId]);
  const memberOf = new Set(map[itemId] ?? []);

  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  // Close on outside click / Escape — same idiom as MediaCard's menu.
  // Mousedowns inside the caller's trigger (ignoreRef) are skipped so
  // the trigger's own click handler can TOGGLE the picker closed
  // instead of close-on-mousedown + reopen-on-click.
  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (ignoreRef?.current && ignoreRef.current.contains(e.target as Node)) return;
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [onClose, ignoreRef]);

  useEffect(() => {
    if (creating) inputRef.current?.focus();
  }, [creating]);

  const onToggle = (listId: string, present: boolean) => {
    if (!token) return;
    void toggleMembership(token, listId, itemId, present);
  };

  const submitNew = async () => {
    if (!token) return;
    const name = newName.trim();
    if (!name) {
      setErr('Enter a name');
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      const created = await create(name);
      await toggleMembership(token, created.id, itemId, true);
      setNewName('');
      setCreating(false);
    } catch (e) {
      setErr((e as Error).message || 'Could not create list');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      ref={rootRef}
      role="menu"
      // stopPropagation so a click inside the picker never falls through
      // to the card body's openDetail handler.
      onClick={(e) => e.stopPropagation()}
      className={`absolute ${alignX === 'left' ? 'left-0' : 'right-0'} ${align === 'up' ? 'bottom-full mb-2' : 'top-full mt-2'} z-50 w-64 max-h-80 overflow-y-auto bg-chino-surface border border-chino-border rounded-md shadow-xl py-1`}
    >
      <div className="px-3 py-2 flex items-center justify-between border-b border-chino-border">
        <span className="text-xs uppercase tracking-wide text-chino-muted">Add to list</span>
        <button
          onClick={onClose}
          className="text-chino-muted hover:text-white"
          title="Close"
          aria-label="Close"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-4 text-chino-muted">
          <Loader2 className="w-4 h-4 animate-spin" />
        </div>
      ) : (
        <ul className="py-1">
          {lists.map((list) => {
            const checked = memberOf.has(list.id);
            return (
              <li key={list.id}>
                <button
                  className="w-full flex items-center gap-3 px-3 py-2 text-sm text-chino-text hover:bg-chino-surface-2 text-left"
                  onClick={() => onToggle(list.id, !checked)}
                  role="menuitemcheckbox"
                  aria-checked={checked}
                >
                  <span
                    className={`flex items-center justify-center w-5 h-5 rounded border shrink-0 ${
                      checked ? 'bg-chino-green border-chino-green' : 'border-chino-border bg-transparent'
                    }`}
                  >
                    {checked ? <Check className="w-3.5 h-3.5 text-white stroke-[3]" /> : null}
                  </span>
                  <span className="truncate flex-1">{list.name}</span>
                  {list.isDefault ? (
                    <span className="text-[10px] uppercase text-chino-muted shrink-0">Default</span>
                  ) : null}
                </button>
              </li>
            );
          })}
        </ul>
      )}

      <div className="border-t border-chino-border mt-1">
        {creating ? (
          <div className="px-3 py-2">
            <input
              ref={inputRef}
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void submitNew();
              }}
              maxLength={60}
              placeholder="List name"
              className="w-full bg-chino-bg border border-chino-border rounded px-2 py-1.5 text-sm text-white placeholder-chino-muted focus:outline-none focus:border-chino-accent"
            />
            {err ? <p className="text-chino-red text-xs mt-1">{err}</p> : null}
            <div className="flex gap-2 mt-2">
              <button
                onClick={() => void submitNew()}
                disabled={busy}
                className="px-3 py-1 rounded bg-chino-accent hover:bg-chino-accent/80 text-white text-sm font-medium disabled:opacity-50 flex items-center gap-1"
              >
                {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
                Create
              </button>
              <button
                onClick={() => {
                  setCreating(false);
                  setNewName('');
                  setErr(null);
                }}
                className="px-3 py-1 rounded bg-white/10 hover:bg-white/20 text-white text-sm"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <button
            className="w-full flex items-center gap-2 px-3 py-2 text-sm text-chino-accent hover:bg-chino-surface-2"
            onClick={() => {
              setCreating(true);
              setErr(null);
            }}
          >
            <Plus className="w-4 h-4" />
            New list…
          </button>
        )}
      </div>
    </div>
  );
}
