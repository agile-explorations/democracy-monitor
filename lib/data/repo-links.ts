/**
 * Links into the public repository (#812, #815). One constant for the repo
 * root; blob links pin to `main` and name the file so a reader lands on the
 * exact text the instrument runs.
 */

export const GITHUB_REPO = 'https://github.com/agile-explorations/democracy-monitor';

export function repoBlobUrl(path: string): string {
  return `${GITHUB_REPO}/blob/main/${path}`;
}

/** The instructions the Pass-2 reviewer receives — the file, not a paraphrase. */
export const PASS2_INSTRUCTIONS_URL = repoBlobUrl('lib/ai/prompts/document-review-pass2.ts');

/** A prefilled "new issue" link (title/body are URL-encoded by the caller). */
export function newIssueUrl(title: string, body: string, labels: string[] = []): string {
  const params = new URLSearchParams({ title, body });
  if (labels.length > 0) params.set('labels', labels.join(','));
  return `${GITHUB_REPO}/issues/new?${params.toString()}`;
}
