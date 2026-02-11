/**
 * Interactive CLI review flow for AI Skeptic disagreements.
 *
 * Pure functions are exported for testing. Readline-dependent wrappers
 * handle terminal I/O and are not unit-tested.
 */

import readline from 'readline';
import type { ReviewFeedback } from '@/lib/seed/review-decisions';
import type { ResolveDecision } from '@/lib/services/review-queue';
import type { StatusLevel } from '@/lib/types';

// --- Types ---

/** Shape of an alert row from getPendingReviews() */
interface AlertRow {
  id: number;
  category: string;
  severity: string;
  message: string;
  metadata: unknown;
  createdAt: Date | null;
}

interface KeywordVerdict {
  keyword: string;
  assessment: string;
  reasoning: string;
  suggestedAction?: string;
  suppressionContext?: string;
}

export interface ReviewPromptResult {
  decision: 'approve' | 'override' | 'skip';
  finalStatus?: StatusLevel;
  reasoning?: string;
  falsePositiveKeywords?: string[];
  missingKeywords?: string[];
  suppressionSuggestions?: string[];
  tierChanges?: Array<{
    keyword: string;
    currentTier: string;
    suggestedTier: string;
    reason?: string;
  }>;
}

// --- Pure functions ---

const STATUS_LEVELS: StatusLevel[] = ['Stable', 'Warning', 'Drift', 'Capture'];

function getAlertMeta(alert: AlertRow): Record<string, unknown> {
  return (alert.metadata ?? {}) as Record<string, unknown>;
}

const ACTION_TO_TIER: Record<string, string> = {
  move_to_warning: 'warning',
  move_to_drift: 'drift',
  move_to_capture: 'capture',
};

/** Extract structured feedback from AI keyword verdicts in alert metadata. */
export function extractAiFeedback(alert: AlertRow): ReviewFeedback | undefined {
  const meta = getAlertMeta(alert);
  const verdicts = meta.keywordReview as KeywordVerdict[] | undefined;
  if (!verdicts || verdicts.length === 0) return undefined;

  const falsePositiveKeywords: string[] = [];
  const suppressionSuggestions: string[] = [];
  const tierChanges: ReviewFeedback['tierChanges'] = [];

  for (const v of verdicts) {
    if (v.assessment === 'false_positive') {
      falsePositiveKeywords.push(v.keyword);
    }
    if (v.suppressionContext) {
      suppressionSuggestions.push(`${v.keyword}: ${v.suppressionContext}`);
    }
    const targetTier = v.suggestedAction ? ACTION_TO_TIER[v.suggestedAction] : undefined;
    if (targetTier) {
      tierChanges.push({
        keyword: v.keyword,
        currentTier: 'unknown',
        suggestedTier: targetTier,
        reason: v.reasoning,
      });
    }
  }

  const hasContent =
    falsePositiveKeywords.length > 0 || suppressionSuggestions.length > 0 || tierChanges.length > 0;
  if (!hasContent) return undefined;

  return {
    ...(falsePositiveKeywords.length > 0 ? { falsePositiveKeywords } : {}),
    ...(suppressionSuggestions.length > 0 ? { suppressionSuggestions } : {}),
    ...(tierChanges.length > 0 ? { tierChanges } : {}),
  };
}

export function formatAiFeedbackLines(feedback: ReviewFeedback | undefined): string[] {
  if (!feedback) return [];

  const lines: string[] = ['  AI Keyword Suggestions:'];
  if (feedback.falsePositiveKeywords?.length) {
    lines.push(`    False positives: ${feedback.falsePositiveKeywords.join(', ')}`);
  }
  if (feedback.suppressionSuggestions?.length) {
    lines.push('    Suppression patterns:');
    for (const s of feedback.suppressionSuggestions) lines.push(`      - ${s}`);
  }
  if (feedback.tierChanges?.length) {
    lines.push('    Tier changes:');
    for (const tc of feedback.tierChanges) {
      lines.push(`      - ${tc.keyword}: → ${tc.suggestedTier}`);
    }
  }
  return lines;
}

export function formatItemForDisplay(alert: AlertRow, index: number, total: number): string {
  const meta = getAlertMeta(alert);
  const lines: string[] = [
    '',
    `--- Review ${index + 1} of ${total} ---`,
    '',
    `  Category:       ${alert.category}`,
    `  Keyword Status: ${meta.keywordStatus ?? 'N/A'}`,
    `  AI Recommends:  ${meta.aiRecommendedStatus ?? 'N/A'}`,
    `  Confidence:     ${meta.aiConfidence !== undefined ? `${(Number(meta.aiConfidence) * 100).toFixed(0)}%` : 'N/A'}`,
  ];

  if (meta.keywordReason) {
    lines.push(`  Keyword Reason: ${meta.keywordReason}`);
  }
  if (meta.aiReasoning) {
    lines.push(`  AI Reasoning:   ${meta.aiReasoning}`);
  }

  const docLines = formatDocumentLines(meta);
  if (docLines.length > 0) lines.push(...docLines);

  const evidence = formatEvidenceLines(meta);
  if (evidence.length > 0) lines.push(...evidence);

  const keywordReview = meta.keywordReview as KeywordVerdict[] | undefined;
  if (keywordReview && keywordReview.length > 0) {
    lines.push('  Keyword Verdicts:');
    for (const kr of keywordReview.slice(0, 5)) {
      const action =
        kr.suggestedAction && kr.suggestedAction !== 'keep' ? ` [→${kr.suggestedAction}]` : '';
      lines.push(`    - ${kr.keyword}: ${kr.assessment}${action} — ${kr.reasoning}`);
    }
    if (keywordReview.length > 5) {
      lines.push(`    ... and ${keywordReview.length - 5} more`);
    }
  }

  const aiFeedback = extractAiFeedback(alert);
  const feedbackLines = formatAiFeedbackLines(aiFeedback);
  if (feedbackLines.length > 0) lines.push(...feedbackLines);

  lines.push('');
  return lines.join('\n');
}

