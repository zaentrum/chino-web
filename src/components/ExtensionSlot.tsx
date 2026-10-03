import { useMemo } from 'react';
import * as Icons from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useExtensions } from '../hooks/useExtensions';
import { useAuth } from 'react-oidc-context';
import { slotButtons, type SlotButton } from '../lib/extensions';

interface ExtensionSlotProps {
  slot: string;
  // Substitution values available to link URLs (e.g. {q}).
  vars?: Record<string, string>;
}

// lucideByName resolves a lucide icon by its PascalCase export name, falling
// back to a neutral Puzzle glyph when an addon names an unknown icon.
function lucideByName(name: string): LucideIcon {
  if (name) {
    const key = name.charAt(0).toUpperCase() + name.slice(1);
    const found = (Icons as unknown as Record<string, LucideIcon>)[key];
    if (found) return found;
  }
  return Icons.Puzzle;
}

/**
 * ExtensionSlot renders the addon-contributed buttons for a named slot as
 * NATIVE chino buttons. Only two kinds, each held to what is safe behind a
 * chino button (lib/extensions.ts): a `link` opens an http(s) page of this
 * instance's own origin; an `action` POSTs, with the user's bearer, to the
 * portal's app proxy on this origin. A row of another kind, or pointing
 * anywhere else, renders nothing — as does a slot no addon contributes to:
 * the neutral-core property.
 */
export function ExtensionSlot({ slot, vars = {} }: ExtensionSlotProps) {
  const exts = useExtensions(slot);
  const auth = useAuth();

  const varsKey = JSON.stringify(vars);
  const buttons = useMemo(
    () => slotButtons(exts, window.location.href, vars),
    // vars is a fresh object each render; its values are what matter.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [exts, varsKey],
  );
  if (buttons.length === 0) return null;

  const onAction = async (b: SlotButton) => {
    try {
      await fetch(b.href, {
        method: 'POST',
        credentials: 'same-origin',
        // A redirect could carry the bearer somewhere the URL check never saw.
        redirect: 'error',
        headers: { Authorization: `Bearer ${auth.user?.access_token ?? ''}` },
      });
    } catch {
      /* best-effort */
    }
  };

  return (
    <div className="flex flex-wrap gap-2 mt-4">
      {buttons.map((b) => {
        const Icon = lucideByName(b.icon);
        const cls =
          'px-4 py-2 rounded-lg bg-chino-accent hover:bg-chino-accent/80 text-white font-medium flex items-center gap-2';
        if (b.kind === 'link') {
          return (
            <a key={b.key} href={b.href} className={cls}>
              <Icon className="w-4 h-4" />
              {b.label}
            </a>
          );
        }
        return (
          <button key={b.key} type="button" onClick={() => void onAction(b)} className={cls}>
            <Icon className="w-4 h-4" />
            {b.label}
          </button>
        );
      })}
    </div>
  );
}
