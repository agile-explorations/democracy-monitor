import { sql } from 'drizzle-orm';
import { ASSESSMENT_RULES } from '@/lib/data/assessment-rules';
import { isHighAuthoritySource } from '@/lib/data/authority-sources';
import { NEGATION_PATTERNS, SUPPRESSION_RULES } from '@/lib/data/suppression-rules';
import { isDbAvailable, getDb } from '@/lib/db';
import { documentScores } from '@/lib/db/schema';
import {
  computeSeverityScore,
  CLASS_MULTIPLIERS,
  TIER_WEIGHTS,
  NEGATION_WINDOW_BEFORE,
  NEGATION_WINDOW_AFTER,
} from '@/lib/methodology/scoring-config';
import type { ContentItem } from '@/lib/types';
import type {
  DocumentClass,
  DocumentScore,
  KeywordMatch,
  SeverityTier,
  SuppressedMatch,
} from '@/lib/types/scoring';
import { matchKeyword } from '@/lib/utils/keyword-match';

// --- Document classification ---

/** Federal Register document type → DocumentClass mapping. */
const FR_TYPE_MAP: Record<string, DocumentClass> = {
  'Presidential Document': 'executive_order',
  Rule: 'final_rule',
  'Proposed Rule': 'proposed_rule',
  Notice: 'notice',
};

/** Source-based classification heuristics (matched against agency or URL). */
const SOURCE_CLASS_PATTERNS: Array<{ pattern: string; cls: DocumentClass }> = [
  { pattern: 'supreme court', cls: 'court_opinion' },
  { pattern: 'scotus', cls: 'court_opinion' },
  { pattern: 'gao', cls: 'report' },
  { pattern: 'government accountability', cls: 'report' },
  { pattern: 'inspector general', cls: 'report' },
  { pattern: 'cbo', cls: 'report' },
  { pattern: 'congressional research', cls: 'report' },
  { pattern: 'department of defense', cls: 'press_release' },
  { pattern: 'dod', cls: 'press_release' },
  { pattern: 'white house', cls: 'press_release' },
];

export function classifyDocument(item: ContentItem): DocumentClass {
  // Use FR API type field when available
  if (item.type && FR_TYPE_MAP[item.type]) {
    return FR_TYPE_MAP[item.type];
  }

  // Check for executive orders / presidential memoranda in title
  const title = (item.title || '').toLowerCase();
  if (title.includes('executive order')) return 'executive_order';
  if (title.includes('presidential memorandum')) return 'presidential_memorandum';

  // Source-based inference from agency field
  const agency = (item.agency || '').toLowerCase();
  const link = (item.link || '').toLowerCase();
  for (const { pattern, cls } of SOURCE_CLASS_PATTERNS) {
    if (agency.includes(pattern) || link.includes(pattern)) {
      return cls;
    }
  }

  return 'unknown';
}

// --- Context extraction ---

function extractContext(text: string, keyword: string, radius: number = 50): string {
  const lower = text.toLowerCase();
  const kw = keyword.toLowerCase();
  const idx = lower.indexOf(kw);
  if (idx === -1) return text.slice(0, radius * 2);

  const start = Math.max(0, idx - radius);
  const end = Math.min(text.length, idx + kw.length + radius);
  let context = text.slice(start, end);
  if (start > 0) context = '...' + context;
  if (end < text.length) context = context + '...';
  return context;
}

// --- Suppression checking ---

function checkNegation(contentText: string, keyword: string): string | null {
  const lower = contentText.toLowerCase();
  const kwLower = keyword.toLowerCase();
  const kwIdx = lower.indexOf(kwLower);
  const windowStart = Math.max(0, kwIdx - NEGATION_WINDOW_BEFORE);
  const window = lower.slice(windowStart, kwIdx + kwLower.length + NEGATION_WINDOW_AFTER);

  for (const pattern of NEGATION_PATTERNS) {
    if (window.includes(pattern)) {
      return pattern;
    }
  }
  return null;
}

function checkSuppression(
  contentText: string,
  keyword: string,
  category: string,
): { suppressed: boolean; downweighted: boolean; rule: string; reason: string } {
  const rules = SUPPRESSION_RULES[category] || [];
  const lower = contentText.toLowerCase();

  for (const rule of rules) {
    if (rule.keyword.toLowerCase() !== keyword.toLowerCase()) continue;

    // Check full suppression
    for (const term of rule.suppress_if_any) {
      if (lower.includes(term.toLowerCase())) {
        return {
          suppressed: true,
          downweighted: false,
          rule: `suppress_if_any: ${rule.keyword}`,
          reason: `Co-occurring term "${term}" indicates non-concerning context`,
        };
      }
    }

    // Check downweight
    if (rule.downweight_if_any) {
      for (const term of rule.downweight_if_any) {
        if (lower.includes(term.toLowerCase())) {
          return {
            suppressed: false,
            downweighted: true,
            rule: `downweight_if_any: ${rule.keyword}`,
            reason: `Co-occurring term "${term}" suggests reduced severity`,
          };
        }
      }
    }
  }

  return { suppressed: false, downweighted: false, rule: '', reason: '' };
}

/** Downweight a tier by one level. */
function downweightTier(tier: SeverityTier): SeverityTier {
  if (tier === 'capture') return 'drift';
  if (tier === 'drift') return 'warning';
  return 'warning';
}

// --- Week computation ---