interface ReviewedDocument {
  title: string;
  url?: string;
  date?: string;
}

export function formatDocumentLines(meta: Record<string, unknown>): string[] {
  const docs = meta.reviewedDocuments as ReviewedDocument[] | undefined;
  if (!docs || docs.length === 0) return [];

  const lines: string[] = ['  Documents reviewed:'];
  for (const doc of docs) {
    const parts = [`    - ${doc.title}`];
    if (doc.date) parts.push(`[${doc.date}]`);
    if (doc.url) parts.push(`\n      ${doc.url}`);
    lines.push(parts.join(' '));
  }
  return lines;
}

interface EvidenceItem {
  text: string;
  direction: string;
}

export function formatEvidenceLines(meta: Record<string, unknown>): string[] {
  const lines: string[] = [];
  const forItems = meta.evidenceFor as EvidenceItem[] | undefined;
  const againstItems = meta.evidenceAgainst as EvidenceItem[] | undefined;

  if (forItems && forItems.length > 0) {
    lines.push('  Concerning evidence:');
    for (const e of forItems) lines.push(`    ! ${e.text}`);
  }
  if (againstItems && againstItems.length > 0) {
    lines.push('  Reassuring evidence:');
    for (const e of againstItems) lines.push(`    - ${e.text}`);
  }
  return lines;
}

export function parseStatusInput(input: string): StatusLevel | null {
  const trimmed = input.trim().toLowerCase();

  const byNumber: Record<string, StatusLevel> = {
    '1': 'Stable',
    '2': 'Warning',
    '3': 'Drift',
    '4': 'Capture',
  };
  if (byNumber[trimmed]) return byNumber[trimmed];

  const byInitial: Record<string, StatusLevel> = {
    s: 'Stable',
    w: 'Warning',
    d: 'Drift',
    c: 'Capture',
  };
  if (byInitial[trimmed]) return byInitial[trimmed];

  const byName = STATUS_LEVELS.find((s) => s.toLowerCase() === trimmed);
  return byName ?? null;
}

export function buildResolveArgs(
  prompt: ReviewPromptResult,
  alert: AlertRow,
  reviewer: string,
): { alertId: number; decision: ResolveDecision } {
  const meta = getAlertMeta(alert);

  const finalStatus: StatusLevel =
    prompt.decision === 'override' && prompt.finalStatus
      ? prompt.finalStatus
      : prompt.decision === 'approve'
        ? ((meta.aiRecommendedStatus as StatusLevel) ?? (alert.severity as StatusLevel))
        : (alert.severity as StatusLevel);

  const hasFeedback =
    prompt.falsePositiveKeywords?.length ||
    prompt.missingKeywords?.length ||
    prompt.suppressionSuggestions?.length ||
    prompt.tierChanges?.length;

  const feedback: ResolveDecision['feedback'] = hasFeedback
    ? {
        ...(prompt.falsePositiveKeywords?.length
          ? { falsePositiveKeywords: prompt.falsePositiveKeywords }
          : {}),
        ...(prompt.missingKeywords?.length ? { missingKeywords: prompt.missingKeywords } : {}),
        ...(prompt.suppressionSuggestions?.length
          ? { suppressionSuggestions: prompt.suppressionSuggestions }
          : {}),
        ...(prompt.tierChanges?.length ? { tierChanges: prompt.tierChanges } : {}),
      }
    : undefined;

  return {
    alertId: alert.id,
    decision: {
      finalStatus,
      decision: prompt.decision,
      reason: prompt.reasoning ?? `${prompt.decision} via CLI review`,
      reviewer,
      feedback,
    },
  };
}

export function formatProgressSummary(pending: number, resolved: number): string {
  const total = pending + resolved;
  return [
    '[seed:review] Review Status:',
    `  Pending:  ${pending}`,
    `  Resolved: ${resolved}`,
    `  Total:    ${total}`,
  ].join('\n');
}

