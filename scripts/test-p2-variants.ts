/**
 * P2 Variant Testing Spike (#409)
 *
 * Tests P2 prompt variants against real documents from known-event and baseline weeks.
 * Measures whether week-level P1 context changes P2 assessment outcomes.
 *
 * Usage:
 *   source .env.local && tsx scripts/test-p2-variants.ts [options]
 *
 * Options:
 *   --dry-run         Show test plan without calling the API
 *   --variants A,B,C  Comma-separated list of variants to test (default: all)
 *   --limit N         Max test documents per group (default: unlimited)
 *   --verbose         Show full P2 reasoning for each assessment
 *   --event T1-2      Only test documents from a specific known event
 *   --baseline-only   Only run baseline FP control tests
 */

import { Pool } from 'pg';
import { PASS2_SYSTEM_PROMPT } from '@/lib/ai/prompts/document-review-pass2';
import { getProvider } from '@/lib/ai/provider';
import { parsePass2Response } from '@/lib/ai/schemas/document-review-response';
import { CATEGORIES } from '@/lib/data/categories';
import type { AIProvider } from '@/lib/types';
import { mapConcurrent } from '@/lib/utils/async';
import { ALL_KNOWN_EVENTS } from '@/lib/validation/known-events';

// Raw pg pool for ad-hoc queries
function getPool(): Pool {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL not set');
  }
  return new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_URL.includes('render.com')
      ? { rejectUnauthorized: false }
      : undefined,
  });
}

let pool: Pool;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type VariantId = 'A' | 'B-reduced' | 'B-full' | 'B-prior' | 'B-E';

interface TestDocument {
  url: string;
  title: string;
  content: string;
  category: string;
  weekOf: string;
  sourceType: string;
  // Current P1 results
  p1Relevant: boolean;
  p1Signals: string[];
  p1ErosionType: string;
  p1Confidence: number;
  // Current P2 results (null if no P2 yet)
  currentP2Assessment: string | null;
  currentP2Reasoning: string | null;
  // Classification
  group: 'event-miss' | 'event-hit' | 'baseline-routine' | 'baseline-concern';
  eventId?: string;
  eventDescription?: string;
}

interface WeekContext {
  category: string;
  weekOf: string;
  totalDocs: number;
  flaggedDocs: number;
  flagRate: number;
  baselineAvgFlagRate: number;
  // Top flagged peer titles (excluding the doc being assessed)
  flaggedPeers: Array<{ title: string; erosionType: string; confidence: number }>;
  // Prior week stats
  priorWeekTotalDocs: number;
  priorWeekFlaggedDocs: number;
  priorWeekFlagRate: number;
  priorWeekPeers: Array<{ title: string; erosionType: string; confidence: number }>;
}

