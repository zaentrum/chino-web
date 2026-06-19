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
export function AddToListPicker({ itemId, onClose, align = 'down' }: AddToListPickerProps) {
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
  useEffect(() => {
    const onDown = (e: MouseEvent) => {
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
  }, [onClose]);

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
      className={`absolute right-0 ${align === 'up' ? 'bottom-full mb-2' : 'top-full mt-2'} z-50 w-64 max-h-80 overflow-y-auto bg-[#161b22] border border-[#30363d] rounded-md shadow-xl py-1`}
    >
      <div className="px-3 py-2 flex items-center justify-between border-b border-[#30363d]">
        <span className="text-xs uppercase tracking-wide text-[#8b949e]">Add to list</span>
        <button
          onClick={onClose}
          className="text-[#8b949e] hover:text-white"
          title="Close"
          aria-label="Close"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-4 text-[#8b949e]">
          <Loader2 className="w-4 h-4 animate-spin" />
        </div>
      ) : (
        <ul className="py-1">
          {lists.map((list) => {
            const checked = memberOf.has(list.id);
            return (
              <li key={list.id}>
                <button
                  className="w-full flex items-center gap-3 px-3 py-2 text-sm text-[#c9d1d9] hover:bg-[#21262d] text-left"
                  onClick={() => onToggle(list.id, !checked)}
                  role="menuitemcheckbox"
                  aria-checked={checked}
                >
                  <span
                    className={`flex items-center justify-center w-5 h-5 rounded border shrink-0 ${
                      checked ? 'bg-emerald-500 border-emerald-500' : 'border-[#30363d] bg-transparent'
                    }`}
                  >
                    {checked ? <Check className="w-3.5 h-3.5 text-white stroke-[3]" /> : null}
                  </span>
                  <span className="truncate flex-1">{list.name}</span>
                  {list.isDefault ? (
                    <span className="text-[10px] uppercase text-[#8b949e] shrink-0">Default</span>
                  ) : null}
                </button>
              </li>
            );
          })}
        </ul>
      )}

      <div className="border-t border-[#30363d] mt-1">
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
              className="w-full bg-[#0d1117] border border-[#30363d] rounded px-2 py-1.5 text-sm text-white placeholder-[#8b949e] focus:outline-none focus:border-[#58a6ff]"
            />
            {err ? <p className="text-rose-400 text-xs mt-1">{err}</p> : null}
            <div className="flex gap-2 mt-2">
              <button
                onClick={() => void submitNew()}
                disabled={busy}
                className="px-3 py-1 rounded bg-[#58a6ff] hover:bg-[#58a6ff]/80 text-white text-sm font-medium disabled:opacity-50 flex items-center gap-1"
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
            className="w-full flex items-center gap-2 px-3 py-2 text-sm text-[#58a6ff] hover:bg-[#21262d]"
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
