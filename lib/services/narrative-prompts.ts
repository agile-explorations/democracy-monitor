import type { NarrativeLayerData, TermSummaryInput, WeeklySummaryInput } from '@/lib/types';

// ---------------------------------------------------------------------------
// Internal formatting helpers — NOT exported
// ---------------------------------------------------------------------------

function fmtPct(n: number): string {
  return `${(n * 100).toFixed(1)}%`;
}

function fmtNum(n: number, decimals = 3): string {
  return n.toFixed(decimals);
}

function layersFiredSummary(data: NarrativeLayerData): string {
  const cd = data.convergenceDetail;
  if (!cd) return 'Convergence data unavailable.';
  const fired: string[] = [];
  if (cd.structuralElevated) fired.push('L1 (structural)');
  if (cd.aiElevated) fired.push('L2 (AI)');
  if (cd.thematicElevated) fired.push('L3 (thematic)');
  return fired.length === 0 ? 'No layers elevated.' : `Layers fired: ${fired.join(', ')}.`;
}

function statusExplanation(data: NarrativeLayerData): string {
  const cd = data.convergenceDetail;
  if (!cd) return '';
  const parts: string[] = [];
  if (cd.structuralElevated && data.structuralScore !== null) {
    parts.push(
      `L1 structural score ${fmtNum(data.structuralScore)} with ${data.totalDocumentCount ?? 0} documents`,
    );
  }
  if (cd.aiElevated && data.aiDetail) {
    parts.push(
      `L2 corroborated with ${fmtPct(data.aiDetail.concernRate)} concern rate (baseline: ${fmtPct(data.aiDetail.baselineFlagRate)})`,
    );
  }
  if (cd.thematicElevated && data.thematicScore !== null) {
    parts.push(`L3 thematic drift score ${fmtNum(data.thematicScore)}`);
  }
  return parts.length === 0
    ? `${cd.status}: ${cd.pattern}.`
    : `${cd.status} because ${parts.join('. ')}.`;
}

function formatConvergenceBlock(data: NarrativeLayerData): string[] {
  const cd = data.convergenceDetail;
  if (!cd) return ['Convergence data: unavailable.'];
  const lines = [
    `Convergence status: ${cd.status} (${cd.layersElevated} of 3 layers elevated)`,
    `Pattern: ${cd.pattern}`,
    layersFiredSummary(data),
  ];
  if (cd.bootstrap) lines.push('Note: L3 (thematic) is in bootstrap mode — reduced confidence.');
  return lines;
}

function formatL1Block(data: NarrativeLayerData): string[] {
  const lines = ['', 'L1 Structural:'];
  if (data.structuralScore === null || !data.structuralDetail) {
    return [...lines, '  No structural data available.'];
  }
  const s = data.structuralDetail;
  lines.push(`  Composite score: ${fmtNum(data.structuralScore)}`, `  Anomalous: ${s.anomalous}`);
  for (const [name, dim] of Object.entries(s.dimensions)) {
    if (dim && dim.available) {
      lines.push(`  ${name}: z-score ${fmtNum(dim.zScore, 2)} (value ${fmtNum(dim.value)})`);
    }
  }
  if (s.functionalShifts.length > 0) {
    lines.push('  Functional shifts:');
    for (const shift of s.functionalShifts) {
      lines.push(
        `    ${shift.bucket}: ${fmtPct(shift.baselineRate)} -> ${fmtPct(shift.currentRate)} (${shift.direction})`,
      );
    }
  }
  return lines;
}

function formatL2Block(data: NarrativeLayerData): string[] {
  const lines = ['', 'L2 AI Assessment:'];
  if (data.aiScore === null || !data.aiDetail) {
    return [...lines, '  No AI assessment data available.'];
  }
  const a = data.aiDetail;
  const d = a.concernDistribution;
  lines.push(
    `  AI score: ${fmtNum(data.aiScore)}`,
    `  P1 flag rate: ${fmtPct(a.flagRate)} (${a.flagCount}/${a.totalDocuments} docs)`,
    `  Baseline flag rate: ${fmtPct(a.baselineFlagRate)}`,
    `  Flag rate z-score: ${fmtNum(a.flagRateZScore, 2)}`,
    `  P2 concern rate: ${fmtPct(a.concernRate)}`,
    `  Concern distribution: routine=${d.routine}, novel_not_concerning=${d.novelNotConcerning}, ` +
      `potentially_concerning=${d.potentiallyConcerning}, clearly_concerning=${d.clearlyConcerning}`,
  );
  return lines;
}

