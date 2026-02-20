import Link from 'next/link';
import { useRouter } from 'next/router';
import { ReadingLevelToggle } from '@/components/landing/ReadingLevelToggle';
import { ThemeToggle } from '@/components/landing/ThemeToggle';

export function SiteHeader() {
  const router = useRouter();
  const isHome = router.pathname === '/';

  return (
    <header className="border-b border-dm-border pb-4 mb-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex items-center gap-3">
          {isHome ? (
            <h1 className="text-lg font-bold text-dm-text-primary">Democracy Monitor</h1>
          ) : (
            <Link href="/" className="text-lg font-bold text-dm-text-primary hover:text-dm-accent">
              Democracy Monitor
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
