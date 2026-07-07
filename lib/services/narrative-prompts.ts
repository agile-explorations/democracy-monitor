import type { NarrativeLayerData, TermSummaryInput, WeeklySummaryInput } from '@/lib/types';
import {
  buildDualOutputFormat,
  collectDraftSections,
  formatDocumentSection,
  formatLayerAssessment,
  formatTrajectorySummary,
} from './narrative-format-helpers';

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
    "Reference specific documents as markdown links: [document title](URL). Use the URL from each document's metadata.",
    'When describing what happened, ground claims in the "WHY THIS WAS FLAGGED" reasoning for',
    'each document — it contains event-level descriptions from a separate AI review of the full text.',
    'This is AI-generated analysis, not a finding of fact.',
    'Do not make claims unsupported by the data.',
    '',
    'CRITICAL: Your second paragraph in BOTH narratives MUST include a "why this might matter"',
    'sentence connecting the pattern to the specific democratic institution at stake.',
    '',
    'COUNTER-ARGUMENTS:',
    'For every concern you raise, include a weighted counter-argument. Rank alternative',
    'explanations by plausibility — lead with the most likely benign explanation. Stronger',
    'evidence warrants a briefer counter-argument; weaker evidence warrants a more prominent one.',
    'Limit to 2-3 alternative explanations in the PUBLIC narrative, 3-4 in the EXPERT narrative.',
    'Do not list all possibilities with equal weight.',
  ].join('\n');

  const context = [formatLayerAssessment(data), ...collectDraftSections(data)].join('\n\n');
  return [preamble, '', context, '', buildDualOutputFormat(data)].join('\n');
}

/**
 * Pass 2 — Feedback prompt for GPT-4o.
 * Reviews both drafts against the source data.
 */
/** Build conditional feedback criteria (h+) based on document count. */
function buildConditionalCriteria(data: NarrativeLayerData): string[] {
  const smallSample = (data.totalDocumentCount ?? 0) < 20;
  const counterArgLetter = smallSample ? 'i' : 'h';
  const lines: string[] = [];
  if (smallSample) {
    lines.push(
      '',
      `(h) SMALL SAMPLE SIZE — This week has only ${data.totalDocumentCount ?? 0} documents.`,
      'Do both narratives acknowledge the small sample size and its implications for',
      'statistical reliability? A single document entering or leaving a sample this small',
      'can dramatically shift percentages. If neither narrative mentions this, flag it.',
    );
  }
  lines.push(
    '',
    `(${counterArgLetter}) COUNTER-ARGUMENT COUNT — The expert narrative should have 3-4 alternative`,
    'explanations and the public narrative 2-3. If either exceeds these limits, flag the excess',
    'items for removal (drop the least plausible ones).',
  );
  return lines;
}

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
    '',
    '(f) EVIDENCE SUFFICIENCY — Is the narrative length proportional to the available evidence?',
    'If no P2-confirmed documents or L2 AI analysis are present, the narrative should be',
    'concise. Flag any sections that pad length beyond what the data supports.',
    '',
    '(g) "WHY THIS MIGHT MATTER" — Do both narratives include a sentence within the first two',
    'substantive paragraphs that connects the observed pattern to a specific democratic institution',
    'or protection at stake? The sentence must use conditional language ("could affect",',
    '"may indicate"). If this sentence is missing from either narrative, flag it as the',
    'highest-priority revision item.',
    ...buildConditionalCriteria(data),
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
    `Address each feedback item (a through ${(data.totalDocumentCount ?? 0) < 20 ? 'i' : 'h'}):`,
    '- Revise where feedback identifies legitimate issues.',
    '- Do not fundamentally rewrite — adjust, soften, or strengthen specific claims.',
    '- If feedback identifies a factual error, correct it.',
    '- If feedback identifies overstatement, soften the language.',
    '- If feedback suggests missing counter-arguments, add them.',
    '- If feedback flags characterization concerns, revise the phrasing.',
    '- If feedback notes missing balance, incorporate stated justifications.',
    '- If feedback flags evidence insufficiency, trim the narrative to match available data.',
    '- If feedback flags a missing "why this might matter" sentence, ADD ONE. This is mandatory.',
    '- If feedback flags missing small-sample acknowledgment, add a note about limited statistical',
    '  reliability due to the small document count.',
    '- If feedback flags excess counter-arguments, remove the least plausible ones to meet the limit.',
    '',
    buildDualOutputFormat(data),
  ].join('\n');
}