function formatL3Block(data: NarrativeLayerData): string[] {
  const lines = ['', 'L3 Thematic Drift:'];
  if (data.thematicScore === null || !data.thematicDetail) {
    return [...lines, '  No thematic drift data available.'];
  }
  const t = data.thematicDetail;
  const reinforcing = data.convergenceDetail?.thematicElevated ? 'reinforcing' : 'not reinforcing';
  lines.push(
    `  Thematic score: ${fmtNum(data.thematicScore)}`,
    `  Centroid distance: ${fmtNum(t.rollingCentroidDistance, 4)}`,
    `  Z-score: ${fmtNum(t.zScore, 2)}`,
    `  Novel document rate: ${fmtPct(t.novelDocumentRate)}`,
    `  Variance ratio: ${fmtNum(t.varianceRatio)}`,
  );
  if (t.bootstrap) lines.push('  Bootstrap mode: yes (rolling window still establishing)');
  lines.push(`  Direction: ${reinforcing}`);
  return lines;
}

/** Layer assessment summary shared across Pass 1, Pass 2, and Pass 3. */
function formatLayerAssessment(data: NarrativeLayerData): string {
  return [
    '--- LAYER ASSESSMENT SUMMARY ---',
    `Category: ${data.categoryTitle}`,
    `Description: ${data.categoryDescription}`,
    `Week of: ${data.weekOf}`,
    ...formatConvergenceBlock(data),
    ...formatL1Block(data),
    ...formatL2Block(data),
    ...formatL3Block(data),
    '',
    statusExplanation(data),
  ].join('\n');
}

function formatDocumentSection(data: NarrativeLayerData): string {
  const docs = data.documentContext;
  if (!docs || docs.length === 0) {
    return '--- KEY DOCUMENTS (P2-CONFIRMED) ---\nNo P2-confirmed documents available.';
  }
  const lines = ['--- KEY DOCUMENTS (P2-CONFIRMED) ---'];
  for (const doc of docs) {
    lines.push(`Title: ${doc.title}`);
    lines.push(`  Source: ${doc.sourceType}${doc.sourceOrigin ? ` (${doc.sourceOrigin})` : ''}`);
    if (doc.publishedAt) lines.push(`  Published: ${doc.publishedAt}`);
    if (doc.url) lines.push(`  URL: ${doc.url}`);
    if (doc.agency) lines.push(`  Agency: ${doc.agency}`);
    lines.push(`  Assessment: ${doc.assessment}`);
    if (doc.erosionType) lines.push(`  Erosion type: ${doc.erosionType}`);
    if (doc.reasoning) lines.push(`  Reasoning: ${doc.reasoning}`);
    if (doc.content) lines.push(`  Content excerpt: ${doc.content}`);
    lines.push('');
  }
  return lines.join('\n');
}

function formatFlaggedRoutineSection(data: NarrativeLayerData): string {
  const docs = data.flaggedRoutineContext;
  if (!docs || docs.length === 0) return '';
  const lines = ['--- REVIEWED BUT NOT CONFIRMED (P1-FLAGGED, P2-ROUTINE) ---'];
  for (const doc of docs) {
    const date = doc.publishedAt ? ` (${doc.publishedAt})` : '';
    lines.push(`- ${doc.title} [${doc.sourceType}]${date}`);
  }
  return lines.join('\n');
}

function formatDocumentSummary(data: NarrativeLayerData): string {
  const lines = [
    '--- DOCUMENT SUMMARY ---',
    `Total documents: ${data.totalDocumentCount ?? 'unknown'}`,
  ];
  const breakdown = data.sourceTypeBreakdown;
  if (breakdown && breakdown.length > 0) {
    lines.push('Source-type breakdown:');
    for (const entry of breakdown) lines.push(`  ${entry.sourceType}: ${entry.count}`);
  }
  return lines.join('\n');
}

function formatBaselineSection(data: NarrativeLayerData): string {
  const ctx = data.baselineContext;
  if (!ctx) return '--- BASELINE CONTEXT ---\nBaseline context unavailable.';
  return [
    '--- BASELINE CONTEXT ---',
    `Biden 2022 baseline: avg ${ctx.avgDocsPerWeek.toFixed(1)} docs/week, ` +
      `${fmtPct(ctx.avgP2ConcernRate)} P2 concern rate, ` +
      `structural score typically ${ctx.structuralScoreRange}`,
  ].join('\n');
}

