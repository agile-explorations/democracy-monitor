import type { AppProps } from 'next/app';
import { ReadingLevelProvider } from '@/lib/contexts/ReadingLevelContext';
import { ThemeProvider } from '@/lib/contexts/ThemeContext';
import '@/styles/globals.css';

export default function App({ Component, pageProps }: AppProps) {
  return (
    <ThemeProvider>
      <ReadingLevelProvider>
        <Component {...pageProps} />
      </ReadingLevelProvider>
    </ThemeProvider>
  );
}