/** Get the Monday of the week for a given date. */
function getWeekOf(dateStr?: string): string {
  const d = dateStr ? new Date(dateStr) : new Date();
  const day = d.getUTCDay();
  // Shift Sunday (0) to 7 for Monday-based week
  const diff = day === 0 ? 6 : day - 1;
  d.setUTCDate(d.getUTCDate() - diff);
  return d.toISOString().split('T')[0];
}

// --- Core scoring ---

export function scoreDocument(item: ContentItem, category: string): DocumentScore {
  const rules = ASSESSMENT_RULES[category];
  const contentText = `${item.title || ''} ${item.summary || ''}`;
  const isHighAuthority = isHighAuthoritySource(item.agency);
  const docClass = classifyDocument(item);
  const classMultiplier = CLASS_MULTIPLIERS[docClass];

  const keywordMatches: KeywordMatch[] = [];
  const suppressedMatches: SuppressedMatch[] = [];

  if (rules?.keywords) {
    const tiers: SeverityTier[] = ['capture', 'drift', 'warning'];

    for (const tier of tiers) {
      const keywords = rules.keywords[tier] || [];
      for (const keyword of keywords) {
        if (!matchKeyword(contentText, keyword)) continue;

        // Check negation patterns first
        const negation = checkNegation(contentText, keyword);
        if (negation) {
          suppressedMatches.push({
            keyword,
            tier,
            rule: `negation: ${negation}`,
            reason: `Negation pattern "${negation}" found near keyword`,
          });
          continue;
        }

        // Check category-specific suppression
        const suppResult = checkSuppression(contentText, keyword, category);
        if (suppResult.suppressed) {
          suppressedMatches.push({
            keyword,
            tier,
            rule: suppResult.rule,
            reason: suppResult.reason,
          });
          continue;
        }

        // Apply downweight if applicable
        const effectiveTier = suppResult.downweighted ? downweightTier(tier) : tier;

        keywordMatches.push({
          keyword,
          tier: effectiveTier,
          weight: TIER_WEIGHTS[effectiveTier],
          context: extractContext(contentText, keyword),
        });
      }
    }
  }

  const captureCount = keywordMatches.filter((m) => m.tier === 'capture').length;
  const driftCount = keywordMatches.filter((m) => m.tier === 'drift').length;
  const warningCount = keywordMatches.filter((m) => m.tier === 'warning').length;

  const severityScore = computeSeverityScore(captureCount, driftCount, warningCount);
  const finalScore = severityScore * classMultiplier;

  const scoredAt = new Date().toISOString();
  const weekOf = getWeekOf(item.pubDate || item.date || scoredAt);

  return {
    url: item.link || '',
    documentId: undefined,
    category,
    severityScore,
    finalScore,
    captureCount,
    driftCount,
    warningCount,
    suppressedCount: suppressedMatches.length,
    documentClass: docClass,
    classMultiplier,
    isHighAuthority,
    matches: keywordMatches,
    suppressed: suppressedMatches,
    scoredAt,
    weekOf,
    title: item.title || '(untitled)',
    publishedAt: item.pubDate || item.date,
  };
}

export function scoreDocumentBatch(items: ContentItem[], category: string): DocumentScore[] {
  return items
    .filter((item) => !item.isError && !item.isWarning)
    .map((item) => scoreDocument(item, category));
}

/**
 * Upsert document scores into the database.
 * Uses URL for dedup since document IDs may not be available at scoring time.
 * No-op when DATABASE_URL is not configured.
 */
export async function storeDocumentScores(scores: DocumentScore[]): Promise<number> {
  if (!isDbAvailable()) return 0;
  if (scores.length === 0) return 0;

  const db = getDb();
  let stored = 0;

  // Filter out scores without URLs (can't dedup without them)
  const validScores = scores.filter((s) => s.url);

  for (const score of validScores) {
    try {
      await db
        .insert(documentScores)
        .values({
          documentId: score.documentId ?? null,
          url: score.url,
          category: score.category,
          severityScore: score.severityScore,
          finalScore: score.finalScore,
          captureCount: score.captureCount,
          driftCount: score.driftCount,
          warningCount: score.warningCount,
          suppressedCount: score.suppressedCount,
          documentClass: score.documentClass,
          classMultiplier: score.classMultiplier,
          isHighAuthority: score.isHighAuthority,
          matches: score.matches as unknown[],
          suppressed: score.suppressed as unknown[],
          scoredAt: new Date(score.scoredAt),
          weekOf: score.weekOf,
        })
        .onConflictDoUpdate({
          target: documentScores.url,
          set: {
            severityScore: sql`excluded.severity_score`,
            finalScore: sql`excluded.final_score`,
            captureCount: sql`excluded.capture_count`,
            driftCount: sql`excluded.drift_count`,
            warningCount: sql`excluded.warning_count`,
            suppressedCount: sql`excluded.suppressed_count`,
            documentClass: sql`excluded.document_class`,
            classMultiplier: sql`excluded.class_multiplier`,
            isHighAuthority: sql`excluded.is_high_authority`,
            matches: sql`excluded.matches`,
            suppressed: sql`excluded.suppressed`,
            scoredAt: sql`excluded.scored_at`,
            weekOf: sql`excluded.week_of`,
          },
        });
      stored++;
    } catch (err) {
      console.error(`Failed to store score for ${score.url}:`, err);
    }
  }

  return stored;
}
