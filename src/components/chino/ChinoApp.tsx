import { useState } from 'react';
import { ChinoSidebar } from './ChinoSidebar';
import { ChinoMobileNav } from './ChinoMobileNav';
import { Header } from '../Header';
import { HomeSection } from '../sections/HomeSection';
import { MoviesSection } from '../sections/MoviesSection';
import { SeriesSection } from '../sections/SeriesSection';
import { SettingsPage } from '../sections/SettingsPage';
import { SearchPage } from '../SearchPage';
import { ZapSection } from '../sections/ZapSection';
import { WatchlistSection } from '../sections/WatchlistSection';

interface ChinoAppProps {
  /**
   * When the user lands on /search?q=… we mount ChinoApp with this
   * prop set so the search section is the initial view. The shell
   * (sidebar + header + search input) stays present so the user can
   * refine the query or jump back to Home without losing chrome.
   * undefined → no search context, normal Home landing.
   */
  initialSearchQuery?: string;
  /**
   * Deep-link entry point — /watchlist mounts the shell with this set to
   * 'watchlist' so the lists view is the initial section. Defaults to
   * 'home'.
   */
  initialSection?: string;
}

export function ChinoApp({ initialSearchQuery, initialSection }: ChinoAppProps = {}) {
  const [activeSection, setActiveSection] = useState(
    initialSearchQuery !== undefined ? 'search' : initialSection ?? 'home',
  );

  // Sidebar / mobile-nav navigations always leave the search view —
  // and when they do we strip the /search?q=… off the address bar so a
  // refresh lands on the section the user actually chose. pushState is
  // enough; we don't need to re-render via popstate because the inner
  // state has already advanced.
  //
  // The watchlist section also keeps the address bar honest: navigating
  // to it pushes /watchlist (so a refresh / share lands back on it), and
  // navigating away from it (when we're sitting on /watchlist) restores
  // the SPA root.
  const changeSection = (s: string) => {
    setActiveSection(s);
    const path = window.location.pathname;
    if (s === 'watchlist' && path !== '/watchlist') {
      window.history.pushState({}, '', '/watchlist');
    } else if (s !== 'watchlist' && path === '/watchlist') {
      window.history.pushState({}, '', '/');
    } else if (s !== 'search' && path === '/search') {
      window.history.pushState({}, '', '/');
    }
  };

  const renderSection = () => {
    switch (activeSection) {
      case 'home':
        return <HomeSection onNavigate={changeSection} />;
      case 'movies':
        return <MoviesSection />;
      case 'series':
        return <SeriesSection />;
      case 'watchlist':
        return <WatchlistSection />;
      case 'settings':
        return <SettingsPage />;
      case 'search':
        return <SearchPage query={initialSearchQuery ?? ''} />;
      case 'zap':
        return <ZapSection />;
      default:
        return <HomeSection onNavigate={changeSection} />;
    }
  };

  return (
    <div className="size-full flex bg-[#0d1117] text-white">
      <ChinoSidebar activeSection={activeSection} onSectionChange={changeSection} />

      <div className="flex-1 flex flex-col overflow-hidden">
        <Header />

        <main className="flex-1 overflow-y-auto pb-20 md:pb-0">
          {/* p-4 (1rem) on all breakpoints so the section content
              lines up with the search bar's px-4 (1rem) in Header —
              no jog between header content and main content edges. */}
          <div className="p-4">
            {renderSection()}
          </div>
        </main>

        <ChinoMobileNav activeSection={activeSection} onSectionChange={changeSection} />
      </div>
    </div>
  );
}
