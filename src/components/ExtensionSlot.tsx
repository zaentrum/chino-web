import { useMemo } from 'react';
import * as Icons from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useExtensions, type Extension } from '../hooks/useExtensions';
import { useAuth } from 'react-oidc-context';
import { slotLinkHref, substitute } from '../lib/extensions';

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
 * NATIVE chino buttons. A `link` navigates to its (var-substituted) url —
 * only an http(s) page of this instance's own origin; a row pointing
 * anywhere else renders nothing. An `action` POSTs to it with the user's
 * bearer. Renders nothing when no addon contributes — the neutral-core
 * property.
 */
export function ExtensionSlot({ slot, vars = {} }: ExtensionSlotProps) {
  const exts = useExtensions(slot);
  const auth = useAuth();

  const buttons = useMemo(
    () =>
      exts
        .filter((e) => e.enabled && e.label && e.url)
        .map((e) => ({
          ext: e,
          href: e.kind === 'link' ? slotLinkHref(e.url, window.location.href, vars) : null,
        }))
        .filter((b) => b.ext.kind !== 'link' || b.href !== null),
    // vars is a fresh object each render; its values are what matter.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [exts, JSON.stringify(vars)],
  );
  if (buttons.length === 0) return null;

  const onAction = async (e: Extension) => {
    try {
      await fetch(substitute(e.url, vars), {
        method: e.method || 'POST',
        headers: { Authorization: `Bearer ${auth.user?.access_token ?? ''}` },
      });
    } catch {
      /* best-effort */
    }
  };

  return (
    <div className="flex flex-wrap gap-2 mt-4">
      {buttons.map(({ ext: e, href }) => {
        const Icon = lucideByName(e.icon);
        const cls =
          'px-4 py-2 rounded-lg bg-chino-accent hover:bg-chino-accent/80 text-white font-medium flex items-center gap-2';
        if (e.kind === 'link' && href) {
          return (
            <a key={e.key} href={href} className={cls}>
              <Icon className="w-4 h-4" />
              {e.label}
            </a>
          );
        }
        return (
          <button key={e.key} onClick={() => onAction(e)} className={cls}>
            <Icon className="w-4 h-4" />
            {e.label}
          </button>
        );
      })}
    </div>
  );
}