function appendZeroDocNote(lines: string[], zeroCount: number, totalStable: number): void {
  lines.push(
    '',
    `DATA AVAILABILITY NOTE: ${zeroCount} of ${totalStable} stable categories had zero documents.`,
    'Zero documents may reflect a genuinely quiet week or a gap in source coverage.',
    'Lead with data availability limitations before interpreting silence as stability.',
  );
}

function formatStableLine(category: string, docCount: number): string {
  return docCount === 0
    ? `${category}: Stable, 0 documents (NO DATA — coverage gap or quiet week)`
    : `${category}: Stable, ${docCount} documents, no structural or AI anomalies`;
}

/** Build a factual summary block that the LLM must cite exactly. */
function buildFactualSummary(input: WeeklySummaryInput): string {
  const elevated = input.categories.filter(
    (c) => c.convergenceDetail && c.convergenceDetail.status !== 'Stable',
  );
  const stable = input.categories.filter(
    (c) => !c.convergenceDetail || c.convergenceDetail.status === 'Stable',
  );
  const zeroDocs = stable.filter((c) => !c.totalDocumentCount);
  const stableWithDocs = stable.filter((c) => (c.totalDocumentCount ?? 0) > 0);
  const totalDocs = input.categories.reduce((sum, c) => sum + (c.totalDocumentCount ?? 0), 0);

  const lines = [
    '--- FACTUAL DATA (cite these numbers exactly — do not conflate status with document count) ---',
    `Total categories monitored: ${input.categories.length}`,
    `Total documents this week: ${totalDocs.toLocaleString()}`,
    `Categories Elevated or above: ${elevated.length} (${elevated.map((c) => c.categoryTitle).join(', ')})`,
    `Categories Stable WITH documents: ${stableWithDocs.length} (${stableWithDocs.map((c) => `${c.categoryTitle}: ${c.totalDocumentCount}`).join(', ')})`,
    `Categories with ZERO documents: ${zeroDocs.length}${zeroDocs.length > 0 ? ` (${zeroDocs.map((c) => c.categoryTitle).join(', ')})` : ''}`,
    `NOTE: "Stable" means no erosion concern was detected. It does NOT mean zero documents.`,
    `${stableWithDocs.length} categories are Stable with documents — they produced data but no erosion signals.`,
    '',
  ];
  return lines.join('\n');
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
    const zeroDocCount = stable.filter((c) => !c.totalDocumentCount).length;
    lines.push('--- STABLE CATEGORIES ---');
    for (const cat of stable) {
      lines.push(formatStableLine(cat.category, cat.totalDocumentCount ?? 0));
    }
    if (zeroDocCount > 0) appendZeroDocNote(lines, zeroDocCount, stable.length);
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
    '- SYNTHESIZE, do not recapitulate. The reader has the category narratives — your job is',
    '  cross-category patterns and connections that individual narratives cannot see.',
    '- Summarize how many categories are elevated and which layers are most active.',
    '- Note any synchrony patterns (multiple categories elevated simultaneously).',
    '- Highlight any changes from the previous week.',
    '- If categories with zero documents exist, lead with data availability limitations before',
    '  interpreting their silence as stability.',
    '',
    'STRUCTURAL REQUIREMENT — "why this might matter":',
    "Your second paragraph MUST include a sentence explaining what this week's cross-category",
    'pattern could mean for democratic institutions. Use conditional language ("could indicate",',
    '"may reflect"). Name the cross-category pattern and the institutional significance.',
    'Example: "Five categories elevated simultaneously might matter because coordinated',
    'multi-category activation can indicate system-wide institutional pressure."',
    'This is not optional — omitting it is a structural failure.',
    '',
    '- Include a Limitations sentence.',
    '- Do not make claims unsupported by the data.',
    '- This is AI-generated analysis, not a finding of fact.',
    '- Do NOT include layer scores or baseline data. When referencing a specific document by name, preserve its markdown link from the category narrative.',
    '- Focus on the cross-category picture.',
    '- End with a "what to watch" sentence: the key question or threshold for next week.',
    '- Structure as 3-4 paragraphs, not 7 sections with horizontal rules.',
  ];
  if (version === 'expert') {
    lines.push(
      '- Reference specific layer patterns and convergence statuses.',
      '- Keep the summary between 300-500 words.',
    );
  } else {
    lines.push(
      '- Avoid technical jargon. Use plain language.',
      '- Keep the summary between 200-350 words.',
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
    `Delta from last week: ${delta}`,
    '',
    buildFactualSummary(input),
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

/** Format the significant-weeks digest that grounds the term summary. */
function formatSignificantWeeks(weeks: TermSummaryInput['significantWeeks']): string {
  if (weeks.length === 0) {
    return '--- SIGNIFICANT WEEKS ---\nNone identified for this term.';
  }
  const lines = ['--- SIGNIFICANT WEEKS (deterministically ranked, most significant first) ---'];
  for (const w of weeks) {
    lines.push(`${w.weekOf}: ${w.reasons.join('; ')}`);
    if (w.excerpt) lines.push(`  Weekly summary excerpt: ${w.excerpt}`);
  }
  return lines.join('\n');
}

/** Collect data sections for the term summary prompt. */
function collectTermDataSections(input: TermSummaryInput, version: 'expert' | 'public'): string {
  const sections: string[] = [];
  const weekly = version === 'expert' ? input.weeklySummary.expert : input.weeklySummary.public;
  sections.push("--- THIS WEEK'S SUMMARY ---", weekly, '');
  sections.push(formatSignificantWeeks(input.significantWeeks), '');
  sections.push(formatTrajectorySummary(input.trajectoryTable), '');
  sections.push('--- KEY STATISTICS ---', formatTermStatistics(input.statistics), '');
  return sections.join('\n');
}

function termCriticalGuidelines(): string[] {
  return [
    'CRITICAL GUIDELINES:',
    '- This is a standalone synthesis of the full term built from the data above — there is',
    '  no prior term summary to update. Every claim must be justified by the current data.',
    '- Anchor the arc in the SIGNIFICANT WEEKS listed above. Reference them by date',
    '  (YYYY-MM-DD). Do NOT invent URLs or links to weeks — dates only.',
    '- Characterize TERM-LEVEL layer patterns (e.g., "L1 has driven X% of elevations over',
    '  N weeks"), not this week\'s specific layer configuration — that belongs in the weekly.',
    "  Do not spend more than 2-3 sentences on this week's specific layer activity.",
    '- The trajectory summary above is pre-computed. Reference its statistics directly;',
    '  do not reconstruct per-week data sequences.',
    '- When referencing a specific document by name, preserve its markdown link from the source material.',
  ];
}

function termInstructions(version: 'expert' | 'public'): string {
  const wordRange = version === 'expert' ? '600-1000' : '400-700';
  return [
    '--- STRUCTURE ---',
    'The term summary MUST follow this two-part structure:',
    '',
    'PART 1 — TERM-WIDE TRAJECTORY (majority of the summary):',
    'Summarize the full arc of the administration term up to and including this week.',
    'Cover: overall institutional health trend, which categories have been most active,',
    'cumulative milestones (first elevations, longest streaks, peak convergence weeks),',
    'and the dominant layer patterns across the full term. This is a standalone summary',
    'that a reader encountering the term for the first time could understand.',
    '',
    "PART 2 — THIS WEEK'S DELTA (final section):",
    "Describe how this week's developments changed the overall picture. What shifted,",
    'what stayed the same, and whether the trajectory is accelerating, decelerating, or stable.',
    '',
    '--- INSTRUCTIONS ---',
    'Do not make claims unsupported by the data.',
    'This is AI-generated analysis, not a finding of fact.',
    '',
    'STRUCTURAL REQUIREMENT — "why this might matter":',
    'Your second paragraph MUST include a sentence explaining what the cumulative trajectory',
    'over the term could mean for democratic institutions. Use conditional language',
    '("could indicate", "may reflect"). This is not optional — omitting it is a structural failure.',
    '',
    ...termCriticalGuidelines(),
    '',
    ...(version === 'public'
      ? [
          'OPENING FRAMING (public version):',
          'Begin with a 2-3 sentence paragraph that answers "why should I care about this',
          'summary?" before diving into the arc. State what the system monitors, which categories',
          "have been most persistently active, and what this week's reading is.",
          '',
        ]
      : []),
    '--- OUTPUT FORMAT ---',
    `Produce a single ${version === 'expert' ? 'technical' : 'plain-language'} term summary (${wordRange} words).`,
  ].join('\n');
}

/** Term summary prompt — living whole-term synthesis. Single pass for expert or public. */
export function buildTermSummaryPrompt(
  input: TermSummaryInput,
  version: 'expert' | 'public',
): string {
  const header =
    version === 'expert'
      ? 'Write a technical term-level summary for researchers and analysts.'
      : 'Write a plain-language term-level summary for journalists and citizens.';

  return [
    `You are an analyst for a democratic institution monitoring system.\n${header}`,
    '',
    `Current week: ${input.weekOf}`,
    '',
    collectTermDataSections(input, version),
    termInstructions(version),
  ].join('\n');
}

// ---------------------------------------------------------------------------
// 3-pass feedback + revision prompts for weekly and term summaries
// ---------------------------------------------------------------------------

/** Build the dual-output format for weekly summary (expert + public in one call). */
function weeklySummaryDualFormat(input: WeeklySummaryInput): string {
  return [
    '--- OUTPUT FORMAT ---',
    'Produce BOTH sections in your response.',
    '',
    '=== EXPERT NARRATIVE ===',
    '(300-500 words. Technical cross-category synthesis for researchers.)',
    '',
    '=== PUBLIC NARRATIVE ===',
    '(200-350 words. Plain-language synthesis for journalists and citizens.)',
  ].join('\n');
}

/** Weekly summary draft prompt for 3-pass (combined expert + public). */
export function buildWeeklySummaryDraftPrompt(input: WeeklySummaryInput): string {
  const elevated = input.categories.filter(
    (c) => c.convergenceDetail && c.convergenceDetail.status !== 'Stable',
  );
  const delta = input.previousWeekSummary
    ? `${elevated.length} elevated (see previous week summary for comparison)`
    : 'no prior week available';

  const sections = [
    'You are an analyst for a democratic institution monitoring system.',
    'Generate both an expert and a public cross-category synthesis for this week.',
    'Focus on cross-category patterns and connections that individual narratives cannot see.',
    'This is AI-generated analysis, not a finding of fact.',
    '',
    `Week of: ${input.weekOf}`,
    `Delta from last week: ${delta}`,
    '',
    buildFactualSummary(input),
    formatWeeklyCategoryBlocks(input, 'expert'),
  ];

  if (input.previousWeekSummary) {
    sections.push(
      '--- PREVIOUS WEEK SUMMARY (for continuity) ---',
      input.previousWeekSummary.expert,
      '',
    );
  }
  sections.push(weeklyRequirements('expert'), '', weeklySummaryDualFormat(input));
  return sections.join('\n');
}

/** Weekly summary feedback prompt (Pass 2 — editorial review). */
export function buildWeeklySummaryFeedbackPrompt(
  expertDraft: string,
  publicDraft: string,
  input: WeeklySummaryInput,
): string {
  return [
    'You are an editorial reviewer for a democratic institution monitoring system.',
    'Review the following AI-generated weekly summary drafts against the source data.',
    '',
    '--- EXPERT DRAFT ---',
    expertDraft,
    '',
    '--- PUBLIC DRAFT ---',
    publicDraft,
    '',
    buildFactualSummary(input),
    formatWeeklyCategoryBlocks(input, 'expert'),
    '',
    '--- REVIEW INSTRUCTIONS ---',
    'Review both drafts against the source data. Provide structured feedback:',
    '',
    '(a) FACTUAL ACCURACY — Does the draft correctly state how many categories have zero',
    'documents, how many are Stable with documents, and how many are Elevated or above?',
    'Compare every numerical claim against the FACTUAL DATA section. List any misstatements.',
    'CRITICAL: "Stable" does NOT mean "zero documents". A category can be Stable with hundreds',
    'of documents — it means no erosion signal was detected.',
    '',
    '(b) STATUS CONSISTENCY — Does the draft correctly report which categories are Elevated,',
    'ConfirmedConcern, or Stable? Are status labels applied to the correct categories?',
    '',
    '(c) CONFIDENCE CALIBRATION — Does the draft overstate certainty or imply causation from',
    'correlation? Quote specific phrases that need softening.',
    '',
    '(d) CROSS-CATEGORY PATTERNS — Are claimed connections between categories supported by',
    'the category narratives provided? Flag any patterns that are asserted but not grounded.',
    '',
    '(e) "WHY THIS MIGHT MATTER" — Does the second paragraph of both narratives include a',
    'sentence connecting the cross-category pattern to democratic institutions using conditional',
    'language? Flag if missing.',
    '',
    '(f) COUNTER-ARGUMENT COUNT — Expert should have 2-3, public 1-2. Flag excess.',
  ].join('\n');
}

/** Weekly summary revision prompt (Pass 3). */
export function buildWeeklySummaryRevisionPrompt(
  expertDraft: string,
  publicDraft: string,
  feedback: string,
  input: WeeklySummaryInput,
): string {
  return [
    'You are an analyst for a democratic institution monitoring system.',
    'Revise the following weekly summary drafts based on editorial feedback.',
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
    buildFactualSummary(input),
    '',
    '--- REVISION INSTRUCTIONS ---',
    'Address each feedback item (a through f):',
    '- If feedback identifies factual errors (wrong category counts, conflating Stable with',
    '  zero documents), CORRECT THEM. This is the highest priority.',
    '- If feedback identifies status label errors, correct them.',
    '- If feedback identifies overstatement, soften the language.',
    '- If feedback flags unsupported cross-category patterns, remove or qualify them.',
    '- If feedback flags missing "why this might matter", ADD ONE.',
    '- Do not fundamentally rewrite — adjust specific claims.',
    '',
    weeklySummaryDualFormat(input),
  ].join('\n');
}

/** Term summary draft prompt for 3-pass (combined expert + public). */
export function buildTermSummaryDraftPrompt(input: TermSummaryInput): string {
  return [
    'You are an analyst for a democratic institution monitoring system.',
    'Generate both an expert and a public term-level summary.',
    '',
    `Current week: ${input.weekOf}`,
    '',
    collectTermDataSections(input, 'expert'),
    termInstructions('expert'),
    '',
    '--- OUTPUT FORMAT ---',
    'Produce BOTH sections in your response.',
    '',
    '=== EXPERT NARRATIVE ===',
    '(600-1000 words. Technical term-level analysis for researchers.)',
    '',
    '=== PUBLIC NARRATIVE ===',
    '(400-700 words. Plain-language term summary for journalists and citizens.)',
  ].join('\n');
}

/** Term summary feedback prompt (Pass 2). */
export function buildTermSummaryFeedbackPrompt(
  expertDraft: string,
  publicDraft: string,
  input: TermSummaryInput,
): string {
  return [
    'You are an editorial reviewer for a democratic institution monitoring system.',
    'Review the following term summary drafts against the source data.',
    '',
    '--- EXPERT DRAFT ---',
    expertDraft,
    '',
    '--- PUBLIC DRAFT ---',
    publicDraft,
    '',
    collectTermDataSections(input, 'expert'),
    '',
    '--- REVIEW INSTRUCTIONS ---',
    'Review both drafts against the source data. Provide structured feedback:',
    '',
    '(a) FACTUAL ACCURACY — Does the draft correctly represent the trajectory statistics,',
    'peak convergence week, and status distributions? List any misstatements.',
    '',
    '(b) TRAJECTORY CONSISTENCY — Does the draft accurately characterize the term-level arc?',
    'Does it anchor the arc in the listed SIGNIFICANT WEEKS, referencing them by date',
    'without inventing URLs or unlisted milestone weeks?',
    '',
    '(c) CONFIDENCE CALIBRATION — Quote specific phrases that overstate certainty.',
    '',
    '(d) "WHY THIS MIGHT MATTER" — Does the second paragraph connect the trajectory to',
    'democratic institutions using conditional language? Flag if missing.',
    '',
    '(e) CRITICAL GUIDELINES CHECK — Does the draft characterize TERM-level patterns',
    '(not just this week)? Does it reference pre-computed trajectory statistics directly?',
  ].join('\n');
}

/** Term summary revision prompt (Pass 3). */
export function buildTermSummaryRevisionPrompt(
  expertDraft: string,
  publicDraft: string,
  feedback: string,
  input: TermSummaryInput,
): string {
  return [
    'You are an analyst for a democratic institution monitoring system.',
    'Revise the following term summary drafts based on editorial feedback.',
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
    '--- REVISION INSTRUCTIONS ---',
    'Address each feedback item (a through e):',
    '- If feedback identifies factual errors, CORRECT THEM.',
    '- If feedback identifies trajectory mischaracterization, revise.',
    '- If feedback identifies overstatement, soften the language.',
    '- If feedback flags missing "why this might matter", ADD ONE.',
    '- Do not fundamentally rewrite — adjust specific claims.',
    '',
    '--- OUTPUT FORMAT ---',
    'Produce BOTH sections in your response.',
    '',
    '=== EXPERT NARRATIVE ===',
    '(600-1000 words.)',
    '',
    '=== PUBLIC NARRATIVE ===',
    '(400-700 words.)',
  ].join('\n');
}
