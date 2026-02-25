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
    <div className="flex items-center gap-2">
      <Image src={logoSrc} alt="" width={28} height={28} className="rounded" />
      <span className="text-lg font-bold text-dm-text-primary">Democracy Monitor</span>
    </div>
  );

  return (
    <header className="border-b border-dm-border pb-4 mb-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex items-center gap-3">
          {isHome ? (
            <h1>{logoAndTitle}</h1>
          ) : (
            <Link href="/" className="hover:opacity-80">
              {logoAndTitle}
            </Link>
          )}
          <span className="px-1.5 py-0.5 rounded border border-dm-border text-[10px] text-dm-text-secondary">
            Experimental
          </span>
        </div>
        <div className="flex items-center gap-3">
          <ReadingLevelToggle />
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}
