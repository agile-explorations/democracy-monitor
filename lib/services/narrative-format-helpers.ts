import type { NarrativeLayerData } from '@/lib/types';
import { mean } from '@/lib/utils/math';

// ---------------------------------------------------------------------------
// Draft-context formatting helpers extracted from narrative-prompts.ts
// ---------------------------------------------------------------------------

function fmtPct(n: number): string {
  return `${(n * 100).toFixed(1)}%`;
}

function fmtNum(n: number, decimals = 3): string {
  return n.toFixed(decimals);
}

/** Whether the data has substantive evidence (P2-confirmed docs and L2 analysis). */
export function hasSubstantiveEvidence(data: NarrativeLayerData): boolean {
  const hasDocs = (data.documentContext?.length ?? 0) > 0;
  const hasL2 = data.aiScore !== null && data.aiDetail !== null;
  return hasDocs || hasL2;
}

/** Build conditional caveats for evidence quality and sample size. */
function buildEvidenceCaveats(data: NarrativeLayerData, substantive: boolean): string {
  const caveats: string[] = [];
  if (!substantive) {
    caveats.push(
      'L2 DATA AVAILABILITY: No P2-confirmed documents or L2 AI analysis is available.',
      'State explicitly within the first two paragraphs that this assessment is based on',
      'structural pattern detection only — no individual document was analyzed for content.',
      'Keep the narrative concise and focused on what is observable. Do not pad with',
      'statistical exposition.',
    );
  }
  const docCount = data.totalDocumentCount ?? 0;
  if (docCount < 20) {
    caveats.push(
      `SMALL SAMPLE SIZE: Only ${docCount} documents this week.`,
      'Limit functional distribution analysis to one sentence and note the small sample size.',
      'A single document entering or leaving the sample can shift percentages dramatically.',
    );
  }
  if (docCount < 10) {
    caveats.push(
      'VERY LOW VOLUME: Summarize the structural anomaly in 1-2 sentences rather than',
      'listing individual z-scores. Spend your word budget on the documents and their significance.',
    );
  }
  return caveats.length > 0 ? '\n' + caveats.join('\n') : '';
}

