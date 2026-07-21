import { useMemo } from 'react';
import * as Icons from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useExtensions, type Extension } from '../hooks/useExtensions';
import { useAuth } from 'react-oidc-context';

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

// substitute replaces {var} tokens in a url with encoded values.
function substitute(url: string, vars: Record<string, string>): string {
  return url.replace(/\{(\w+)\}/g, (_, k: string) =>
    k in vars ? encodeURIComponent(vars[k]) : '',
  );
}

/**
 * ExtensionSlot renders the addon-contributed buttons for a named slot as
 * NATIVE chino buttons. A `link` navigates to its (var-substituted) url; an
 * `action` POSTs to it with the user's bearer. Renders nothing when no addon
 * contributes — the neutral-core property.
 */
export function ExtensionSlot({ slot, vars = {} }: ExtensionSlotProps) {
  const exts = useExtensions(slot);
  const auth = useAuth();

  const buttons = useMemo(
    () => exts.filter((e) => e.enabled && e.label && e.url),
    [exts],
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
      {buttons.map((e) => {
        const Icon = lucideByName(e.icon);
        const cls =
          'px-4 py-2 rounded-lg bg-chino-accent hover:bg-chino-accent/80 text-white font-medium flex items-center gap-2';
        if (e.kind === 'link') {
          return (
            <a key={e.key} href={substitute(e.url, vars)} className={cls}>
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
