import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { DisplaySettings } from '@/components/layout/DisplaySettings';
import { EmailSignup } from '@/components/shared/EmailSignup';
import { useTheme } from '@/lib/contexts/ThemeContext';

export function SiteHeader({
  onMenuToggle,
  lastUpdated,
}: {
  onMenuToggle?: () => void;
  lastUpdated?: string | null;
}) {
  const router = useRouter();
  const { resolvedMode } = useTheme();
  const isHome = router.pathname === '/';
  const logoSrc = resolvedMode === 'dark' ? '/logo-dark.png' : '/logo.png';

  const logoAndTitle = (
    <div className="flex items-end gap-3">
      <Image
        src={logoSrc}
        alt=""
        width={140}
        height={140}
        className="rounded -ml-6 -mb-12 shrink-0 hidden sm:block"
      />
      <Image
        src={logoSrc}
        alt=""
        width={80}
        height={80}
        className="rounded -ml-3 -mb-6 shrink-0 sm:hidden"
      />
      <span className="text-lg sm:text-2xl font-bold text-dm-text-primary pb-1">
        Democracy Monitor
      </span>
    </div>
  );

  return (
    <header className="mb-6">
      {/* Indigo accent bar */}
      <div className="h-1.5 bg-gradient-to-r from-indigo-600 via-indigo-500 to-violet-500 rounded-t" />

      <div className="border-x border-b border-dm-border rounded-b px-4 pb-2 pt-1 overflow-hidden">
        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
          <div className="flex items-end gap-3">
            {onMenuToggle && (
              <button
                onClick={onMenuToggle}
                className="lg:hidden text-dm-text-secondary hover:text-dm-text-primary transition-colors pb-1 -ml-1"
                aria-label="Toggle navigation"
              >
                <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
                  <rect y="3" width="20" height="2" rx="1" />
                  <rect y="9" width="20" height="2" rx="1" />
                  <rect y="15" width="20" height="2" rx="1" />
                </svg>
              </button>
            )}
            {isHome ? (
              <h1>{logoAndTitle}</h1>
            ) : (
              <Link href="/" className="hover:opacity-80">
                {logoAndTitle}
              </Link>
            )}
            <span className="hidden sm:inline px-1.5 py-0.5 mb-1.5 rounded border border-dm-border text-[10px] text-dm-text-secondary">
              Experimental
            </span>
            <Link
              href="/support"
              className="hidden sm:inline px-2 py-0.5 mb-1.5 rounded border border-pink-300 dark:border-pink-700 text-[10px] text-pink-600 dark:text-pink-400 hover:bg-pink-50 dark:hover:bg-pink-950 transition-colors"
            >
              ♥ Support
            </Link>
            <span className="hidden sm:inline">
              <EmailSignup variant="badge" />
            </span>
          </div>
        </div>

        {/* Tagline + last updated + display settings */}
        <div className="mt-2 sm:ml-32 flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
          <div className="flex flex-wrap items-baseline gap-x-3">
            <p className="text-xs sm:text-sm text-dm-text-secondary">
              Monitoring democratic institutions through public records
            </p>
            {lastUpdated && (
              <p className="text-[11px] text-dm-muted">
                Last updated: {new Date(lastUpdated).toLocaleDateString()}
              </p>
            )}
          </div>
          <DisplaySettings />
        </div>
      </div>
    </header>
  );
}
