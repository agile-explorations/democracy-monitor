/**
 * Validate narrative prompts against production data.
 *
 * Usage: DATABASE_URL=<prod> ANTHROPIC_API_KEY=<key> OPENAI_API_KEY=<key> \
 *        npx tsx scripts/validate-narratives.ts [--category <key>] [--week <YYYY-MM-DD>] [--type <all|category|weekly|term>]
 *
 * Generates narratives without storing them and checks spec acceptance criteria.
 */
import { and, eq } from 'drizzle-orm';
import { getProvider } from '../lib/ai/provider';
import { T2_INAUGURATION } from '../lib/data/analysis-periods';
import { CATEGORIES } from '../lib/data/categories';
import { getDb } from '../lib/db';
import { weeklyAggregates } from '../lib/db/schema';
import {
  isElevatedStatus,
  needsMultiPass,
  buildStableTemplate,
} from '../lib/services/narrative-generation-service';
import {
  generateMultiPassNarrative,
  generateSinglePassNarrative,
} from '../lib/services/narrative-multipass';
import {
  computePreviousWeekTotalDocs,
  toNarrativeLayerData,
} from '../lib/services/narrative-pipeline';
import {
  buildWeeklySummaryPrompt,
  buildTermSummaryPrompt,
} from '../lib/services/narrative-prompts';
import {
  enrichCategoryData,
  getPreviousWeekNarrative,
  getTermStatistics,
  getTrajectoryTable,
} from '../lib/services/narrative-queries';
import { getSignificantWeeks } from '../lib/services/significant-weeks-service';
import { getOverviewExcerpts } from '../lib/services/term-summary-queries';
import type { NarrativeLayerData, TermSummaryInput, WeeklySummaryInput } from '../lib/types';
import type { ConcernAssessment, StructuralScore } from '../lib/types/structural';

const SUMMARY_MODEL = 'claude-opus-4-6';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function wordCount(text: string): number {
  return text.split(/\s+/).filter(Boolean).length;
}

function parseArgs(): { category?: string; week?: string; type: string; output?: string } {
  const args = process.argv.slice(2);
  let category: string | undefined;
  let week: string | undefined;
  let type = 'all';
  let output: string | undefined;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--category' && args[i + 1]) category = args[++i];
    if (args[i] === '--week' && args[i + 1]) week = args[++i];
    if (args[i] === '--type' && args[i + 1]) type = args[++i];
    if (args[i] === '--output' && args[i + 1]) output = args[++i];
  }
  return { category, week, type, output };
}

/** Accumulates narrative text for file output. */
const narrativeOutput: string[] = [];

interface CheckResult {
  name: string;
  pass: boolean;
  detail: string;
}

function check(name: string, pass: boolean, detail: string): CheckResult {
  const icon = pass ? '✓' : '✗';
  console.log(`  ${icon} ${name}: ${detail}`);
  return { name, pass, detail };
}

/** Get first substantive paragraphs (skip headers, disclaimers, short lines). */
function firstSubstantiveParagraphs(text: string, count = 3): string {
  const paras = text.split(/\n\n+/).filter(Boolean);
  const substantive = paras.filter((p) => p.length > 60 && !p.startsWith('#'));
  return substantive.slice(0, count).join('\n\n');
}

// ---------------------------------------------------------------------------
// Generation (dry-run — no storage)
// ---------------------------------------------------------------------------

async function generateSinglePass(prompt: string, maxTokens: number): Promise<string> {
  const claude = getProvider('anthropic');
  if (!claude.isAvailable()) throw new Error('Anthropic API key not configured');
  const result = await claude.complete(prompt, {
    model: SUMMARY_MODEL,
    maxTokens,
    systemPrompt:
      'You are an expert analyst for a democratic institution monitoring system. ' +
      'You produce rigorous, evidence-based synthesis.',
  });
  return result.content;
}

// ---------------------------------------------------------------------------
// Category-week validation
// ---------------------------------------------------------------------------