/** Shared output format instructions for Pass 1 and Pass 3 drafts. */
export function buildDualOutputFormat(data: NarrativeLayerData): string {
  const substantive = hasSubstantiveEvidence(data);
  const expertRange = substantive ? '400-800' : '200-400';
  const publicRange = substantive ? '200-500' : '150-300';
  const evidenceNote = buildEvidenceCaveats(data, substantive);

  return [
    '--- OUTPUT FORMAT ---',
    'Produce BOTH sections in your response.',
    'Aim for the LOWER end of each word range unless the evidence demands the upper end.',
    '',
    '=== EXPERT NARRATIVE ===',
    `(${expertRange} words. Technical analysis for researchers. Reference specific z-scores, dimensions,`,
    'and documents by title. Include a Limitations sentence. Present counter-arguments.',
    'Interpret what the combination of signals means rather than restating individual statistics.',
    'Your second paragraph MUST include a "why this might matter" sentence connecting the pattern',
    'to the democratic institution at stake, using conditional language ("could affect", "may indicate").',
    'Name the observable fact and the institution at risk — not generic "democratic norms".)',
    '',
    '=== PUBLIC NARRATIVE ===',
    `(${publicRange} words. Plain language for journalists and citizens. No jargon. Describe what`,
    'government actions triggered this. Include a Limitations sentence. Present alternative explanations.',
    'Your second paragraph MUST include a "why this might matter" sentence connecting the pattern',
    'to the democratic institution at stake, using conditional language ("could affect", "may indicate").',
    'Example: "This might matter because [observable fact] could affect [specific institution or',
    'protection], which [why that institution exists].")',
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
    const meta: string[] = [
      `Source: ${doc.sourceType}${doc.sourceOrigin ? ` (${doc.sourceOrigin})` : ''}`,
    ];
    if (doc.publishedAt) meta.push(`Published: ${doc.publishedAt}`);
    if (doc.agency) meta.push(`Agency: ${doc.agency}`);
    lines.push(`  ${meta.join(' | ')}`);
    if (doc.url) lines.push(`  URL: ${doc.url}`);
    const assess: string[] = [`Assessment: ${doc.assessment}`];
    if (doc.erosionType) assess.push(`Erosion type: ${doc.erosionType}`);
    lines.push(`  ${assess.join(' | ')}`);
    if (doc.reasoning) lines.push(`  >>> WHY THIS WAS FLAGGED: ${doc.reasoning}`);
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

// ---------------------------------------------------------------------------
// Trajectory summary (pre-computed for term summary prompts)
// ---------------------------------------------------------------------------

const ELEVATED_STATUSES = new Set(['Elevated', 'Divergent', 'ConfirmedConcern']);

function trendWord(weekCounts: number[], avg: number): string {
  const halfIdx = Math.floor(weekCounts.length / 2);
  const firstHalfAvg = mean(weekCounts.slice(0, halfIdx));
  const secondHalfAvg = mean(weekCounts.slice(halfIdx));
  const recentAvg = mean(weekCounts.slice(-4));
  if (recentAvg > avg * 1.3) return 'rising recently';
  if (firstHalfAvg > 0 && secondHalfAvg < firstHalfAvg * 0.7) return 'declining from early peak';
  if (firstHalfAvg > 0 && Math.abs(secondHalfAvg - firstHalfAvg) / firstHalfAvg < 0.2) {
    return 'relatively stable';
  }
  if (secondHalfAvg > firstHalfAvg) return 'gradually increasing';
  return 'gradually declining';
}

type TrajectoryRow = { category: string; weekOf: string; status: string };
type StatusLookup = Map<string, Map<string, string>>;

function buildStatusLookup(table: TrajectoryRow[]): StatusLookup {
  const lookup: StatusLookup = new Map();
  for (const row of table) {
    if (!lookup.has(row.category)) lookup.set(row.category, new Map());
    lookup.get(row.category)!.set(row.weekOf, row.status);
  }
  return lookup;
}

function computeStreaks(
  categories: string[],
  weeks: string[],
  lookup: StatusLookup,
): Array<{ category: string; length: number; start: string; end: string }> {
  const streaks: Array<{ category: string; length: number; start: string; end: string }> = [];
  for (const c of categories) {
    const catWeeks = lookup.get(c)!;
    let maxLen = 0,
      maxStart = '',
      maxEnd = '',
      curLen = 0,
      curStart = '';
    for (const w of weeks) {
      const s = catWeeks.get(w);
      if (s != null && ELEVATED_STATUSES.has(s)) {
        if (curLen === 0) curStart = w;
        curLen++;
        if (curLen > maxLen) {
          maxLen = curLen;
          maxStart = curStart;
          maxEnd = w;
        }
      } else {
        curLen = 0;
      }
    }
    if (maxLen > 1) streaks.push({ category: c, length: maxLen, start: maxStart, end: maxEnd });
  }
  return streaks.sort((a, b) => b.length - a.length);
}

function computeTransitions(
  categories: string[],
  weeks: string[],
  lookup: StatusLookup,
): Array<{ category: string; from: string; to: string; week: string }> {
  const transitions: Array<{ category: string; from: string; to: string; week: string }> = [];
  for (const c of categories) {
    const catWeeks = lookup.get(c)!;
    for (let i = weeks.length - 1; i >= 1 && i >= weeks.length - 4; i--) {
      const prev = catWeeks.get(weeks[i - 1]);
      const cur = catWeeks.get(weeks[i]);
      if (prev && cur && prev !== cur) {
        transitions.push({ category: c, from: prev, to: cur, week: weeks[i] });
      }
    }
  }
  return transitions.sort((a, b) => b.week.localeCompare(a.week));
}

function computeActivations(
  categories: string[],
  weeks: string[],
  lookup: StatusLookup,
): Array<{ category: string; elev: number; total: number; rate: number; current: string }> {
  return categories
    .map((c) => {
      const cw = lookup.get(c)!;
      const total = cw.size;
      const elev = [...cw.values()].filter((s) => ELEVATED_STATUSES.has(s)).length;
      return {
        category: c,
        elev,
        total,
        rate: total > 0 ? elev / total : 0,
        current: cw.get(weeks[weeks.length - 1]) ?? 'unknown',
      };
    })
    .sort((a, b) => b.rate - a.rate);
}

function computeWeekCounts(
  weeks: string[],
  categories: string[],
  lookup: StatusLookup,
): Array<{ week: string; count: number }> {
  return weeks.map((w) => ({
    week: w,
    count: categories.filter((c) => {
      const s = lookup.get(c)?.get(w);
      return s != null && ELEVATED_STATUSES.has(s);
    }).length,
  }));
}

/** Pre-computed trajectory summary replacing the raw per-week trajectory table. */
export function formatTrajectorySummary(table: TrajectoryRow[]): string {
  if (table.length === 0) return '--- TRAJECTORY SUMMARY ---\nNo trajectory data available.';

  const weeks = [...new Set(table.map((r) => r.weekOf))].sort();
  const categories = [...new Set(table.map((r) => r.category))].sort();
  const lookup = buildStatusLookup(table);
  const weekCounts = computeWeekCounts(weeks, categories, lookup);
  const peak = weekCounts.reduce((best, e) => (e.count > best.count ? e : best), weekCounts[0]);
  const counts = weekCounts.map((e) => e.count);
  const avg = mean(counts);
  const activations = computeActivations(categories, weeks, lookup);
  const streaks = computeStreaks(categories, weeks, lookup);
  const transitions = computeTransitions(categories, weeks, lookup);
  const last4 = weekCounts.slice(-4).map((e) => e.count);

  const lines = [
    '--- TRAJECTORY SUMMARY ---',
    `Term span: ${weeks[0]} to ${weeks[weeks.length - 1]} (${weeks.length} weeks)`,
    '',
    'Per-week elevated-or-above count:',
    `  Peak: ${peak.count} (week of ${peak.week})`,
    `  Average: ${avg.toFixed(1)}/week`,
    `  Recent 4 weeks: ${last4.join(', ')}`,
    `  Trend: ${trendWord(counts, avg)}`,
    '',
    'Most active categories (by % of weeks elevated-or-above):',
  ];
  for (const a of activations.slice(0, 6)) {
    lines.push(
      `  ${a.category}: ${a.elev}/${a.total} weeks (${(a.rate * 100).toFixed(1)}%) — currently ${a.current}`,
    );
  }
  if (streaks.length > 0) {
    lines.push('', 'Longest consecutive elevated streaks:');
    for (const s of streaks.slice(0, 4))
      lines.push(`  ${s.category}: ${s.length} weeks (${s.start} → ${s.end})`);
  }
  if (transitions.length > 0) {
    lines.push('', 'Recent transitions (last 4 weeks):');
    for (const t of transitions) lines.push(`  ${t.category}: ${t.from} → ${t.to} (${t.week})`);
  }
  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Layer assessment formatting (shared across Pass 1, Pass 2, Pass 3)
// ---------------------------------------------------------------------------

function layersFiredSummary(data: NarrativeLayerData): string {
  const cd = data.convergenceDetail;
  if (!cd) return 'Convergence data unavailable.';
  const active: string[] = [];
  const context: string[] = [];
  if (cd.aiElevated) active.push('L2 AI content assessment');
  if (cd.silenceElevated) context.push('L1v2 silence (source health indicator)');
  if (cd.structuralElevated) context.push('L1 structural anomaly');
  if (cd.thematicElevated) context.push('L3 thematic drift');
  const parts: string[] = [];
  if (active.length > 0) parts.push(`Active detection layers elevated: ${active.join(', ')}`);
  if (context.length > 0) parts.push(`Descriptive context elevated: ${context.join(', ')}`);
  return parts.length === 0 ? 'No layers elevated.' : `${parts.join('. ')}.`;
}

function statusExplanation(data: NarrativeLayerData): string {
  const cd = data.convergenceDetail;
  if (!cd) return '';
  const parts: string[] = [];
  // Active detection layers (drive convergence status)
  if (cd.aiElevated && data.aiDetail) {
    parts.push(
      `L2 AI content assessment elevated with ${fmtPct(data.aiDetail.concernRate)} concern rate (baseline: ${fmtPct(data.aiDetail.baselineFlagRate)})`,
    );
  }
  // Descriptive context (does not drive status, but provides narrative grounding)
  if (cd.silenceElevated) {
    parts.push('L1v2 conspicuous government silence detected (source health indicator)');
  }
  if (cd.structuralElevated && data.structuralScore !== null) {
    parts.push(
      `L1 structural context: score ${fmtNum(data.structuralScore)} with ${data.totalDocumentCount ?? 0} documents (descriptive only)`,
    );
  }
  if (cd.thematicElevated && data.thematicScore !== null) {
    parts.push(`L3 thematic drift context: score ${fmtNum(data.thematicScore)} (descriptive only)`);
  }
  return parts.length === 0
    ? `${cd.status}: ${cd.pattern}.`
    : `${cd.status} because ${parts.join('. ')}.`;
}

function formatConvergenceBlock(data: NarrativeLayerData): string[] {
  const cd = data.convergenceDetail;
  if (!cd) return ['Convergence data: unavailable.'];
  const lines = [
    `Convergence status: ${cd.status} (${cd.layersElevated} of 1 active detection layer elevated)`,
    `Active layer: L2 (AI content assessment) — sole detection layer driving status`,
    `Descriptive context: L1 (structural), L1v2 (silence/source health), L3 (thematic) — do not drive status`,
    `Pattern: ${cd.pattern}`,
    layersFiredSummary(data),
  ];
  if (cd.bootstrap) lines.push('Note: L3 (thematic) is in bootstrap mode — reduced confidence.');
  return lines;
}

/** Threshold below which functional distribution shifts are unreliable. */
const SMALL_SAMPLE_THRESHOLD = 20;

function formatL1Block(data: NarrativeLayerData): string[] {
  const lines = ['', 'L1 Structural:'];
  if (data.structuralScore === null || !data.structuralDetail) {
    return [...lines, '  No structural data available.'];
  }
  const s = data.structuralDetail;
  lines.push(`  Composite score: ${fmtNum(data.structuralScore)}`, `  Anomalous: ${s.anomalous}`);
  if ((data.totalDocumentCount ?? 0) < SMALL_SAMPLE_THRESHOLD) {
    lines.push(
      `  Note: only ${data.totalDocumentCount ?? 0} documents this week — ` +
        'functional distribution shifts have limited diagnostic value.',
    );
  }
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
    return [
      ...lines,
      '  No AI assessment data available.',
      '  IMPORTANT: No AI content analysis was performed this week. This assessment is based',
      '  on structural pattern detection only, not on review of document content.',
    ];
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
export function formatLayerAssessment(data: NarrativeLayerData): string {
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
