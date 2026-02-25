import { Head, Html, Main, NextScript } from 'next/document';

export default function Document() {
  return (
    <Html lang="en">
      <Head>
        {/* Light mode favicons */}
        <link
          rel="icon"
          type="image/png"
          sizes="32x32"
          href="/favicon-32x32.png"
          media="(prefers-color-scheme: light)"
        />
        <link
          rel="icon"
          type="image/png"
          sizes="16x16"
          href="/favicon-16x16.png"
          media="(prefers-color-scheme: light)"
        />

        {/* Dark mode favicons */}
        <link
          rel="icon"
          type="image/png"
          sizes="32x32"
          href="/favicon-32x32-dark.png"
          media="(prefers-color-scheme: dark)"
        />
        <link
          rel="icon"
          type="image/png"
          sizes="16x16"
          href="/favicon-16x16-dark.png"
          media="(prefers-color-scheme: dark)"
        />

        {/* Apple touch icon (no dark mode support) */}
        <link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png" />
      </Head>
      <body>
        <Main />
        <NextScript />
      </body>
    </Html>
  );
}
