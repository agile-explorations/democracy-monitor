import type { AppProps } from 'next/app';
import { SiteHeader } from '@/components/layout/SiteHeader';
import { ReadingLevelProvider } from '@/lib/contexts/ReadingLevelContext';
import { ThemeProvider } from '@/lib/contexts/ThemeContext';
import '@/styles/globals.css';

export default function App({ Component, pageProps }: AppProps) {
  return (
    <ThemeProvider>
      <ReadingLevelProvider>
        <div className="min-h-screen bg-dm-bg">
          <div className="max-w-content mx-auto px-4 sm:px-6 py-6">
            <SiteHeader />
            <Component {...pageProps} />
          </div>
        </div>
      </ReadingLevelProvider>
    </ThemeProvider>
  );
}