function formatTrajectorySection(data: NarrativeLayerData): string {
  const t = data.trajectory;
  if (!t) return '';
  const lines = ['--- TRAJECTORY ---'];
  if (t.previousWeekStatus) lines.push(`Previous week: ${t.previousWeekStatus}`);
  lines.push(`Consecutive weeks at current level: ${t.consecutiveWeeksAtStatus}`);
  return lines.join('\n');
}

/** Shared output format instructions for Pass 1 and Pass 3 drafts. */
const DUAL_OUTPUT_FORMAT = [
  '--- OUTPUT FORMAT ---',
  'Produce BOTH sections in your response:',
  '',
  '=== EXPERT NARRATIVE ===',
  '(400-800 words. Technical analysis for researchers. Reference specific z-scores, dimensions,',
  'and documents by title. Include a Limitations sentence. Present counter-arguments.)',
  '',
  '=== PUBLIC NARRATIVE ===',
  '(200-500 words. Plain language for journalists and citizens. No jargon. Describe what',
  'government actions triggered this. Include a Limitations sentence. Present alternative',
  'explanations.)',
].join('\n');

/** Collect all context sections for the draft prompt. */
function collectDraftSections(data: NarrativeLayerData): string[] {
  const sections = [formatDocumentSection(data)];
  const flagged = formatFlaggedRoutineSection(data);
  if (flagged) sections.push(flagged);
  sections.push(formatDocumentSummary(data), formatBaselineSection(data));
  const trajectory = formatTrajectorySection(data);
  if (trajectory) sections.push(trajectory);
  return sections;
}

// ---------------------------------------------------------------------------
// Exported prompt builders
// ---------------------------------------------------------------------------

/**
 * Pass 1 — Draft prompt for Claude Opus.
 * Generates both expert and public narratives in a single call.
 */
export function buildDraftPrompt(data: NarrativeLayerData): string {
  const preamble = [
    'You are an analyst for a democratic institution monitoring system.',
    'Generate both an expert and a public narrative for this category-week assessment.',
    'Focus on what happened in the real world, not how the monitoring system works.',
    'Minimize self-referential language about "our system" or "our layers".',
    'Reference specific documents by title.',
    'This is AI-generated analysis, not a finding of fact.',
    'Do not make claims unsupported by the data.',
  ].join('\n');

  const context = [formatLayerAssessment(data), ...collectDraftSections(data)].join('\n\n');
  return [preamble, '', context, '', DUAL_OUTPUT_FORMAT].join('\n');
}

/**
 * Pass 2 — Feedback prompt for GPT-4o.
 * Reviews both drafts against the source data.
 */
export function buildFeedbackPrompt(
  expertDraft: string,
  publicDraft: string,
  data: NarrativeLayerData,
): string {
  return [
    'You are an editorial reviewer for a democratic institution monitoring system.',
    'Review the following AI-generated narrative drafts against the source data.',
    '',
    '--- EXPERT DRAFT ---',
    expertDraft,
    '',
    '--- PUBLIC DRAFT ---',
    publicDraft,
    '',
    formatLayerAssessment(data),
    '',
    formatDocumentSection(data),
    '',
    '--- REVIEW INSTRUCTIONS ---',
    'Review both drafts against the source data. Provide structured feedback:',
    '',
    '(a) FACTUAL ACCURACY — Does the draft correctly represent the layer scores and document',
    'content? List any specific misstatements.',
    '',
    '(b) CONFIDENCE CALIBRATION — Does the draft overstate certainty or imply causation from',
    'correlation? Quote specific phrases that need softening.',
    '',
    "(c) MISSING COUNTER-ARGUMENTS — Are there plausible benign explanations the draft didn't",
    'consider? Suggest specific alternatives.',
    '',
    '(d) CHARACTERIZATION CONCERNS — Does the draft describe government actions in language that',
    'goes beyond what the documents say? Flag specific phrases.',
    '',
    '(e) BALANCE — If the draft characterizes a government action, does it also note any stated',
    "justification from the administration's own documents? What's missing?",
  ].join('\n');
}

/**
 * Pass 3 — Revision prompt for Claude Opus.
 * Revises drafts based on GPT-4o's structured feedback.
 */
