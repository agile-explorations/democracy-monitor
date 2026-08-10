import { useState } from 'react';
import { Chevron } from '@/components/ui/Chevron';

/** Bordered disclosure card — lifted verbatim from WeekDetailPanel (#696). */
export function CollapsiblePanel({
  title,
  children,
  defaultOpen,
}: {
  title: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen ?? false);

  return (
    <div className="rounded-lg border border-dm-border bg-dm-card">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between p-4 text-left hover:bg-dm-border/20 transition-colors"
      >
        <span className="text-xs font-semibold uppercase tracking-wider text-dm-text-secondary">
          {title}
        </span>
        <span className="text-dm-muted">
          <Chevron open={open} />
        </span>
      </button>
      {open && <div className="px-5 pb-5">{children}</div>}
    </div>
  );
}
