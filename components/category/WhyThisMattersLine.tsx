import Link from 'next/link';
import { CATEGORY_WHY_LINES, pillarIdForCategory } from '@/lib/data/why-this-matters';

/** One-line civic framing under the category description, deep-linking to the category's pillar on /norms (#549, #820). */
export function WhyThisMattersLine({ categoryKey }: { categoryKey: string }) {
  const line = CATEGORY_WHY_LINES[categoryKey];
  if (!line) return null;
  return (
    <p className="text-sm text-dm-text-secondary italic mt-3 max-w-3xl leading-relaxed">
      {line}{' '}
      <Link
        href={`/norms#${pillarIdForCategory(categoryKey) ?? ''}`}
        className="text-dm-accent not-italic hover:underline whitespace-nowrap"
      >
        Why this matters &rarr;
      </Link>
    </p>
  );
}
