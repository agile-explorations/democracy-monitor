import Link from 'next/link';
import type { DisputeContext } from '@/lib/utils/dispute-link';
import { disputeHref } from '@/lib/utils/dispute-link';

/**
 * "Dispute this reading" (#815): the one affordance every AI-reviewed
 * document carries. It opens the feedback page prefilled with the document
 * and the verdict, so a reader can say why the reading is wrong; disputes
 * are public once reviewed and answered in the reversals ledger when they
 * change a reading.
 */
export function DisputeLink({ ctx, className = '' }: { ctx: DisputeContext; className?: string }) {
  return (
    <Link
      href={disputeHref(ctx)}
      className={`text-[11px] text-dm-muted hover:text-dm-accent hover:underline ${className}`}
      title="Tell us why this reading is wrong. Disputes are public once reviewed."
    >
      Dispute this reading
    </Link>
  );
}
