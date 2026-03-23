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
  sections.push(formatTrajectorySummary(input.trajectoryTable), '');
  sections.push('--- KEY STATISTICS ---', formatTermStatistics(input.statistics), '');
  return sections.join('\n');
}

function termCriticalGuidelines(): string[] {
  return [
    'CRITICAL GUIDELINES:',
    "- Critically evaluate the previous summary's framing against this week's data. If new",
    '  data contradicts a pattern described in the previous summary, note the correction',
    '  explicitly rather than silently revising.',
    '- Characterize TERM-LEVEL layer patterns (e.g., "L1 has driven X% of elevations over',
    '  N weeks"), not this week\'s specific layer configuration — that belongs in the weekly.',
    "  Do not spend more than 2-3 sentences on this week's specific layer activity.",
    '- The trajectory summary above is pre-computed. Reference its statistics directly;',
    '  do not reconstruct per-week data sequences.',
    '- When referencing a specific document by name, preserve its markdown link from the source material.',
    '- Do not inherit framings uncritically from the previous summary. Each claim in the',
    '  updated summary should be justified by the current data.',
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

/** Term summary prompt — incremental update. Single pass for expert or public. */
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
