import { Component, useMemo, type ReactNode } from 'react';
import {
  Boxes,
  Clapperboard,
  Database,
  Download,
  FileText,
  Gauge,
  Globe,
  Image,
  LayoutGrid,
  Library,
  ListVideo,
  Music,
  Puzzle,
  Radar,
  Server,
  Settings,
  Tv,
  Users,
  Wrench,
  type LucideIcon,
} from 'lucide-react';
import { useExtensions } from '../hooks/useExtensions';
import { useAuth } from 'react-oidc-context';
import { slotButtons, type SlotButton, type SlotIconName } from '../lib/extensions';

interface ExtensionSlotProps {
  slot: string;
  // Substitution values available to link URLs (e.g. {q}).
  vars?: Record<string, string>;
}

// The portal's icon palette, glyph by glyph (lib/extensions.ts names them).
// Named imports keep the bundle to these nineteen.
const SLOT_ICONS: Record<SlotIconName, LucideIcon> = {
  library: Library,
  radar: Radar,
  download: Download,
  tv: Tv,
  music: Music,
  clapperboard: Clapperboard,
  settings: Settings,
  'layout-grid': LayoutGrid,
  server: Server,
  boxes: Boxes,
  globe: Globe,
  wrench: Wrench,
  'file-text': FileText,
  image: Image,
  'list-video': ListVideo,
  users: Users,
  gauge: Gauge,
  database: Database,
  puzzle: Puzzle,
};

/**
 * ExtensionSlot renders the addon-contributed buttons for a named slot as
 * NATIVE chino buttons. Only two kinds, each held to what is safe behind a
 * chino button (lib/extensions.ts): a `link` opens an http(s) page of this
 * instance's own origin; an `action` POSTs, with the user's bearer, to the
 * portal's app proxy on this origin. A row of another kind, or pointing
 * anywhere else, renders nothing — as does a slot no addon contributes to:
 * the neutral-core property.
 *
 * The slot is its own error boundary: whatever a row holds, the worst it
 * can do is not show up. It must never take the page around it down.
 */
export function ExtensionSlot(props: ExtensionSlotProps) {
  return (
    <SlotBoundary slot={props.slot}>
      <SlotButtons {...props} />
    </SlotBoundary>
  );
}

function SlotButtons({ slot, vars = {} }: ExtensionSlotProps) {
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
        const Icon = SLOT_ICONS[b.icon];
        const cls =
          'px-4 py-2 rounded-lg bg-chino-accent hover:bg-chino-accent/80 text-white font-medium flex items-center gap-2';
        if (b.kind === 'link') {
          return (
            <a key={b.key} href={b.href} className={cls}>
              <Icon className="w-4 h-4" aria-hidden />
              {b.label}
            </a>
          );
        }
        return (
          <button key={b.key} type="button" onClick={() => void onAction(b)} className={cls}>
            <Icon className="w-4 h-4" aria-hidden />
            {b.label}
          </button>
        );
      })}
    </div>
  );
}

/** Renders nothing in place of a slot that failed to render. Not reported:
 *  what a slot shows comes from an addon's rows, not from chino. */
class SlotBoundary extends Component<{ slot: string; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: Error) {
    // eslint-disable-next-line no-console
    console.warn(`[slot ${this.props.slot}] not rendered:`, error);
  }

  render() {
    return this.state.failed ? null : this.props.children;
  }
}
