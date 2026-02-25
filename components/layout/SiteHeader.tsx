import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { ReadingLevelToggle } from '@/components/landing/ReadingLevelToggle';
import { ThemeToggle } from '@/components/landing/ThemeToggle';
import { useTheme } from '@/lib/contexts/ThemeContext';

export function SiteHeader() {
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
        className="rounded -ml-6 -mb-7 shrink-0"
      />
      <span className="text-2xl font-bold text-dm-text-primary pb-1">Democracy Monitor</span>
    </div>
  );

  return (
    <header className="mb-6">
      {/* Indigo accent bar */}
      <div className="h-1.5 bg-gradient-to-r from-indigo-600 via-indigo-500 to-violet-500 rounded-t" />

      <div className="border-x border-b border-dm-border rounded-b px-4 pb-4 pt-2 overflow-hidden">
        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
          <div className="flex items-end gap-3">
            {isHome ? (
              <h1>{logoAndTitle}</h1>
            ) : (
              <Link href="/" className="hover:opacity-80">
                {logoAndTitle}
              </Link>
            )}
            <span className="px-1.5 py-0.5 mb-1.5 rounded border border-dm-border text-[10px] text-dm-text-secondary">
              Experimental
            </span>
          </div>
          <div className="flex items-center gap-3 pb-1">
            <ReadingLevelToggle />
            <ThemeToggle />
          </div>
        </div>
      </div>
    </header>
  );
}