async function validateCategoryWeek(category: string, weekOf: string): Promise<CheckResult[]> {
  console.log(`\n--- Category-week: ${category} ${weekOf} ---`);
  const db = getDb();
  const rows = await db
    .select()
    .from(weeklyAggregates)
    .where(and(eq(weeklyAggregates.category, category), eq(weeklyAggregates.weekOf, weekOf)))
    .limit(1);

  if (!rows[0]) {
    console.log('  No weekly_aggregates row found — skipping');
    return [];
  }

  const cat = CATEGORIES.find((c) => c.key === category);
  if (!cat) {
    console.log('  Unknown category — skipping');
    return [];
  }

  const data = toNarrativeLayerData(cat, rows[0]);
  const status = data.convergenceDetail?.status ?? 'Stable';
  const docCount = data.structuralDetail ? (rows[0].documentCount ?? 0) : 0;
  const totalDocs = rows[0].documentCount ?? 0;
  console.log(`  Status: ${status}, documents: ${totalDocs}`);

  if (!isElevatedStatus(data.convergenceDetail)) {
    console.log('  Stable — skipping (no AI narrative)');
    return [];
  }

  await enrichCategoryData(data);
  const hasP2Docs = (data.documentContext?.length ?? 0) > 0;
  const hasL2 = data.aiScore !== null && data.aiDetail !== null;
  const substantive = hasP2Docs || hasL2;

  console.log(
    `  P2 docs: ${data.documentContext?.length ?? 0}, L2 available: ${hasL2}, substantive: ${substantive}`,
  );

  const useMultiPass = needsMultiPass(data.convergenceDetail);
  let expert: string;
  let pub: string;

  if (useMultiPass) {
    console.log(
      '  Generating 3-pass narrative (Claude draft → GPT-4o feedback → Claude revision)...',
    );
    const result = await generateMultiPassNarrative(data);
    console.log(
      `  Pass 1 draft — Expert: ${wordCount(result.expertDraft)} words, Public: ${wordCount(result.publicDraft)} words`,
    );
    const feedbackHasCriterionG =
      result.feedback.toLowerCase().includes('(g)') ||
      result.feedback.toLowerCase().includes('why this might matter');
    console.log(
      `  Pass 2 feedback — Criterion (g) flagged: ${feedbackHasCriterionG ? 'YES' : 'no'}`,
    );
    expert = result.expert;
    pub = result.public;
    console.log(
      `  Pass 3 final — Expert: ${wordCount(expert)} words, Public: ${wordCount(pub)} words`,
    );
    narrativeOutput.push(
      `${'='.repeat(80)}`,
      `CATEGORY-WEEK: ${category} ${weekOf}`,
      `Status: ${status} | Docs: ${totalDocs} | P2: ${data.documentContext?.length ?? 0} | L2: ${hasL2} | Pipeline: 3-pass`,
      `${'='.repeat(80)}`,
      '',
      `--- PASS 1 DRAFT: EXPERT (${wordCount(result.expertDraft)} words) ---`,
      result.expertDraft,
      '',
      `--- PASS 1 DRAFT: PUBLIC (${wordCount(result.publicDraft)} words) ---`,
      result.publicDraft,
      '',
      `--- PASS 2 FEEDBACK ---`,
      result.feedback,
      '',
      `--- PASS 3 FINAL: EXPERT (${wordCount(expert)} words) ---`,
      expert,
      '',
      `--- PASS 3 FINAL: PUBLIC (${wordCount(pub)} words) ---`,
      pub,
      '',
      '',
    );
  } else {
    console.log('  Generating single-pass narrative (Claude draft only, Elevated status)...');
    const result = await generateSinglePassNarrative(data);
    expert = result.expert;
    pub = result.public;
    console.log(
      `  Single-pass — Expert: ${wordCount(expert)} words, Public: ${wordCount(pub)} words`,
    );
    narrativeOutput.push(
      `${'='.repeat(80)}`,
      `CATEGORY-WEEK: ${category} ${weekOf}`,
      `Status: ${status} | Docs: ${totalDocs} | P2: ${data.documentContext?.length ?? 0} | L2: ${hasL2} | Pipeline: single-pass`,
      `${'='.repeat(80)}`,
      '',
      `--- SINGLE-PASS: EXPERT (${wordCount(expert)} words) ---`,
      expert,
      '',
      `--- SINGLE-PASS: PUBLIC (${wordCount(pub)} words) ---`,
      pub,
      '',
      '',
    );
  }

  const results: CheckResult[] = [];

  // T-NAR-1 / T-NAR-2: Word counts
  if (substantive) {
    results.push(
      check(
        'T-NAR-1 expert word count',
        wordCount(expert) >= 350 && wordCount(expert) <= 900,
        `${wordCount(expert)} words (target 400-800)`,
      ),
    );
    results.push(
      check(
        'T-NAR-1 public word count',
        wordCount(pub) >= 150 && wordCount(pub) <= 550,
        `${wordCount(pub)} words (target 200-500)`,
      ),
    );
  } else {
    results.push(
      check(
        'T-NAR-2 expert word count (data-poor)',
        wordCount(expert) >= 150 && wordCount(expert) <= 450,
        `${wordCount(expert)} words (target 200-400)`,
      ),
    );
    results.push(
      check(
        'T-NAR-2 public word count (data-poor)',
        wordCount(pub) >= 100 && wordCount(pub) <= 350,
        `${wordCount(pub)} words (target 150-300)`,
      ),
    );
  }

  // T-NAR-3: "why this might matter"
  const expertFirst2 = firstSubstantiveParagraphs(expert).toLowerCase();
  const publicFirst2 = firstSubstantiveParagraphs(pub).toLowerCase();
  const matterPatterns = [
    'might matter',
    'may matter',
    'could matter',
    'may indicate',
    'could affect',
    'could mean',
    'may reflect',
  ];
  const expertHasMatter = matterPatterns.some((p) => expertFirst2.includes(p));
  const publicHasMatter = matterPatterns.some((p) => publicFirst2.includes(p));
  results.push(
    check(
      'T-NAR-3 expert "why this might matter"',
      expertHasMatter,
      expertHasMatter ? 'Found in first 2 paragraphs' : 'MISSING from first 2 paragraphs',
    ),
  );
  results.push(
    check(
      'T-NAR-3 public "why this might matter"',
      publicHasMatter,
      publicHasMatter ? 'Found in first 2 paragraphs' : 'MISSING from first 2 paragraphs',
    ),
  );

  // T-NAR-4: L2-empty transparency
  if (!hasL2) {
    const l2Note =
      expert.toLowerCase().includes('structural pattern detection only') ||
      expert.toLowerCase().includes('no individual document was analyzed') ||
      expert.toLowerCase().includes('no ai content analysis') ||
      expert.toLowerCase().includes('no content analysis was performed');
    results.push(
      check(
        'T-NAR-4 L2-empty transparency',
        l2Note,
        l2Note ? 'L2-empty noted in expert narrative' : 'MISSING L2-empty note',
      ),
    );
  }

  // T-NAR-5: Small-sample caveat
  if (totalDocs < 20) {
    const expertLow = expert.toLowerCase();
    const smallNote =
      expertLow.includes('small sample') ||
      expertLow.includes('small document sample') ||
      expertLow.includes('small number of') ||
      expertLow.includes('limited sample') ||
      expertLow.includes('few documents') ||
      expertLow.includes('only one document') ||
      /only \d+ documents?/.test(expertLow);
    results.push(
      check(
        'T-NAR-5 small-sample caveat',
        smallNote,
        smallNote ? 'Small sample acknowledged' : 'MISSING small-sample note',
      ),
    );
  }

  // T-NAR-12: No raw data sequences (applied to category-week too)
  const rawSeqPattern = /(\d+\s*[→→>,-]\s*){8,}|(\d+\s*,\s*){8,}/;
  const hasRawSeq = rawSeqPattern.test(expert) || rawSeqPattern.test(pub);
  results.push(
    check(
      'T-NAR-12 no raw data sequences',
      !hasRawSeq,
      hasRawSeq ? 'FOUND raw sequence >8 values' : 'No raw sequences',
    ),
  );

  // T-NAR-16: Document reference when P2 docs available (title or URL)
  if (hasP2Docs && data.documentContext && data.documentContext.length > 0) {
    const expertLow = expert.toLowerCase();
    const anyDocReferenced = data.documentContext.some(
      (d) => expertLow.includes(d.title.toLowerCase()) || (d.url && expert.includes(d.url)),
    );
    results.push(
      check(
        'T-NAR-16 document reference',
        anyDocReferenced,
        anyDocReferenced
          ? 'At least one document title or URL found in expert narrative'
          : 'NO document titles or URLs found in expert narrative',
      ),
    );
  }

  return results;
}

