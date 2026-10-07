import { Home, Film, Tv, Settings, Zap, Bookmark } from 'lucide-react';

interface ChinoMobileNavProps {
  activeSection: string;
  onSectionChange: (section: string) => void;
}

/**
 * The phone's bottom bar: the tabs as their icons alone, as the side rail
 * (ChinoSidebar) and the app's bottom bar draw them - no label under them.
 * A tab's name is its aria-label and title; the open tab is the one in the
 * accent, and its aria-current says it is open. Each tab is the bar's height
 * and an equal share of its width - 69 x 63 px on a 412 px phone - so a touch
 * anywhere on the bar lands on a tab.
 */
export function ChinoMobileNav({ activeSection, onSectionChange }: ChinoMobileNavProps) {
  const menuItems = [
    { id: 'home', label: 'Home', icon: Home },
    { id: 'movies', label: 'Movies', icon: Film },
    { id: 'series', label: 'Series', icon: Tv },
    { id: 'watchlist', label: 'Watchlist', icon: Bookmark },
    { id: 'zap', label: 'Zap', icon: Zap },
    { id: 'settings', label: 'Settings', icon: Settings },
  ];

  return (
    <nav className="md:hidden fixed bottom-0 left-0 right-0 h-16 bg-chino-bg border-t border-chino-border flex z-40">
      {menuItems.map((item) => {
        const Icon = item.icon;
        const isActive = activeSection === item.id;

        return (
          <button
            key={item.id}
            type="button"
            onClick={() => onSectionChange(item.id)}
            aria-label={item.label}
            title={item.label}
            aria-current={isActive ? 'page' : undefined}
            className={`flex-1 flex items-center justify-center transition-colors ${
              isActive
                ? 'text-chino-accent'
                : 'text-chino-muted'
            }`}
          >
            <Icon className="w-[22px] h-[22px]" aria-hidden="true" />
          </button>
        );
      })}
    </nav>
  );
}