interface VariantResult {
  variant: VariantId;
  assessment: string;
  confidence: number;
  reasoning: string;
  erosionType: string;
  tokensInput: number;
  tokensOutput: number;
  latencyMs: number;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const P2_MODEL = 'claude-sonnet-4-5-20250929';
const P2_CONCURRENCY = 2; // conservative for spike
const TEXT_EXCERPT_LENGTH = 4000;

const VARIANT_LABELS: Record<VariantId, string> = {
  A: 'Baseline (current prompt)',
  'B-reduced': 'Week counts only',
  'B-full': 'Counts + peer titles',
  'B-prior': 'B-full + prior week trajectory',
  'B-E': 'B-full + rhetoric framing',
};

const ALL_VARIANTS: VariantId[] = ['A', 'B-reduced', 'B-full', 'B-prior', 'B-E'];

// Known-event weeks where detection currently fails (from validate:detection output)
const MISSED_EVENT_CATEGORIES = new Set(
  ALL_KNOWN_EVENTS.filter(
    (e) => e.expectedMinStatus !== 'Stable' && e.signalDensity !== 'thin',
  ).map((e) => `${e.category}:${e.date}`),
);

// Biden 2022 baseline weeks for FP control
const BASELINE_WEEKS = [
  '2022-01-24',
  '2022-03-07',
  '2022-05-02',
  '2022-07-11',
  '2022-09-05',
  '2022-11-07',
];

// ---------------------------------------------------------------------------
// Args
// ---------------------------------------------------------------------------

interface Args {
  dryRun: boolean;
  variants: VariantId[];
  limit: number;
  verbose: boolean;
  eventFilter?: string;
  baselineOnly: boolean;
}

function parseArgs(): Args {
  const args = process.argv.slice(2);
  const result: Args = {
    dryRun: args.includes('--dry-run'),
    variants: ALL_VARIANTS,
    limit: 0,
    verbose: args.includes('--verbose'),
    baselineOnly: args.includes('--baseline-only'),
  };

  const variantIdx = args.indexOf('--variants');
  if (variantIdx >= 0 && args[variantIdx + 1]) {
    result.variants = args[variantIdx + 1].split(',') as VariantId[];
  }

  const limitIdx = args.indexOf('--limit');
  if (limitIdx >= 0 && args[limitIdx + 1]) {
    result.limit = parseInt(args[limitIdx + 1], 10);
  }

  const eventIdx = args.indexOf('--event');
  if (eventIdx >= 0 && args[eventIdx + 1]) {
    result.eventFilter = args[eventIdx + 1];
  }

  return result;
}

// ---------------------------------------------------------------------------
// Database queries
// ---------------------------------------------------------------------------

/** Get the Monday (week_of) for a given date */
function weekOfForDate(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00Z');
  const day = d.getUTCDay();
  const diff = day === 0 ? 6 : day - 1; // Monday = 0
  d.setUTCDate(d.getUTCDate() - diff);
  return d.toISOString().slice(0, 10);
}

async function queryRows(sql: string, params: unknown[] = []): Promise<Record<string, unknown>[]> {
  const result = await pool.query(sql, params);
  return result.rows;
}

async function fetchTestDocuments(args: Args): Promise<TestDocument[]> {
  const docs: TestDocument[] = [];

  // Collect event weeks to query
  const eventWeeks = new Map<
    string,
    { category: string; weekOf: string; eventId: string; desc: string }[]
  >();

  if (!args.baselineOnly) {
    const events = args.eventFilter
      ? ALL_KNOWN_EVENTS.filter((e) => e.id === args.eventFilter)
      : ALL_KNOWN_EVENTS.filter(
          (e) => e.expectedMinStatus !== 'Stable' || e.signalDensity === 'strong',
        );

    for (const e of events) {
      const weekOf = weekOfForDate(e.date);
      const key = `${e.category}:${weekOf}`;
      if (!eventWeeks.has(key)) eventWeeks.set(key, []);
      eventWeeks
        .get(key)!
        .push({ category: e.category, weekOf, eventId: e.id, desc: e.description });
    }

    // Query P1-flagged docs with P2 results for event weeks
    for (const entries of Array.from(eventWeeks.values())) {
      const { category, weekOf, eventId, desc } = entries[0];
      const rows = await queryRows(
        `
        SELECT
          p1.url,
          COALESCE(d.title, p1.url) AS title,
          COALESCE(d.content, '') AS content,
          COALESCE(d.source_type, 'unknown') AS source_type,
          p1.relevant AS p1_relevant,
          COALESCE(p1.signals, '[]'::jsonb) AS p1_signals,
          COALESCE(p1.erosion_type, 'unclear') AS p1_erosion_type,
          COALESCE(p1.confidence, 0) AS p1_confidence,
          p2.assessment AS p2_assessment,
          p2.reasoning AS p2_reasoning
        FROM ai_document_assessments p1
        LEFT JOIN documents d ON d.url = p1.url AND d.category = p1.category
        LEFT JOIN ai_document_assessments p2
          ON p2.url = p1.url AND p2.category = p1.category AND p2.pass = 2
        WHERE p1.category = $1
          AND p1.pass = 1
          AND p1.relevant = true
          AND p1.week_of >= $2::date
          AND p1.week_of < ($2::date + INTERVAL '7 days')
        ORDER BY p1.confidence DESC
      `,
        [category, weekOf],
      );

      for (const row of rows) {
        const p2Assessment = row.p2_assessment as string | null;
        const isConcerning =
          p2Assessment === 'potentially_concerning' || p2Assessment === 'clearly_concerning';
        const signals = row.p1_signals;
        docs.push({
          url: row.url as string,
          title: row.title as string,
          content: row.content as string,
          category,
          weekOf,
          sourceType: row.source_type as string,
          p1Relevant: row.p1_relevant as boolean,
          p1Signals: Array.isArray(signals) ? signals : [],
          p1ErosionType: row.p1_erosion_type as string,
          p1Confidence: row.p1_confidence as number,
          currentP2Assessment: p2Assessment,
          currentP2Reasoning: row.p2_reasoning as string | null,
          group: isConcerning ? 'event-hit' : 'event-miss',
          eventId,
          eventDescription: desc,
        });
      }
    }
  }

  // Baseline FP controls — P1-flagged docs in Biden 2022 where P2 said routine
  for (const weekOf of BASELINE_WEEKS) {
    const rows = await queryRows(
      `
      SELECT
        p1.url,
        COALESCE(d.title, p1.url) AS title,
        COALESCE(d.content, '') AS content,
        COALESCE(d.source_type, 'unknown') AS source_type,
        p1.category,
        COALESCE(p1.signals, '[]'::jsonb) AS p1_signals,
        COALESCE(p1.erosion_type, 'unclear') AS p1_erosion_type,
        COALESCE(p1.confidence, 0) AS p1_confidence,
        p2.assessment AS p2_assessment,
        p2.reasoning AS p2_reasoning
      FROM ai_document_assessments p1
      LEFT JOIN documents d ON d.url = p1.url AND d.category = p1.category
      LEFT JOIN ai_document_assessments p2
        ON p2.url = p1.url AND p2.category = p1.category AND p2.pass = 2
      WHERE p1.pass = 1
        AND p1.relevant = true
        AND p1.week_of >= $1::date
        AND p1.week_of < ($1::date + INTERVAL '7 days')
      ORDER BY p1.confidence DESC
      LIMIT 10
    `,
      [weekOf],
    );

    for (const row of rows) {
      const p2Assessment = row.p2_assessment as string | null;
      const isConcerning =
        p2Assessment === 'potentially_concerning' || p2Assessment === 'clearly_concerning';
      const signals = row.p1_signals;
      docs.push({
        url: row.url as string,
        title: row.title as string,
        content: row.content as string,
        category: row.category as string,
        weekOf,
        sourceType: row.source_type as string,
        p1Relevant: true,
        p1Signals: Array.isArray(signals) ? signals : [],
        p1ErosionType: row.p1_erosion_type as string,
        p1Confidence: row.p1_confidence as number,
        currentP2Assessment: p2Assessment,
        currentP2Reasoning: row.p2_reasoning as string | null,
        group: isConcerning ? 'baseline-concern' : 'baseline-routine',
      });
    }
  }

  // Apply limit per group
  if (args.limit > 0) {
    const grouped = new Map<string, TestDocument[]>();
    for (const doc of docs) {
      if (!grouped.has(doc.group)) grouped.set(doc.group, []);
      grouped.get(doc.group)!.push(doc);
    }
    const limited: TestDocument[] = [];
    for (const group of Array.from(grouped.values())) {
      limited.push(...group.slice(0, args.limit));
    }
    return limited;
  }

  return docs;
}

async function fetchWeekContext(
  category: string,
  weekOf: string,
  excludeUrl?: string,
): Promise<WeekContext> {
  // Current week P1 stats
  const weekStats = await queryRows(
    `
    SELECT
      COUNT(*)::text AS total,
      COUNT(*) FILTER (WHERE relevant = true)::text AS flagged
    FROM ai_document_assessments
    WHERE category = $1
      AND pass = 1
      AND week_of >= $2::date
      AND week_of < ($2::date + INTERVAL '7 days')
  `,
    [category, weekOf],
  );

  const total = parseInt((weekStats[0]?.total as string) || '0', 10);
  const flagged = parseInt((weekStats[0]?.flagged as string) || '0', 10);

  // Top flagged peers (excluding the doc being assessed)
  const peerParams: unknown[] = [category, weekOf];
  let excludeClause = '';
  if (excludeUrl) {
    excludeClause = 'AND p1.url != $3';
    peerParams.push(excludeUrl);
  }
  const peerRows = await queryRows(
    `
    SELECT
      p1.url,
      COALESCE(d.title, p1.url) AS title,
      COALESCE(p1.erosion_type, 'unclear') AS erosion_type,
      COALESCE(p1.confidence, 0) AS confidence
    FROM ai_document_assessments p1
    LEFT JOIN documents d ON d.url = p1.url AND d.category = p1.category
    WHERE p1.category = $1
      AND p1.pass = 1
      AND p1.relevant = true
      AND p1.week_of >= $2::date
      AND p1.week_of < ($2::date + INTERVAL '7 days')
      ${excludeClause}
    ORDER BY p1.confidence DESC
    LIMIT 5
  `,
    peerParams,
  );

  // Prior week P1 stats
  const priorWeekOf = new Date(new Date(weekOf + 'T00:00:00Z').getTime() - 7 * 86400000)
    .toISOString()
    .slice(0, 10);

  const priorStats = await queryRows(
    `
    SELECT
      COUNT(*)::text AS total,
      COUNT(*) FILTER (WHERE relevant = true)::text AS flagged
    FROM ai_document_assessments
    WHERE category = $1
      AND pass = 1
      AND week_of >= $2::date
      AND week_of < ($2::date + INTERVAL '7 days')
  `,
    [category, priorWeekOf],
  );

  const priorTotal = parseInt((priorStats[0]?.total as string) || '0', 10);
  const priorFlagged = parseInt((priorStats[0]?.flagged as string) || '0', 10);

  // Prior week flagged peer titles
  const priorPeerRows = await queryRows(
    `
    SELECT
      p1.url,
      COALESCE(d.title, p1.url) AS title,
      COALESCE(p1.erosion_type, 'unclear') AS erosion_type,
      COALESCE(p1.confidence, 0) AS confidence
    FROM ai_document_assessments p1
    LEFT JOIN documents d ON d.url = p1.url AND d.category = p1.category
    WHERE p1.category = $1
      AND p1.pass = 1
      AND p1.relevant = true
      AND p1.week_of >= $2::date
      AND p1.week_of < ($2::date + INTERVAL '7 days')
    ORDER BY p1.confidence DESC
    LIMIT 5
  `,
    [category, priorWeekOf],
  );

  // Baseline avg flag rate (Biden 2022)
  const baselineStats = await queryRows(
    `
    SELECT AVG(flag_rate)::text AS avg_flag_rate FROM (
      SELECT
        week_of,
        COUNT(*) FILTER (WHERE relevant = true)::float / NULLIF(COUNT(*)::float, 0) AS flag_rate
      FROM ai_document_assessments
      WHERE category = $1
        AND pass = 1
        AND week_of >= '2022-01-01'
        AND week_of <= '2023-01-01'
      GROUP BY week_of
    ) sub
  `,
    [category],
  );

  return {
    category,
    weekOf,
    totalDocs: total,
    flaggedDocs: flagged,
    flagRate: total > 0 ? flagged / total : 0,
    baselineAvgFlagRate: parseFloat((baselineStats[0]?.avg_flag_rate as string) || '0'),
    flaggedPeers: peerRows.map((r) => ({
      title: r.title as string,
      erosionType: r.erosion_type as string,
      confidence: r.confidence as number,
    })),
    priorWeekTotalDocs: priorTotal,
    priorWeekFlaggedDocs: priorFlagged,
    priorWeekFlagRate: priorTotal > 0 ? priorFlagged / priorTotal : 0,
    priorWeekPeers: priorPeerRows.map((r) => ({
      title: r.title as string,
      erosionType: r.erosion_type as string,
      confidence: r.confidence as number,
    })),
  };
}

// ---------------------------------------------------------------------------
// Prompt builders
// ---------------------------------------------------------------------------

function buildErosionFramework(): string {
  return [
    'Erosion type framework:',
    '  - formal_override: explicit legal/policy changes that remove protections',
    '  - operational_hollowing: staffing cuts, budget reductions, unfilled positions that degrade capacity',
    '  - noncompliance_refusal: ignoring court orders, defying oversight, refusing information requests',
    '  - routine: normal administrative activity with no erosion signal',
    '  - unclear: insufficient information to classify',
  ].join('\n');
}

function buildResponseSchema(): string {
  return [
    'Respond with JSON:',
    '{',
    '  "assessment": "routine" | "novel_not_concerning" | "potentially_concerning" | "clearly_concerning",',
    '  "confidence": number (0-1),',
    '  "reasoning": string (2-3 sentences explaining your assessment),',
    '  "comparativeContext": string (how does this compare to normal governance?),',
    '  "citedPassages": string[] (direct quotes from the document supporting your assessment),',
    '  "erosionType": "formal_override" | "operational_hollowing" | "noncompliance_refusal" | "routine" | "unclear",',
    '  "counterArguments": string[] (reasons this might NOT be concerning)',
    '}',
  ].join('\n');
}

function getCategoryDescription(category: string): string {
  return CATEGORIES.find((c) => c.key === category)?.description ?? category;
}

function getCategoryExpertDescription(category: string): string {
  return CATEGORIES.find((c) => c.key === category)?.expertDescription ?? category;
}

function buildVariantPrompt(variant: VariantId, doc: TestDocument, ctx: WeekContext): string {
  const textExcerpt = doc.content
    ? doc.content.slice(0, TEXT_EXCERPT_LENGTH)
    : '(full text not available)';

  const catDesc = getCategoryDescription(doc.category);
  const expertDesc = getCategoryExpertDescription(doc.category);

  const p1Line = doc.p1Relevant
    ? `Pass 1 flagged this document with signals: ${doc.p1Signals.join(', ') || '(none)'}`
    : `Pass 1 assessed this document as routine. Reviewing because ${ctx.flaggedDocs}/${ctx.totalDocs} peers were flagged this week.`;

  // --- Variant A: current prompt (no context) ---
  if (variant === 'A') {
    return [
      `Category concern: ${catDesc}`,
      '',
      `Pass 1 flagged this document with signals: ${doc.p1Signals.join(', ') || '(none)'}`,
      `Pass 1 erosion type: ${doc.p1ErosionType}`,
      '',
      `Document title: ${doc.title}`,
      '',
      'Document text (excerpt):',
      textExcerpt,
      '',
      buildErosionFramework(),
      '',
      buildResponseSchema(),
    ].join('\n');
  }

  // --- Build week context block (shared by B-reduced, B-full, B-prior, B-E) ---
  const flagPct = (ctx.flagRate * 100).toFixed(1);
  const baselinePct = (ctx.baselineAvgFlagRate * 100).toFixed(1);

  const contextLines = [
    `Category context for ${CATEGORIES.find((c) => c.key === doc.category)?.title ?? doc.category}:`,
    `  Institutional framing: ${expertDesc}`,
    `  This week: ${ctx.totalDocs} documents assessed, ${ctx.flaggedDocs} flagged by Pass 1 (${flagPct}%)`,
    `  Baseline average flag rate: ${baselinePct}%`,
  ];

  // B-reduced: counts only, no peer titles
  if (variant === 'B-reduced') {
    return [
      ...contextLines,
      '',
      p1Line,
      `Pass 1 erosion type: ${doc.p1ErosionType}`,
      '',
      `Document title: ${doc.title}`,
      '',
      'Document text (excerpt):',
      textExcerpt,
      '',
      buildErosionFramework(),
      '',
      buildResponseSchema(),
    ].join('\n');
  }

  // B-full and above: add peer titles
  if (ctx.flaggedPeers.length > 0) {
    contextLines.push('  Notable flagged peers this week:');
    for (const peer of ctx.flaggedPeers.slice(0, 5)) {
      contextLines.push(`    - "${peer.title}" (${peer.erosionType})`);
    }
  }

  // B-prior and B-E: add prior week context with peer titles
  if (variant === 'B-prior' || variant === 'B-E') {
    const priorPct = (ctx.priorWeekFlagRate * 100).toFixed(1);
    contextLines.push(
      `  Prior week: ${ctx.priorWeekTotalDocs} documents, ${ctx.priorWeekFlaggedDocs} flagged (${priorPct}%)`,
    );

    // Prior week peer titles — the connective tissue for off-by-one events
    if (ctx.priorWeekPeers.length > 0) {
      contextLines.push('  Notable flagged peers last week:');
      for (const peer of ctx.priorWeekPeers.slice(0, 5)) {
        contextLines.push(`    - "${peer.title}" (${peer.erosionType})`);
      }
    }

    // Trajectory label
    if (ctx.priorWeekFlagRate === 0 && ctx.flagRate === 0) {
      contextLines.push('  Trajectory: quiet (no flags either week)');
    } else if (ctx.flagRate > ctx.priorWeekFlagRate * 1.5) {
      contextLines.push('  Trajectory: sharp escalation');
    } else if (ctx.flagRate > ctx.priorWeekFlagRate) {
      contextLines.push('  Trajectory: escalating');
    } else if (ctx.flagRate < ctx.priorWeekFlagRate * 0.5) {
      contextLines.push('  Trajectory: declining');
    } else {
      contextLines.push('  Trajectory: stable');
    }
  }

  const parts = [
    ...contextLines,
    '',
    p1Line,
    `Pass 1 erosion type: ${doc.p1ErosionType}`,
    '',
    `Document title: ${doc.title}`,
    '',
    'Document text (excerpt):',
    textExcerpt,
    '',
  ];

  // B-E: add rhetoric framing for CREC / floor speeches
  if (variant === 'B-E') {
    const isCREC =
      doc.sourceType === 'crec' ||
      doc.sourceType === 'govinfo_crec' ||
      doc.title.match(/^(FLOOR SPEECH|MORNING BUSINESS|LEGISLATIVE SESSION)/i) ||
      doc.url.includes('/CREC-');

    if (isCREC) {
      parts.push(
        'Note: This is a congressional floor speech. Congressional rhetoric is analytically',
        'significant because it reflects how legislators characterize government actions.',
        'Assess whether the rhetoric signals institutional pressure, policy intent, or erosion',
        'framing — not just whether a formal government action is described. A floor speech',
        'denouncing an executive action IS evidence of institutional conflict.',
        '',
      );
    }
  }

  parts.push(buildErosionFramework(), '', buildResponseSchema());
  return parts.join('\n');
}

// ---------------------------------------------------------------------------
// P2 assessment runner
// ---------------------------------------------------------------------------

async function runP2Variant(
  provider: AIProvider,
  variant: VariantId,
  doc: TestDocument,
  ctx: WeekContext,
): Promise<VariantResult | null> {
  const prompt = buildVariantPrompt(variant, doc, ctx);
  const start = Date.now();

  try {
    const result = await provider.complete(prompt, {
      systemPrompt: PASS2_SYSTEM_PROMPT,
      temperature: 0,
      model: P2_MODEL,
      maxTokens: 2048,
    });

    const parsed = parsePass2Response(result.content);
    if (!parsed) {
      console.warn(`[spike] Parse failed for ${variant} on ${doc.title.slice(0, 60)}`);
      return null;
    }

    return {
      variant,
      assessment: parsed.assessment,
      confidence: parsed.confidence,
      reasoning: parsed.reasoning,
      erosionType: parsed.erosionType,
      tokensInput: result.tokensUsed.input,
      tokensOutput: result.tokensUsed.output,
      latencyMs: Date.now() - start,
    };
  } catch (err) {
    console.warn(
      `[spike] ${variant} failed for ${doc.title.slice(0, 60)}: ${(err as Error).message}`,
    );
    return null;
  }
}

// ---------------------------------------------------------------------------
// Output formatting
// ---------------------------------------------------------------------------

const DIVIDER = '='.repeat(90);
const SECTION = '-'.repeat(70);

function assessmentSymbol(a: string | null): string {
  if (!a) return '  -  ';
  if (a === 'clearly_concerning') return ' CC  ';
  if (a === 'potentially_concerning') return ' PC  ';
  if (a === 'novel_not_concerning') return ' NNC ';
  if (a === 'routine') return ' RTN ';
  return ` ${a.slice(0, 3).toUpperCase()} `;
}

function assessmentChanged(current: string | null, variant: string): boolean {
  if (!current) return true;
  const isConcerningNow = current === 'potentially_concerning' || current === 'clearly_concerning';
  const isConcerningVariant =
    variant === 'potentially_concerning' || variant === 'clearly_concerning';
  return isConcerningNow !== isConcerningVariant;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const args = parseArgs();
  pool = getPool();

  console.log(DIVIDER);
  console.log('P2 VARIANT TESTING SPIKE');
  console.log(DIVIDER);
  console.log(`Variants: ${args.variants.join(', ')}`);
  console.log(`Mode: ${args.dryRun ? 'DRY RUN' : 'LIVE'}`);
  if (args.limit) console.log(`Limit: ${args.limit} per group`);
  if (args.eventFilter) console.log(`Event filter: ${args.eventFilter}`);
  console.log('');

  // --- Gather test documents ---
  console.log('Fetching test documents from database...');
  const testDocs = await fetchTestDocuments(args);

  const groups = {
    'event-miss': testDocs.filter((d) => d.group === 'event-miss'),
    'event-hit': testDocs.filter((d) => d.group === 'event-hit'),
    'baseline-routine': testDocs.filter((d) => d.group === 'baseline-routine'),
    'baseline-concern': testDocs.filter((d) => d.group === 'baseline-concern'),
  };

  console.log(`\nTest document breakdown:`);
  console.log(`  Event misses (P1 flagged, P2 routine):   ${groups['event-miss'].length}`);
  console.log(`  Event hits (P1 flagged, P2 concerning):  ${groups['event-hit'].length}`);
  console.log(`  Baseline routines (FP control):          ${groups['baseline-routine'].length}`);
  console.log(`  Baseline concerns:                       ${groups['baseline-concern'].length}`);
  console.log(
    `  Total: ${testDocs.length} documents × ${args.variants.length} variants = ${testDocs.length * args.variants.length} P2 calls`,
  );

  // Cost estimate
  const avgTokens = 3000; // rough estimate per P2 call
  const costPerCall = (avgTokens * 3 + 800) / 1_000_000; // Sonnet pricing rough
  const totalCost = testDocs.length * args.variants.length * costPerCall;
  console.log(`  Estimated cost: ~$${totalCost.toFixed(2)}`);

  if (args.dryRun) {
    console.log(`\n${SECTION}`);
    console.log('DRY RUN — Test plan (no API calls)');
    console.log(SECTION);

    for (const [groupName, groupDocs] of Object.entries(groups)) {
      if (groupDocs.length === 0) continue;
      console.log(`\n  ${groupName} (${groupDocs.length} docs):`);
      for (const doc of groupDocs) {
        const event = doc.eventId ? ` [${doc.eventId}]` : '';
        const p2 = doc.currentP2Assessment ? ` → P2: ${doc.currentP2Assessment}` : ' → no P2';
        console.log(
          `    ${doc.category} / ${doc.weekOf}${event}: "${doc.title.slice(0, 70)}"${p2}`,
        );
      }
    }

    // Show sample prompt for each variant
    if (testDocs.length > 0) {
      const sampleDoc = groups['event-miss'][0] ?? testDocs[0];
      const sampleCtx = await fetchWeekContext(sampleDoc.category, sampleDoc.weekOf, sampleDoc.url);

      for (const variant of args.variants) {
        console.log(`\n${SECTION}`);
        console.log(`SAMPLE PROMPT — Variant ${variant} (${VARIANT_LABELS[variant]})`);
        console.log(SECTION);
        const prompt = buildVariantPrompt(variant, sampleDoc, sampleCtx);
        // Show first 2000 chars of prompt
        console.log(prompt.slice(0, 2000));
        if (prompt.length > 2000) console.log(`\n... (${prompt.length - 2000} more chars)`);
      }
    }

    process.exit(0);
  }

  // --- Run P2 with each variant ---
  const provider = getProvider('anthropic');
  if (!provider.isAvailable()) {
    console.error('Anthropic provider not available. Set ANTHROPIC_API_KEY.');
    process.exit(1);
  }

  // Cache week contexts
  const contextCache = new Map<string, WeekContext>();
  async function getContext(doc: TestDocument): Promise<WeekContext> {
    const key = `${doc.category}:${doc.weekOf}:${doc.url}`;
    if (!contextCache.has(key)) {
      contextCache.set(key, await fetchWeekContext(doc.category, doc.weekOf, doc.url));
    }
    return contextCache.get(key)!;
  }

  // Results: Map<docUrl, Map<variant, result>>
  const results = new Map<
    string,
    { doc: TestDocument; variants: Map<VariantId, VariantResult | null> }
  >();

  let completed = 0;
  const totalCalls = testDocs.length * args.variants.length;

  // Process documents sequentially, variants in parallel per doc
  for (const doc of testDocs) {
    const ctx = await getContext(doc);
    const docKey = `${doc.url}:${doc.category}`;

    const variantResults = await mapConcurrent(args.variants, P2_CONCURRENCY, async (variant) => {
      const result = await runP2Variant(provider, variant, doc, ctx);
      completed++;
      if (completed % 10 === 0) {
        process.stdout.write(`\r  Progress: ${completed}/${totalCalls} calls`);
      }
      return { variant, result };
    });

    const variantMap = new Map<VariantId, VariantResult | null>();
    for (const { variant, result } of variantResults) {
      variantMap.set(variant, result);
    }
    results.set(docKey, { doc, variants: variantMap });
  }

  console.log(`\r  Progress: ${totalCalls}/${totalCalls} calls — done\n`);

  // --- Output results ---
  console.log(DIVIDER);
  console.log('RESULTS');
  console.log(DIVIDER);

  // Header
  const variantCols = args.variants.map((v) => v.padEnd(5)).join(' | ');
  console.log(`\n${'Doc'.padEnd(55)} | Current | ${variantCols} | Flipped?`);
  console.log('-'.repeat(55 + 12 + args.variants.length * 8 + 12));

  // Track flips for summary
  const flips = {
    eventMissToHit: new Map<VariantId, number>(),
    eventHitToMiss: new Map<VariantId, number>(),
    baselineRoutineToFP: new Map<VariantId, number>(),
  };
  for (const v of args.variants) {
    flips.eventMissToHit.set(v, 0);
    flips.eventHitToMiss.set(v, 0);
    flips.baselineRoutineToFP.set(v, 0);
  }

  // Print by group
  for (const groupName of [
    'event-miss',
    'event-hit',
    'baseline-routine',
    'baseline-concern',
  ] as const) {
    const groupDocs = [...results.values()].filter((r) => r.doc.group === groupName);
    if (groupDocs.length === 0) continue;

    console.log(`\n  --- ${groupName} (${groupDocs.length} docs) ---`);

    for (const { doc, variants } of groupDocs) {
      const label = `${doc.eventId ?? 'BL'} ${doc.category.slice(0, 12).padEnd(12)} ${doc.title.slice(0, 35).padEnd(35)}`;
      const currentCol = assessmentSymbol(doc.currentP2Assessment);
      const variantCols = args.variants
        .map((v) => assessmentSymbol(variants.get(v)?.assessment ?? null))
        .join(' | ');

      // Check for meaningful flips
      const flipMarkers: string[] = [];
      for (const v of args.variants) {
        const vResult = variants.get(v);
        if (!vResult) continue;

        if (groupName === 'event-miss') {
          const flipped =
            vResult.assessment === 'potentially_concerning' ||
            vResult.assessment === 'clearly_concerning';
          if (flipped) {
            flipMarkers.push(`${v}+`);
            flips.eventMissToHit.set(v, (flips.eventMissToHit.get(v) ?? 0) + 1);
          }
        } else if (groupName === 'event-hit') {
          const regressed =
            vResult.assessment === 'routine' || vResult.assessment === 'novel_not_concerning';
          if (regressed) {
            flipMarkers.push(`${v}-`);
            flips.eventHitToMiss.set(v, (flips.eventHitToMiss.get(v) ?? 0) + 1);
          }
        } else if (groupName === 'baseline-routine') {
          const falsePosVariant =
            vResult.assessment === 'potentially_concerning' ||
            vResult.assessment === 'clearly_concerning';
          if (falsePosVariant) {
            flipMarkers.push(`${v}!`);
            flips.baselineRoutineToFP.set(v, (flips.baselineRoutineToFP.get(v) ?? 0) + 1);
          }
        }
      }

      console.log(`${label} | ${currentCol} | ${variantCols} | ${flipMarkers.join(' ')}`);

      // Verbose: show reasoning for flipped assessments
      if (args.verbose && flipMarkers.length > 0) {
        for (const v of args.variants) {
          const vResult = variants.get(v);
          if (vResult && assessmentChanged(doc.currentP2Assessment, vResult.assessment)) {
            console.log(`    [${v}] ${vResult.reasoning.slice(0, 200)}`);
          }
        }
      }
    }
  }

  // --- Summary table ---
  console.log(`\n${DIVIDER}`);
  console.log('VARIANT COMPARISON SUMMARY');
  console.log(DIVIDER);

  const eventMissTotal = groups['event-miss'].length;
  const eventHitTotal = groups['event-hit'].length;
  const baselineRoutineTotal = groups['baseline-routine'].length;

  console.log(
    `\n${'Variant'.padEnd(12)} | ${'Misses→Hits'.padEnd(14)} | ${'Regressions'.padEnd(14)} | ${'Baseline FPs'.padEnd(14)} | Net`,
  );
  console.log('-'.repeat(72));

  for (const v of args.variants) {
    const gained = flips.eventMissToHit.get(v) ?? 0;
    const regressed = flips.eventHitToMiss.get(v) ?? 0;
    const fps = flips.baselineRoutineToFP.get(v) ?? 0;
    const net = gained - regressed - fps;

    console.log(
      `${v.padEnd(12)} | ${`${gained}/${eventMissTotal}`.padEnd(14)} | ${`${regressed}/${eventHitTotal}`.padEnd(14)} | ${`${fps}/${baselineRoutineTotal}`.padEnd(14)} | ${net >= 0 ? '+' : ''}${net}`,
    );
  }

  // --- Token / cost summary ---
  console.log(`\n${SECTION}`);
  console.log('TOKEN USAGE');
  console.log(SECTION);

  for (const v of args.variants) {
    let totalIn = 0;
    let totalOut = 0;
    let count = 0;
    for (const { variants } of Array.from(results.values())) {
      const r = variants.get(v);
      if (r) {
        totalIn += r.tokensInput;
        totalOut += r.tokensOutput;
        count++;
      }
    }
    if (count > 0) {
      console.log(
        `${v.padEnd(12)}: avg ${Math.round(totalIn / count)} in / ${Math.round(totalOut / count)} out (${count} calls)`,
      );
    }
  }

  console.log(`\n${DIVIDER}`);
  console.log('SPIKE COMPLETE');
  console.log(DIVIDER);
}

main()
  .catch(console.error)
  .finally(() => pool?.end());
