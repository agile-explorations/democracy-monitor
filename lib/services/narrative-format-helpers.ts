import type { NarrativeLayerData } from '@/lib/types';

// ---------------------------------------------------------------------------
// Draft-context formatting helpers extracted from narrative-prompts.ts
// ---------------------------------------------------------------------------

function fmtPct(n: number): string {
  return `${(n * 100).toFixed(1)}%`;
}

/** Whether the data has substantive evidence (P2-confirmed docs and L2 analysis). */
export function hasSubstantiveEvidence(data: NarrativeLayerData): boolean {
  const hasDocs = (data.documentContext?.length ?? 0) > 0;
  const hasL2 = data.aiScore !== null && data.aiDetail !== null;
  return hasDocs || hasL2;
}

/** Shared output format instructions for Pass 1 and Pass 3 drafts. */
export function buildDualOutputFormat(data: NarrativeLayerData): string {
  const substantive = hasSubstantiveEvidence(data);
  const expertRange = substantive ? '400-800' : '200-400';
  const publicRange = substantive ? '200-500' : '150-300';
  const evidenceNote = substantive
    ? ''
    : '\nNote: No P2-confirmed documents or L2 AI analysis is available. Keep the narrative' +
      '\nconcise and focused on what is observable. Do not pad with statistical exposition.';

  return [
    '--- OUTPUT FORMAT ---',
    'Produce BOTH sections in your response:',
    '',
    '=== EXPERT NARRATIVE ===',
    `(${expertRange} words. Technical analysis for researchers. Reference specific z-scores, dimensions,`,
    'and documents by title. Include a Limitations sentence. Present counter-arguments.',
    'Interpret what the combination of signals means rather than restating individual statistics.)',
    '',
    '=== PUBLIC NARRATIVE ===',
    `(${publicRange} words. Plain language for journalists and citizens. No jargon. Describe what`,
    'government actions triggered this. Include a Limitations sentence. Present alternative',
    'explanations. Include a "why this might matter" sentence within the first two paragraphs',
    'that connects the pattern to the democratic institution at stake, using conditional language',
    '("could affect", "may indicate") rather than declarative claims.)',
    evidenceNote,
  ].join('\n');
}

export function formatDocumentSection(data: NarrativeLayerData): string {
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

export function formatFlaggedRoutineSection(data: NarrativeLayerData): string {
  const docs = data.flaggedRoutineContext;
  if (!docs || docs.length === 0) return '';
  const lines = ['--- REVIEWED BUT NOT CONFIRMED (P1-FLAGGED, P2-ROUTINE) ---'];
  for (const doc of docs) {
    const date = doc.publishedAt ? ` (${doc.publishedAt})` : '';
    lines.push(`- ${doc.title} [${doc.sourceType}]${date}`);
  }
  return lines.join('\n');
}

export function formatDocumentSummary(data: NarrativeLayerData): string {
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

export function formatBaselineSection(data: NarrativeLayerData): string {
  const ctx = data.baselineContext;
  if (!ctx) return '--- BASELINE CONTEXT ---\nBaseline context unavailable.';
  return [
    '--- BASELINE CONTEXT ---',
    `Biden 2022 baseline: avg ${ctx.avgDocsPerWeek.toFixed(1)} docs/week, ` +
      `${fmtPct(ctx.avgP2ConcernRate)} P2 concern rate, ` +
      `structural score typically ${ctx.structuralScoreRange}`,
  ].join('\n');
}

export function formatTrajectorySection(data: NarrativeLayerData): string {
  const t = data.trajectory;
  if (!t) return '';
  const lines = ['--- TRAJECTORY ---'];
  if (t.previousWeekStatus) lines.push(`Previous week: ${t.previousWeekStatus}`);
  lines.push(`Consecutive weeks at current level: ${t.consecutiveWeeksAtStatus}`);
  return lines.join('\n');
}

export function formatSourceHealthSection(data: NarrativeLayerData): string {
  const health = data.sourceHealthContext;
  if (!health || health.length === 0) return '';
  const failed = health.filter((s) => s.status === 'failed');
  const partial = health.filter((s) => s.status === 'partial');
  if (failed.length === 0 && partial.length === 0) return '';
  const lines = ['--- SOURCE HEALTH WARNINGS ---'];
  for (const s of failed) {
    const errMsg = s.errors?.length ? `: ${s.errors[0]}` : '';
    lines.push(`  ${s.sourceOrigin}: FAILED (0 items fetched${errMsg})`);
  }
  for (const s of partial) {
    const errMsg = s.errors?.length ? `: ${s.errors[0]}` : '';
    lines.push(`  ${s.sourceOrigin}: PARTIAL (${s.itemsFetched} items${errMsg})`);
  }
  lines.push(
    'Note: Source failures may explain low document volume or missing document types.',
    'Lead with data availability issues before speculating about policy changes.',
  );
  return lines.join('\n');
}

export function formatThematicContextSection(data: NarrativeLayerData): string {
  const typical = data.typicalDocuments;
  const drifting = data.driftDrivingDocuments;
  if ((!typical || typical.length === 0) && (!drifting || drifting.length === 0)) return '';
  const lines = ['--- THEMATIC DRIFT CONTEXT ---'];
  if (typical && typical.length > 0) {
    lines.push('Typical documents from the prior 8 weeks (nearest to rolling centroid):');
    for (const d of typical) {
      const date = d.publishedAt ? ` (${d.publishedAt})` : '';
      lines.push(`  - ${d.title} [${d.sourceType}]${date}`);
    }
  }
  if (drifting && drifting.length > 0) {
    lines.push("This week's documents most divergent from recent norms:");
    for (const d of drifting) {
      const date = d.publishedAt ? ` (${d.publishedAt})` : '';
      lines.push(`  - ${d.title} [${d.sourceType}]${date}`);
    }
    lines.push('Characterize the nature of the thematic shift based on these document titles.');
  }
  return lines.join('\n');
}

/** Collect all context sections for the draft prompt. */
export function collectDraftSections(data: NarrativeLayerData): string[] {
  const sections = [formatDocumentSection(data)];
  const flagged = formatFlaggedRoutineSection(data);
  if (flagged) sections.push(flagged);
  sections.push(formatDocumentSummary(data), formatBaselineSection(data));
  const trajectory = formatTrajectorySection(data);
  if (trajectory) sections.push(trajectory);
  const sourceHealth = formatSourceHealthSection(data);
  if (sourceHealth) sections.push(sourceHealth);
  const thematic = formatThematicContextSection(data);
  if (thematic) sections.push(thematic);
  return sections;
}
