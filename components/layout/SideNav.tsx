import Link from 'next/link';
import { useRouter } from 'next/router';
import { useState } from 'react';
import { CATEGORIES } from '@/lib/data/categories';

const SYSTEM_LINKS = [
  { href: '/system/health', label: 'Health' },
  { href: '/system/architecture', label: 'Architecture' },
  { href: '/system/methodology', label: 'Methodology' },
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
          <NavSection title="Categories">
            {CATEGORIES.map((cat) => (
              <NavLink key={cat.key} href={`/category/${cat.key}`} label={cat.title} />
            ))}
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
