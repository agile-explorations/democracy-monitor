import Link from 'next/link';
import { useRouter } from 'next/router';
import { useState } from 'react';
import { CATEGORIES } from '@/lib/data/categories';
import { keyToSlug } from '@/lib/data/category-slugs';

const SYSTEM_LINKS = [
  { href: '/system/health', label: 'Health' },
  { href: '/system/architecture', label: 'Architecture' },
  { href: '/system/methodology', label: 'Methodology' },
  { href: '/system/roadmap', label: 'Roadmap' },
];

function NavSection({
  title,
  children,
  defaultOpen = true,
}: {
  title: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div>
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center justify-between w-full px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-dm-muted hover:text-dm-text-secondary transition-colors"
      >
        {title}
        <span className="text-[10px]">{open ? '\u25B4' : '\u25BE'}</span>
      </button>
      {open && <ul className="space-y-px">{children}</ul>}
    </div>
  );
}

function NavLink({ href, label }: { href: string; label: string }) {
  const router = useRouter();
  const isActive = router.asPath === href || (href !== '/' && router.asPath.startsWith(href));
  return (
    <li>
      <Link
        href={href}
        className={`block px-3 py-1 text-[12px] rounded transition-colors ${
          isActive
            ? 'bg-dm-accent/10 text-dm-accent font-medium'
            : 'text-dm-text-secondary hover:text-dm-text-primary hover:bg-dm-card'
        }`}
      >
        {label}
      </Link>
    </li>
  );
}

function SearchNavLink() {
  const router = useRouter();
  const isActive = router.asPath.startsWith('/search');
  return (
    <Link
      href="/search"
      className={`flex items-center gap-1.5 px-3 py-1.5 text-[12px] rounded-md border transition-colors ${
        isActive
          ? 'border-dm-accent bg-dm-accent/10 text-dm-accent font-medium'
          : 'border-dm-accent/40 text-dm-accent hover:bg-dm-accent/10'
      }`}
    >
      <svg
        width="12"
        height="12"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <circle cx="11" cy="11" r="8" />
        <line x1="21" y1="21" x2="16.65" y2="16.65" />
      </svg>
      Search the Record
    </Link>
  );
}

export function SideNav({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <>
      {/* Mobile overlay */}
      {open && <div className="fixed inset-0 bg-black/30 z-30 lg:hidden" onClick={onClose} />}

      <nav
        className={`fixed top-0 left-0 z-40 h-full w-60 bg-dm-bg border-r border-dm-border overflow-y-auto transition-transform duration-200 lg:sticky lg:top-0 lg:self-start lg:translate-x-0 lg:z-0 ${
          open ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="pt-4 pb-6 space-y-4">
          <div className="px-3 pb-2">
            <SearchNavLink />
          </div>

          <NavSection title="Categories">
            {CATEGORIES.map((cat) => (
              <NavLink key={cat.key} href={`/category/${keyToSlug(cat.key)}`} label={cat.title} />
            ))}
          </NavSection>

          <NavSection title="Data">
            <NavLink href="/data" label="Downloads & API" />
            <NavLink href="/data/structural" label="Structural Dimensions" />
            <NavLink href="/data/thematic" label="Thematic Drift" />
          </NavSection>

          <NavSection title="Connect">
            <NavLink href="/feedback" label="Feedback" />
          </NavSection>

          <NavSection title="System">
            {SYSTEM_LINKS.map((link) => (
              <NavLink key={link.href} href={link.href} label={link.label} />
            ))}
          </NavSection>
        </div>
      </nav>
    </>
  );
}