export function bulkApproveAi(
  alerts: AlertRow[],
  reviewer: string,
): Array<{ alertId: number; decision: ResolveDecision }> {
  return alerts.map((alert) => {
    const aiFeedback = extractAiFeedback(alert);
    return buildResolveArgs(
      {
        decision: 'approve',
        falsePositiveKeywords: aiFeedback?.falsePositiveKeywords,
        suppressionSuggestions: aiFeedback?.suppressionSuggestions,
        tierChanges: aiFeedback?.tierChanges,
      },
      alert,
      reviewer,
    );
  });
}

// --- Readline wrappers ---

function ask(rl: readline.Interface, question: string): Promise<string> {
  return new Promise((resolve) => rl.question(question, resolve));
}

function parseCommaSeparated(input: string): string[] | undefined {
  const trimmed = input.trim();
  if (!trimmed) return undefined;
  return trimmed
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

async function promptFeedback(
  rl: readline.Interface,
  aiFeedback: ReviewFeedback | undefined,
): Promise<
  Pick<
    ReviewPromptResult,
    'falsePositiveKeywords' | 'missingKeywords' | 'suppressionSuggestions' | 'tierChanges'
  >
> {
  if (aiFeedback) {
    const summary: string[] = [];
    if (aiFeedback.falsePositiveKeywords?.length) {
      summary.push(`FP: ${aiFeedback.falsePositiveKeywords.join(', ')}`);
    }
    if (aiFeedback.suppressionSuggestions?.length) {
      summary.push(`Suppress: ${aiFeedback.suppressionSuggestions.length} pattern(s)`);
    }
    if (aiFeedback.tierChanges?.length) {
      summary.push(
        `Tier: ${aiFeedback.tierChanges.map((tc) => `${tc.keyword}→${tc.suggestedTier}`).join(', ')}`,
      );
    }
    console.log(`  AI feedback: ${summary.join(' | ')}`);
    const accept = (await ask(rl, '  Accept AI keyword feedback? [Y]es / [n]o, enter manually: '))
      .trim()
      .toLowerCase();

    if (accept !== 'n' && accept !== 'no') {
      return {
        falsePositiveKeywords: aiFeedback.falsePositiveKeywords,
        suppressionSuggestions: aiFeedback.suppressionSuggestions,
        tierChanges: aiFeedback.tierChanges,
      };
    }
  }

  const fpInput = await ask(rl, 'False-positive keywords (comma-separated, enter to skip): ');
  const missingInput = await ask(rl, 'Missing keywords (comma-separated, enter to skip): ');
  return {
    falsePositiveKeywords: parseCommaSeparated(fpInput),
    missingKeywords: parseCommaSeparated(missingInput),
  };
}

export async function promptForDecision(
  rl: readline.Interface,
  alert: AlertRow,
): Promise<ReviewPromptResult> {
  const meta = getAlertMeta(alert);
  const aiStatus = meta.aiRecommendedStatus as string | undefined;
  const aiFeedback = extractAiFeedback(alert);

  const prompt = aiStatus
    ? `Accept AI recommendation (${aiStatus})? [Y]es / [n]o, override / [s]kip: `
    : 'Approve current status? [Y]es / [n]o, override / [s]kip: ';

  const answer = (await ask(rl, prompt)).trim().toLowerCase();

  if (answer === 's' || answer === 'skip') {
    return { decision: 'skip' };
  }

  if (answer === 'n' || answer === 'no') {
    let status: StatusLevel | null = null;
    while (!status) {
      const statusInput = await ask(
        rl,
        'Select status (1=Stable, 2=Warning, 3=Drift, 4=Capture): ',
      );
      status = parseStatusInput(statusInput);
      if (!status) console.log('Invalid input. Try again.');
    }

    const reasoning = (await ask(rl, 'Reasoning (enter to skip): ')).trim() || undefined;
    const feedback = await promptFeedback(rl, aiFeedback);

    return { decision: 'override', finalStatus: status, reasoning, ...feedback };
  }

  // Default: approve
  const reasoning = (await ask(rl, 'Reasoning (enter to skip): ')).trim() || undefined;
  const feedback = await promptFeedback(rl, aiFeedback);

  return { decision: 'approve', reasoning, ...feedback };
}

export async function runInteractiveReview(options?: { reviewer?: string }): Promise<void> {
  const { getPendingReviews, resolveReview } = await import('@/lib/services/review-queue');

  const pending = await getPendingReviews();
  if (pending.length === 0) {
    console.log('[seed:review] No pending reviews.');
    return;
  }

  const reviewer = options?.reviewer ?? 'cli-reviewer';
  console.log(`[seed:review] ${pending.length} pending reviews. Reviewer: ${reviewer}`);

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

  try {
    for (let i = 0; i < pending.length; i++) {
      const alert = pending[i];
      console.log(formatItemForDisplay(alert, i, pending.length));

      const promptResult = await promptForDecision(rl, alert);
      const args = buildResolveArgs(promptResult, alert, reviewer);
      await resolveReview(args.alertId, args.decision);

      const label = promptResult.decision === 'skip' ? 'skipped' : promptResult.decision;
      console.log(`  → ${label}`);
    }
  } finally {
    rl.close();
  }

  console.log('[seed:review] Interactive review complete.');
}
