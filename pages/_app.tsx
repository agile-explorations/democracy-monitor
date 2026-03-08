import type { AppProps } from 'next/app';
import { useEffect, useState } from 'react';
import { SideNav } from '@/components/layout/SideNav';
import { SiteFooter } from '@/components/layout/SiteFooter';
import { SiteHeader } from '@/components/layout/SiteHeader';
import { ReadingLevelProvider } from '@/lib/contexts/ReadingLevelContext';
import { ThemeProvider } from '@/lib/contexts/ThemeContext';
import '@/styles/globals.css';

export default function App({ Component, pageProps }: AppProps) {
  const [navOpen, setNavOpen] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/health/last-updated');
        if (res.ok) {
          const data = await res.json();
          if (data.lastUpdated) setLastUpdated(data.lastUpdated);
        }
      } catch {
        // silently fail
      }
    })();
  }, []);

  return (
    <ThemeProvider>
      <ReadingLevelProvider>
        <div className="min-h-screen bg-dm-bg">
          <div className="max-w-[1440px] mx-auto">
            {/* Full-width header spanning above both nav and content */}
            <div className="pt-6">
              <SiteHeader onMenuToggle={() => setNavOpen((v) => !v)} lastUpdated={lastUpdated} />
            </div>

            {/* Nav + content side by side below header */}
            <div className="flex">
              <SideNav open={navOpen} onClose={() => setNavOpen(false)} />
              <div className="flex-1 min-w-0">
                <div className="max-w-content mx-auto px-4 sm:px-6 pb-6">
                  <Component {...pageProps} />
                  <SiteFooter />
                </div>
              </div>
            </div>
          </div>
        </div>
      </ReadingLevelProvider>
    </ThemeProvider>
  );
}
