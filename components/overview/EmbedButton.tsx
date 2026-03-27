import { useCallback, useState } from 'react';
import type { TimeRangePreset } from '@/components/overview/TimeRangeSelector';

interface EmbedButtonProps {
  theme: 'light' | 'dark';
  range: TimeRangePreset;
  comparison: boolean;
  readingLevel: 'summary' | 'detailed';
}

function buildEmbedUrl(props: EmbedButtonProps): string {
  const params = new URLSearchParams();
  params.set('theme', props.theme);
  params.set('range', props.range);
  params.set('comparison', props.comparison ? 'on' : 'off');
  params.set('level', props.readingLevel);
  return `/embed/overview?${params.toString()}`;
}

function buildIframeCode(props: EmbedButtonProps): string {
  const url = `https://democracymonitor.org${buildEmbedUrl(props)}`;
  return `<iframe src="${url}" width="100%" height="500" frameborder="0" title="Democracy Monitor — Cumulative Concern Score"></iframe>`;
}

export function EmbedButton({ theme, range, comparison, readingLevel }: EmbedButtonProps) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const code = buildIframeCode({ theme, range, comparison, readingLevel });

  const copy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback for older browsers
      const textarea = document.createElement('textarea');
      textarea.value = code;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }, [code]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-[10px] text-dm-muted hover:text-dm-accent transition-colors flex items-center gap-1"
        title="Get embed code for this chart"
      >
        <svg
          width="12"
          height="12"
          viewBox="0 0 16 16"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M10 2h4v4" />
          <path d="M14 2L8 8" />
          <path d="M14 9v5a1 1 0 01-1 1H3a1 1 0 01-1-1V3a1 1 0 011-1h5" />
        </svg>
        Embed
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
          onClick={() => setOpen(false)}
        >
          <div
            className="bg-dm-card border border-dm-border rounded-lg shadow-xl p-5 max-w-lg w-full mx-4"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-sm font-semibold text-dm-text-primary mb-2">Embed This Chart</h3>
            <p className="text-xs text-dm-muted mb-3">
              Copy the code below to embed the Cumulative Concern Score chart on your website. The
              embed uses your current settings (theme, time range, comparison lines).
            </p>
            <div className="relative">
              <pre className="text-[10px] bg-dm-bg border border-dm-border rounded p-3 overflow-x-auto whitespace-pre-wrap break-all text-dm-text-secondary">
                {code}
              </pre>
              <button
                type="button"
                onClick={copy}
                className="absolute top-2 right-2 px-2 py-1 text-[10px] rounded bg-dm-accent text-white hover:bg-dm-accent/80 transition-colors"
              >
                {copied ? 'Copied!' : 'Copy'}
              </button>
            </div>
            <div className="flex justify-between items-center mt-3">
              <a
                href={buildEmbedUrl({ theme, range, comparison, readingLevel })}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[10px] text-dm-accent hover:underline"
              >
                Preview embed
              </a>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="text-xs text-dm-muted hover:text-dm-text-primary transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
