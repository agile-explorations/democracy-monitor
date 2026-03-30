import Link from 'next/link';
import { useRouter } from 'next/router';
import { FeedbackForm } from '@/components/shared/FeedbackForm';
import { SEOHead } from '@/components/shared/SEOHead';

export default function FeedbackPage() {
  const router = useRouter();
  const category = router.query.category as string | undefined;

  return (
    <>
      <SEOHead
        title="Feedback"
        description="Share feedback, report missing data, or suggest features for Democracy Monitor."
        canonicalPath="/feedback"
      />

      <Link href="/" className="text-xs text-dm-accent hover:underline">
        &larr; Back to overview
      </Link>

      <h1 className="text-xl font-bold text-dm-text-primary mt-4 mb-2">Feedback</h1>
      <p className="text-sm text-dm-text-secondary mb-6 max-w-2xl">
        Democracy Monitor is an open-source project and we welcome your input. Report missing data,
        suggest features, ask questions, or share any other feedback.
      </p>

      <div className="max-w-lg">
        <FeedbackForm
          initialCategory={category}
          initialPageUrl={typeof window !== 'undefined' ? window.location.href : undefined}
        />
      </div>
    </>
  );
}