export function buildRevisionPrompt(
  expertDraft: string,
  publicDraft: string,
  feedback: string,
  data: NarrativeLayerData,
): string {
  return [
    'You are an analyst for a democratic institution monitoring system.',
    'Revise the following drafts based on editorial feedback.',
    '',
    '--- ORIGINAL EXPERT DRAFT ---',
    expertDraft,
    '',
    '--- ORIGINAL PUBLIC DRAFT ---',
    publicDraft,
    '',
    '--- EDITORIAL FEEDBACK ---',
    feedback,
    '',
    formatLayerAssessment(data),
    '',
    '--- REVISION INSTRUCTIONS ---',
    'Address each feedback item (a through e):',
    '- Revise where feedback identifies legitimate issues.',
    '- Do not fundamentally rewrite — adjust, soften, or strengthen specific claims.',
    '- If feedback identifies a factual error, correct it.',
    '- If feedback identifies overstatement, soften the language.',
    '- If feedback suggests missing counter-arguments, add them.',
    '- If feedback flags characterization concerns, revise the phrasing.',
    '- If feedback notes missing balance, incorporate stated justifications.',
    '',
    DUAL_OUTPUT_FORMAT,
  ].join('\n');
}

/** Format elevated and stable category lists for the weekly summary. */
function formatWeeklyCategoryBlocks(
  input: WeeklySummaryInput,
  version: 'expert' | 'public',
): string {
  const lines: string[] = [];
  const elevated = input.categories.filter(
    (c) => c.convergenceDetail && c.convergenceDetail.status !== 'Stable',
  );
  const stable = input.categories.filter(
    (c) => !c.convergenceDetail || c.convergenceDetail.status === 'Stable',
  );

  if (elevated.length > 0) {
    lines.push('--- ELEVATED+ CATEGORIES ---');
    for (const cat of elevated) {
      const status = cat.convergenceDetail?.status ?? 'Unknown';
      lines.push(
        `${cat.categoryTitle} (${cat.category}): ${status}, ${cat.convergenceDetail?.layersElevated ?? 0} layers elevated`,
      );
      const narrative = input.categoryNarratives.get(cat.category);
      if (narrative)
        lines.push(`  Narrative: ${version === 'expert' ? narrative.expert : narrative.public}`);
      lines.push('');
    }
  }
  if (stable.length > 0) {
    lines.push('--- STABLE CATEGORIES ---');
    for (const cat of stable) {
      lines.push(
        `${cat.category}: Stable, ${cat.totalDocumentCount ?? 0} documents, no structural or AI anomalies`,
      );
    }
    lines.push('');
  }
  if (input.failedCategories.length > 0) {
    lines.push('--- FAILED NARRATIVE GENERATION ---');
    lines.push(
      `The following categories failed narrative generation: ${input.failedCategories.join(', ')}`,
    );
    lines.push('');
  }
  return lines.join('\n');
}

function weeklyRequirements(version: 'expert' | 'public'): string {
  const lines = [
    '--- REQUIREMENTS ---',
    '- Summarize how many categories are elevated and which layers are most active.',
    '- Note any synchrony patterns (multiple categories elevated simultaneously).',
    '- Highlight any changes from the previous week.',
    '- Include a Limitations sentence.',
    '- Do not make claims unsupported by the data.',
    '- This is AI-generated analysis, not a finding of fact.',
    '- Do NOT include individual document details, layer scores, or baseline data.',
    '- Focus on the cross-category picture.',
  ];
  if (version === 'expert') {
    lines.push(
      '- Reference specific layer patterns and convergence statuses.',
      '- Keep the summary between 400-800 words.',
    );
  } else {
    lines.push(
      '- Avoid technical jargon. Use plain language.',
      '- Keep the summary between 200-500 words.',
    );
  }
  return lines.join('\n');
}

