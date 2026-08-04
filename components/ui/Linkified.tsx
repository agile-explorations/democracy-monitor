import { Fragment } from 'react';
import { splitLinkified } from '@/lib/utils/linkify';

/**
 * Render plain text with http(s) URLs as clickable links (#675). Links are
 * built as React `<a>` elements — text and href are React-escaped and no HTML
 * is ever injected, so untrusted input cannot produce markup or an unsafe
 * scheme. Inline by design; the surrounding element controls whitespace.
 */
export function Linkified({ text }: { text: string }) {
  const segments = splitLinkified(text);
  return (
    <>
      {segments.map((seg, i) =>
        seg.type === 'link' ? (
          <a
            key={i}
            href={seg.value}
            target="_blank"
            rel="noopener noreferrer"
            className="text-dm-accent hover:underline"
          >
            {seg.value}
          </a>
        ) : (
          <Fragment key={i}>{seg.value}</Fragment>
        ),
      )}
    </>
  );
}