// ---------------------------------------------------------------------------
// Weekly summary validation
// ---------------------------------------------------------------------------

async function validateWeeklySummary(weekOf: string): Promise<CheckResult[]> {
  console.log(`\n--- Weekly summary: ${weekOf} ---`);
  const db = getDb();

  const allRows = await db
    .select()
    .from(weeklyAggregates)
    .where(eq(weeklyAggregates.weekOf, weekOf));

  if (allRows.length === 0) {
    console.log('  No data — skipping');
    return [];
  }

  const categories: NarrativeLayerData[] = allRows.map((row) => {
    const cat = CATEGORIES.find((c) => c.key === row.category);
    return toNarrativeLayerData(
      cat ?? { key: row.category, title: row.category, description: '' },
      row,
    );
  });

  // Build dummy narrative map (empty — we're testing the summary prompt, not category narratives)
  const categoryNarratives = new Map<string, { expert: string; public: string }>();
  for (const c of categories) {
    categoryNarratives.set(c.category, {
      expert: '(category narrative omitted for validation)',
      public: '(omitted)',
    });
  }

  const previousWeekSummary = await getPreviousWeekNarrative(weekOf);
  const input: WeeklySummaryInput = {
    weekOf,
    categories,
    categoryNarratives,
    failedCategories: [],
    previousWeekSummary,
    previousWeekTotalDocs: await computePreviousWeekTotalDocs(weekOf),
  };

  const elevated = categories.filter((c) => isElevatedStatus(c.convergenceDetail));
  const zeroDocs = categories.filter(
    (c) =>
      (c.totalDocumentCount ?? 0) === 0 || (c.structuralDetail === null && c.aiDetail === null),
  );
  console.log(`  ${elevated.length} elevated, ${zeroDocs.length} zero-doc categories`);

  console.log('  Generating expert + public weekly summaries...');
  const [expert, pub] = await Promise.all([
    generateSinglePass(buildWeeklySummaryPrompt(input, 'expert'), 2048),
    generateSinglePass(buildWeeklySummaryPrompt(input, 'public'), 1024),
  ]);

  console.log(`  Expert: ${wordCount(expert)} words, Public: ${wordCount(pub)} words`);

  narrativeOutput.push(
    `${'='.repeat(80)}`,
    `WEEKLY SUMMARY: ${weekOf}`,
    `Elevated: ${elevated.length} | Zero-doc: ${zeroDocs.length}`,
    `${'='.repeat(80)}`,
    '',
    `--- EXPERT (${wordCount(expert)} words) ---`,
    expert,
    '',
    `--- PUBLIC (${wordCount(pub)} words) ---`,
    pub,
    '',
    '',
  );

  const results: CheckResult[] = [];

  // T-NAR-8: Word counts
  results.push(
    check(
      'T-NAR-8 expert word count',
      wordCount(expert) >= 250 && wordCount(expert) <= 550,
      `${wordCount(expert)} words (target 300-500)`,
    ),
  );
  results.push(
    check(
      'T-NAR-8 public word count',
      wordCount(pub) >= 150 && wordCount(pub) <= 400,
      `${wordCount(pub)} words (target 200-350)`,
    ),
  );

  // T-NAR-10: "why this might matter"
  const expertFirst2 = firstSubstantiveParagraphs(expert).toLowerCase();
  const publicFirst2 = firstSubstantiveParagraphs(pub).toLowerCase();
  const matterPatterns = [
    'might matter',
    'could matter',
    'may indicate',
    'could affect',
    'could mean',
    'may reflect',
    'could signal',
    'raises questions',
    'warrants attention',
    'suggests',
    'could represent',
    'may suggest',
    'could indicate',
    'worth noting',
  ];
  const expertHasMatter = matterPatterns.some((p) => expertFirst2.includes(p));
  const publicHasMatter = matterPatterns.some((p) => publicFirst2.includes(p));
  results.push(
    check(
      'T-NAR-10 expert "why this might matter"',
      expertHasMatter,
      expertHasMatter ? 'Found in first 2 paragraphs' : 'MISSING',
    ),
  );
  results.push(
    check(
      'T-NAR-10 public "why this might matter"',
      publicHasMatter,
      publicHasMatter ? 'Found in first 2 paragraphs' : 'MISSING',
    ),
  );

  // Check for "what to watch"
  const expertLower = expert.toLowerCase();
  const pubLower = pub.toLowerCase();
  const watchPatterns = ['watch', 'next week', 'looking ahead', 'monitor', 'key question'];
  const expertHasWatch = watchPatterns.some((p) => expertLower.includes(p));
  const pubHasWatch = watchPatterns.some((p) => pubLower.includes(p));
  results.push(
    check(
      'Weekly "what to watch"',
      expertHasWatch || pubHasWatch,
      (expertHasWatch ? 'Expert has it' : '') + (pubHasWatch ? ' Public has it' : ''),
    ),
  );

  // Check structure (not too many sections)
  const expertSections = expert.split(/\n#{1,3}\s|---/).length;
  results.push(
    check(
      'Weekly paragraph structure',
      expertSections <= 6,
      `${expertSections} sections (target ≤4 paragraphs)`,
    ),
  );

  return results;
}

// ---------------------------------------------------------------------------
// Term summary validation
// ---------------------------------------------------------------------------

async function validateTermSummary(weekOf: string): Promise<CheckResult[]> {
  console.log(`\n--- Term summary: ${weekOf} ---`);

  // Build the weekly summary first (needed as input)
  const db = getDb();
  const allRows = await db
    .select()
    .from(weeklyAggregates)
    .where(eq(weeklyAggregates.weekOf, weekOf));

  if (allRows.length === 0) {
    console.log('  No data — skipping');
    return [];
  }

  console.log('  Loading trajectory + statistics + significant weeks...');
  const [significant, trajectoryTable, statistics] = await Promise.all([
    getSignificantWeeks(),
    getTrajectoryTable(T2_INAUGURATION, weekOf),
    getTermStatistics(T2_INAUGURATION, weekOf),
  ]);
  const excerpts = await getOverviewExcerpts(significant.map((w) => w.weekOf));

  const termInput: TermSummaryInput = {
    weekOf,
    weeklySummary: {
      expert: '(weekly summary placeholder for validation)',
      public: '(weekly summary placeholder for validation)',
    },
    significantWeeks: significant.map((w) => ({
      weekOf: w.weekOf,
      reasons: w.reasons.map((r) => r.detail),
      excerpt: excerpts.get(w.weekOf) ?? null,
    })),
    trajectoryTable,
    statistics,
  };

  console.log(
    `  Trajectory rows: ${trajectoryTable.length}, significant weeks: ${significant.length}`,
  );
  console.log('  Generating expert + public term summaries...');

  const [expert, pub] = await Promise.all([
    generateSinglePass(buildTermSummaryPrompt(termInput, 'expert'), 4096),
    generateSinglePass(buildTermSummaryPrompt(termInput, 'public'), 2048),
  ]);

  console.log(`  Expert: ${wordCount(expert)} words, Public: ${wordCount(pub)} words`);

  narrativeOutput.push(
    `${'='.repeat(80)}`,
    `TERM SUMMARY: ${weekOf}`,
    `Trajectory rows: ${trajectoryTable.length} | Significant weeks: ${significant.length}`,
    `${'='.repeat(80)}`,
    '',
    `--- EXPERT (${wordCount(expert)} words) ---`,
    expert,
    '',
    `--- PUBLIC (${wordCount(pub)} words) ---`,
    pub,
    '',
    '',
  );

  const results: CheckResult[] = [];

  // T-NAR-14: Word counts
  results.push(
    check(
      'T-NAR-14 expert word count',
      wordCount(expert) >= 500 && wordCount(expert) <= 1100,
      `${wordCount(expert)} words (target 600-1000)`,
    ),
  );
  results.push(
    check(
      'T-NAR-14 public word count',
      wordCount(pub) >= 350 && wordCount(pub) <= 800,
      `${wordCount(pub)} words (target 400-700)`,
    ),
  );

  // T-NAR-12: No raw data sequences (strengthened: also catches comma-separated)
  const rawSeqPattern = /(\d+\s*[→→>,-]\s*){8,}|(\d+\s*,\s*){8,}/;
  const hasRawSeq = rawSeqPattern.test(expert) || rawSeqPattern.test(pub);
  results.push(
    check(
      'T-NAR-12 no raw data sequences',
      !hasRawSeq,
      hasRawSeq ? 'FOUND raw sequence >8 values' : 'No raw sequences',
    ),
  );

  // "why this might matter" in term
  const expertFirst2 = firstSubstantiveParagraphs(expert).toLowerCase();
  const publicFirst2 = firstSubstantiveParagraphs(pub).toLowerCase();
  const matterPatterns = [
    'might matter',
    'could matter',
    'may indicate',
    'could affect',
    'could mean',
    'may reflect',
    'could signal',
    'raises questions',
    'warrants attention',
    'suggests',
    'could represent',
    'may suggest',
    'could indicate',
    'worth noting',
  ];
  const expertHasMatter = matterPatterns.some((p) => expertFirst2.includes(p));
  const publicHasMatter = matterPatterns.some((p) => publicFirst2.includes(p));
  results.push(
    check(
      'Term "why this might matter"',
      expertHasMatter || publicHasMatter,
      (expertHasMatter ? 'Expert: yes' : 'Expert: no') +
        ', ' +
        (publicHasMatter ? 'Public: yes' : 'Public: no'),
    ),
  );

  // T-NAR-15: Public opening framing — first substantive paragraph contextualizes the system
  const pubParas = pub
    .split(/\n\n+/)
    .filter((p) => p.length > 60 && !p.startsWith('#') && !p.match(/^\*\*[A-Z].*:\*\*/));
  const pubFirstPara = (pubParas[0] ?? '').toLowerCase();
  const framingTerms = [
    'monitor',
    'track',
    'categor',
    'institution',
    'democrat',
    'system',
    'analys',
    'signal',
    'detect',
  ];
  const hasFraming = framingTerms.some((t) => pubFirstPara.includes(t));
  results.push(
    check(
      'T-NAR-15 public opening framing',
      hasFraming,
      hasFraming
        ? 'Opening contextualizes the system'
        : `MISSING contextual opening: "${pubFirstPara.slice(0, 100)}..."`,
    ),
  );

  // Term-level vs this-week focus
  const thisWeekMentions = (expert.match(/this week/gi) ?? []).length;
  results.push(
    check(
      'T-NAR-11 term-level focus',
      thisWeekMentions <= 8,
      `"this week" appears ${thisWeekMentions} times (should be minority of content)`,
    ),
  );

  return results;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const { category, week, type, output } = parseArgs();
  const allResults: CheckResult[] = [];

  if (type === 'all' || type === 'category') {
    // Test cases: data-rich + data-poor
    const catTests = category
      ? [{ cat: category, week: week ?? '2026-03-09' }]
      : [
          { cat: 'civilLiberties', week: week ?? '2026-03-09' }, // Divergent, 52 docs
          { cat: 'judicialIndependence', week: week ?? '2026-03-09' }, // Elevated, 6 docs (small sample)
          { cat: 'civilService', week: week ?? '2026-03-09' }, // Elevated, 9 docs
        ];
    for (const t of catTests) {
      const results = await validateCategoryWeek(t.cat, t.week);
      allResults.push(...results);
    }
  }

  if (type === 'all' || type === 'weekly') {
    const weeklyWeek = week ?? '2026-03-09';
    const results = await validateWeeklySummary(weeklyWeek);
    allResults.push(...results);
  }

  if (type === 'all' || type === 'term') {
    const termWeek = week ?? '2026-03-09';
    const results = await validateTermSummary(termWeek);
    allResults.push(...results);
  }

  // Summary
  const passed = allResults.filter((r) => r.pass).length;
  const failed = allResults.filter((r) => !r.pass).length;
  console.log(`\n=== VALIDATION SUMMARY ===`);
  console.log(`Passed: ${passed}/${allResults.length}`);
  if (failed > 0) {
    console.log(`\nFailed checks:`);
    for (const r of allResults.filter((r) => !r.pass)) {
      console.log(`  ✗ ${r.name}: ${r.detail}`);
    }
  }
  if (output && narrativeOutput.length > 0) {
    const fs = await import('fs');
    fs.writeFileSync(output, narrativeOutput.join('\n'), 'utf-8');
    console.log(`\nNarratives written to: ${output}`);
  }

  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