/** Weekly cross-category summary prompt. Single pass for expert or public. */
export function buildWeeklySummaryPrompt(
  input: WeeklySummaryInput,
  version: 'expert' | 'public',
): string {
  const header =
    version === 'expert'
      ? 'Write a technical cross-category synthesis for researchers and analysts.'
      : 'Write a plain-language cross-category synthesis for journalists and citizens.';
  const elevated = input.categories.filter(
    (c) => c.convergenceDetail && c.convergenceDetail.status !== 'Stable',
  );
  const delta = input.previousWeekSummary
    ? `${elevated.length} elevated (see previous week summary for comparison)`
    : 'no prior week available';

  const sections = [
    `You are an analyst for a democratic institution monitoring system.\n${header}`,
    '',
    `Week of: ${input.weekOf}`,
    `Total categories monitored: ${input.categories.length}`,
    `Categories at Elevated or above: ${elevated.length}`,
    `Delta from last week: ${delta}`,
    '',
    formatWeeklyCategoryBlocks(input, version),
  ];

  if (input.previousWeekSummary) {
    const prev =
      version === 'expert' ? input.previousWeekSummary.expert : input.previousWeekSummary.public;
    sections.push('--- PREVIOUS WEEK SUMMARY (for continuity) ---', prev, '');
  }
  sections.push(weeklyRequirements(version));
  return sections.join('\n');
}

/** Format trajectory table rows grouped by category. */
function formatTrajectoryTable(
  table: Array<{ category: string; weekOf: string; status: string }>,
): string {
  if (table.length === 0) return 'No trajectory data available.';
  const byCategory = new Map<string, string[]>();
  for (const row of table) {
    const entries = byCategory.get(row.category) ?? [];
    entries.push(`${row.weekOf}:${row.status}`);
    byCategory.set(row.category, entries);
  }
  const lines: string[] = [];
  for (const [category, entries] of byCategory) {
    lines.push(`${category}: ${entries.join(' | ')}`);
  }
  return lines.join('\n');
}

function formatTermStatistics(stats: TermSummaryInput['statistics']): string {
  const lines = ['Weeks per status by category:'];
  for (const e of stats.weeksPerStatus) {
    lines.push(
      `  ${e.category}: Stable=${e.stable}, Elevated=${e.elevated}, Divergent=${e.divergent}, ConfirmedConcern=${e.confirmedConcern}`,
    );
  }
  if (stats.peakConvergenceWeek) lines.push(`Peak convergence week: ${stats.peakConvergenceWeek}`);
  if (stats.currentTrend.length > 0) {
    lines.push('Current trend direction:');
    for (const t of stats.currentTrend) lines.push(`  ${t.category}: ${t.direction}`);
  }
  return lines.join('\n');
}

/** Collect data sections for the term summary prompt. */
function collectTermDataSections(input: TermSummaryInput, version: 'expert' | 'public'): string {
  const sections: string[] = [];

  if (input.previousTermSummary) {
    const prev =
      version === 'expert' ? input.previousTermSummary.expert : input.previousTermSummary.public;
    sections.push('--- PREVIOUS TERM SUMMARY (update this) ---', prev, '');
  } else {
    sections.push(
      '--- PREVIOUS TERM SUMMARY ---',
      'No prior term summary. This is the first term summary.',
      '',
    );
  }

  const weekly = version === 'expert' ? input.weeklySummary.expert : input.weeklySummary.public;
  sections.push("--- THIS WEEK'S SUMMARY ---", weekly, '');
  sections.push('--- TRAJECTORY TABLE ---', formatTrajectoryTable(input.trajectoryTable), '');
  sections.push('--- KEY STATISTICS ---', formatTermStatistics(input.statistics), '');
  return sections.join('\n');
}

/** Term summary prompt — incremental update. Single pass for expert or public. */
export function buildTermSummaryPrompt(
  input: TermSummaryInput,
  version: 'expert' | 'public',
): string {
  const header =
    version === 'expert'
      ? 'Write a technical term-level summary for researchers and analysts.'
      : 'Write a plain-language term-level summary for journalists and citizens.';
  const wordRange = version === 'expert' ? '800-1500' : '500-1000';

  return [
    `You are an analyst for a democratic institution monitoring system.\n${header}`,
    '',
    `Current week: ${input.weekOf}`,
    '',
    collectTermDataSections(input, version),
    '--- INSTRUCTIONS ---',
    "Update the term summary to incorporate this week's developments.",
    'Maintain the narrative arc — show how the picture has evolved over time.',
    'Note any new milestones (first time a category reaches a status, longest streak, etc.).',
    'Keep total length to 2-3 pages.',
    'Do not make claims unsupported by the data.',
    'This is AI-generated analysis, not a finding of fact.',
    '',
    '--- OUTPUT FORMAT ---',
    `Produce a single ${version === 'expert' ? 'technical' : 'plain-language'} term summary (${wordRange} words).`,
  ].join('\n');
}
