import { useEffect, useRef } from 'react';
import { Home, Film, Tv, Settings, Zap, Bookmark } from 'lucide-react';
import chinoIcon from '../../imports/chino_icon.svg';

interface ChinoSidebarProps {
  activeSection: string;
  onSectionChange: (section: string) => void;
}

export function ChinoSidebar({ activeSection, onSectionChange }: ChinoSidebarProps) {
  const menuItems = [
    { id: 'home', label: 'Home', icon: Home },
    { id: 'movies', label: 'Movies', icon: Film },
    { id: 'series', label: 'Series', icon: Tv },
    { id: 'watchlist', label: 'Watchlist', icon: Bookmark },
    { id: 'zap', label: 'Zap', icon: Zap },
  ];

  // Single button cell shape, reused for logo + nav + settings so they
  // all align vertically. 64×64 outer (matches nav button inside p-2),
  // 24×24 inner icon, 8px corner radius.
  const cellBase =
    'w-12 h-12 mx-auto flex items-center justify-center rounded-lg transition-all';

  // Where the tabs don't fit the rail's height - a phone on its side leaves
  // it some 360 px, and the logo cell, the five tabs and Settings take 432 -
  // their column scrolls: each tab keeps its 48 px, Settings stays pinned at
  // the foot and the logo cell keeps the header's 64 px, and the open tab is
  // scrolled into view as it opens, and after a layout that leaves the
  // column short (the phone turned, the window made smaller). Scrolled by
  // hand, the column stays where it was left until another tab opens or its
  // height changes. Where the tabs fit there is nothing to scroll, and the
  // rail is as it was.
  const navRef = useRef<HTMLElement>(null);
  const tabRefs = useRef(new Map<string, HTMLButtonElement>());
  useEffect(() => {
    const nav = navRef.current;
    if (!nav) return;
    const reveal = () => {
      if (nav.scrollHeight <= nav.clientHeight) return;
      tabRefs.current.get(activeSection)?.scrollIntoView({ block: 'nearest' });
    };
    reveal();
    let height = nav.clientHeight;
    const resized = new ResizeObserver(() => {
      if (nav.clientHeight === height) return;
      height = nav.clientHeight;
      reveal();
    });
    resized.observe(nav);
    return () => resized.disconnect();
  }, [activeSection]);

  return (
    <aside className="w-20 bg-chino-bg border-r border-chino-border flex-col h-full hidden md:flex">
      {/* Logo cell mirrors the header's h-16 so the icon and the search
          bar sit on the same baseline; border-b separates it from the
          nav, matching the design reference. */}
      <div className="h-16 shrink-0 flex items-center justify-center border-b border-chino-border">
        <button
          onClick={() => onSectionChange('home')}
          title="Chino — Home"
          className={`${cellBase} overflow-hidden hover:opacity-90`}
        >
          <img src={chinoIcon} alt="Chino" className="w-full h-full" />
        </button>
      </div>

      <nav
        ref={navRef}
        className="flex-1 min-h-0 overflow-y-auto px-4 pt-4 space-y-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {menuItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeSection === item.id;
          return (
            <button
              key={item.id}
              ref={(el) => {
                if (el) tabRefs.current.set(item.id, el);
                else tabRefs.current.delete(item.id);
              }}
              onClick={() => onSectionChange(item.id)}
              aria-label={item.label}
              title={item.label}
              aria-current={isActive ? 'page' : undefined}
              className={`${cellBase} ${
                isActive
                  ? 'bg-chino-surface text-chino-accent'
                  : 'text-chino-muted hover:bg-chino-surface hover:text-white'
              }`}
            >
              <Icon className="w-6 h-6" />
            </button>
          );
        })}
      </nav>

      <div className="shrink-0 p-4">
        <button
          onClick={() => onSectionChange('settings')}
          aria-label="Settings"
          title="Settings"
          aria-current={activeSection === 'settings' ? 'page' : undefined}
          className={`${cellBase} ${
            activeSection === 'settings'
              ? 'bg-chino-surface text-chino-accent'
              : 'text-chino-muted hover:bg-chino-surface hover:text-white'
          }`}
        >
          <Settings className="w-6 h-6" />
        </button>
      </div>
    </aside>
  );
}
