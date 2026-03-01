import { getProvider } from '@/lib/ai/provider';
import type { NarrativeLayerData, NarrativeResult, OverviewNarrativeInput } from '@/lib/types';
import type { ConvergenceStatus } from '@/lib/types/structural';

const NARRATIVE_MODEL = 'claude-opus-4-6';
const ELEVATED_STATUSES = new Set<ConvergenceStatus>(['Elevated', 'Divergent', 'ConfirmedConcern']);

/** Returns true if the convergence status warrants AI narrative generation. */
export function isElevatedStatus(detail: NarrativeLayerData['convergenceDetail']): boolean {
  if (!detail) return false;
  return ELEVATED_STATUSES.has(detail.status);
}

/** Generate a stable-category template narrative (no AI call). */
export function buildStableTemplate(categoryTitle: string, weekOf: string): NarrativeResult {
  const template =
    `No significant structural, AI, or thematic anomalies detected for ${categoryTitle} ` +
    `during the week of ${weekOf}. All three detection layers report within baseline parameters.`;
  return { expert: template, public: template, model: 'template' };
}

/** Build the expert-version prompt for an Elevated+ category. */
export function buildExpertPrompt(data: NarrativeLayerData): string {
  return [
    'You are an analyst for a democratic institution monitoring system.',
    'Write a technical narrative for researchers and analysts.',
    'Be precise, reference specific metrics, and avoid speculation beyond what the data shows.',
    '',
    `Category: ${data.categoryTitle} (${data.category})`,
    `Week of: ${data.weekOf}`,
    '',
    formatLayerContext(data),
    '',
    'Requirements:',
    '- State which layers are elevated and which are not.',
    '- Reference specific z-scores, dimension scores, and distribution shifts.',
    '- Include a "Limitations" sentence acknowledging what the system cannot detect.',
    '- Explain the convergence status and what the pattern of layer agreement means.',
    '- Present counter-arguments ("this could also be explained by...").',
    '- Do not make claims unsupported by the layer data.',
    '- Keep the narrative between 400-800 words.',
    '- This is AI-generated analysis, not a finding of fact.',
  ].join('\n');
}

/** Build the public-version prompt for an Elevated+ category. */
export function buildPublicPrompt(data: NarrativeLayerData): string {
  return [
    'You are a public communicator for a democratic institution monitoring system.',
    'Write a plain-language narrative for journalists and citizens.',
    'Avoid jargon. Explain what changed and why it matters for democratic accountability.',
    '',
    `Category: ${data.categoryTitle} (${data.category})`,
    `Week of: ${data.weekOf}`,
    '',
    formatLayerContext(data),
    '',
    'Requirements:',
    '- State which monitoring layers detected unusual activity and which did not.',
    '- Do NOT reference z-scores, dimension scores, or technical metrics.',
    '- Explain in everyday terms what the changes mean.',
    '- Include a "Limitations" sentence acknowledging what the system cannot detect.',
    '- Explain the overall assessment status and what it means.',
    '- Present alternative explanations where appropriate.',
    '- Do not make claims unsupported by the data.',
    '- Keep the narrative between 200-500 words.',
    '- This is AI-generated analysis, not a finding of fact.',
  ].join('\n');
}

/** Format layer data into a structured context block for the AI prompt. */
export function formatLayerContext(data: NarrativeLayerData): string {
  const sections: string[] = [];
  sections.push(formatConvergenceContext(data));
  sections.push(formatStructuralContext(data));
  sections.push(formatAIContext(data));
  sections.push(formatThematicContext(data));
  return sections.join('\n\n');
}

function formatConvergenceContext(data: NarrativeLayerData): string {
  const lines = ['--- CONVERGENCE SYNTHESIS ---'];
  if (data.convergenceDetail) {
    const d = data.convergenceDetail;
    lines.push(`Status: ${d.status}`);
    lines.push(`Layers elevated: ${d.layersElevated} of 3`);
    lines.push(`Pattern: ${d.pattern}`);
    if (d.bootstrap)
      lines.push('Note: Layer 3 (thematic) is in bootstrap mode (reduced confidence).');
  } else {
    lines.push('No convergence data available.');
  }
  return lines.join('\n');
}

function formatStructuralContext(data: NarrativeLayerData): string {
  const lines = ['--- LAYER 1: STRUCTURAL ANOMALY ---'];
  if (data.structuralScore !== null && data.structuralDetail) {
    const s = data.structuralDetail;
    lines.push(`Composite score: ${data.structuralScore.toFixed(3)}`);
    lines.push(`Anomalous: ${s.anomalous}`);
    const dims = s.dimensions;
    for (const [name, dim] of Object.entries(dims)) {
      if (dim && dim.available) {
        lines.push(`  ${name}: z-score ${dim.zScore.toFixed(2)} (value ${dim.value.toFixed(3)})`);
      }
    }
    if (s.functionalShifts.length > 0) {
      lines.push('Functional shifts:');
      for (const shift of s.functionalShifts) {
        lines.push(
          `  ${shift.bucket}: ${(shift.baselineRate * 100).toFixed(1)}% → ` +
            `${(shift.currentRate * 100).toFixed(1)}% (${shift.direction})`,
        );
      }
    }
  } else {
    lines.push('No structural data available.');
  }
  return lines.join('\n');
}

function formatAIContext(data: NarrativeLayerData): string {
  const lines = ['--- LAYER 2: AI ASSESSMENT ---'];
  if (data.aiScore !== null && data.aiDetail) {
    const a = data.aiDetail;
    lines.push(`AI score: ${data.aiScore.toFixed(3)}`);
    lines.push(`Flag rate: ${(a.flagRate * 100).toFixed(1)}% (${a.flagCount}/${a.totalDocuments})`);
    lines.push(`Baseline flag rate: ${(a.baselineFlagRate * 100).toFixed(1)}%`);
    lines.push(`Flag rate z-score: ${a.flagRateZScore.toFixed(2)}`);
    lines.push(`Concern rate: ${(a.concernRate * 100).toFixed(1)}%`);
    const d = a.concernDistribution;
    lines.push(
      `Concern distribution: routine=${d.routine}, novel_not_concerning=${d.novelNotConcerning}, ` +
        `potentially_concerning=${d.potentiallyConcerning}, clearly_concerning=${d.clearlyConcerning}`,
    );
  } else {
    lines.push('No AI assessment data available.');
  }
  return lines.join('\n');
}

function formatThematicContext(data: NarrativeLayerData): string {
  const lines = ['--- LAYER 3: THEMATIC DRIFT ---'];
  if (data.thematicScore !== null && data.thematicDetail) {
    const t = data.thematicDetail;
    lines.push(`Thematic score: ${data.thematicScore.toFixed(3)}`);
    lines.push(`Centroid distance: ${t.rollingCentroidDistance.toFixed(4)}`);
    lines.push(`Z-score: ${t.zScore.toFixed(2)}`);
    lines.push(`Novel document rate: ${(t.novelDocumentRate * 100).toFixed(1)}%`);
    lines.push(`Variance ratio: ${t.varianceRatio.toFixed(3)}`);
    if (t.bootstrap) lines.push('Bootstrap mode: yes (rolling window still establishing)');
  } else {
    lines.push('No thematic drift data available.');
  }
  return lines.join('\n');
}

/** Generate expert and public narratives for a category. */
export async function generateCategoryNarrative(
  data: NarrativeLayerData,
): Promise<NarrativeResult> {
  if (!isElevatedStatus(data.convergenceDetail)) {
    return buildStableTemplate(data.categoryTitle, data.weekOf);
  }

  const provider = getProvider('anthropic');
  if (!provider.isAvailable()) {
    return buildStableTemplate(data.categoryTitle, data.weekOf);
  }

  const systemPrompt = 'You are an expert analyst for a democratic institution monitoring system.';
  const [expertResult, publicResult] = await Promise.all([
    provider.complete(buildExpertPrompt(data), {
      model: NARRATIVE_MODEL,
      maxTokens: 2048,
      systemPrompt,
    }),
    provider.complete(buildPublicPrompt(data), {
      model: NARRATIVE_MODEL,
      maxTokens: 1024,
      systemPrompt,
    }),
  ]);

  return {
    expert: expertResult.content,
    public: publicResult.content,
    model: expertResult.model,
  };
}

/** Format the elevated categories section for the overview prompt. */
function formatElevatedSection(elevated: NarrativeLayerData[]): string[] {
  if (elevated.length === 0) {
    return ['All categories are within baseline parameters this week.'];
  }
  const lines = ['Elevated categories:'];
  for (const cat of elevated) {
    const status = cat.convergenceDetail?.status ?? 'Unknown';
    lines.push(`  ${cat.categoryTitle} (${cat.category}): ${status}`);
    lines.push(`    Layers elevated: ${cat.convergenceDetail?.layersElevated ?? 0}`);
    lines.push(`    Pattern: ${cat.convergenceDetail?.pattern ?? 'unknown'}`);
  }
  return lines;
}

/** Build the overview prompt for cross-category synthesis. */
export function buildOverviewPrompt(
  input: OverviewNarrativeInput,
  version: 'expert' | 'public',
): string {
  const elevated = input.categories.filter((c) => isElevatedStatus(c.convergenceDetail));
  const stableCount = input.categories.length - elevated.length;

  const header =
    version === 'expert'
      ? 'Write a technical cross-category synthesis for researchers and analysts.'
      : 'Write a plain-language cross-category synthesis for journalists and citizens.';

  const lines = [
    'You are an analyst for a democratic institution monitoring system.',
    header,
    '',
    `Week of: ${input.weekOf}`,
    `Total categories monitored: ${input.categories.length}`,
    `Categories at Elevated or above: ${elevated.length}`,
    `Categories at Stable: ${stableCount}`,
    '',
    ...formatElevatedSection(elevated),
    '',
    ...buildOverviewRequirements(version),
  ];

  return lines.join('\n');
}

function buildOverviewRequirements(version: 'expert' | 'public'): string[] {
  const lines = [
    'Requirements:',
    '- Summarize how many categories are elevated and which layers are most active.',
    '- Note any synchrony patterns (multiple categories elevated simultaneously).',
    '- Include a "Limitations" sentence.',
    '- Do not make claims unsupported by the data.',
    '- This is AI-generated analysis, not a finding of fact.',
  ];
  if (version === 'expert') {
    lines.push('- Reference specific layer patterns and convergence statuses.');
    lines.push('- Keep the narrative between 400-800 words.');
  } else {
    lines.push('- Avoid technical jargon. Use plain language.');
    lines.push('- Keep the narrative between 200-500 words.');
  }
  return lines;
}

/** Generate cross-category overview narratives. */
export async function generateOverviewNarrative(
  input: OverviewNarrativeInput,
): Promise<NarrativeResult> {
  const elevated = input.categories.filter((c) => isElevatedStatus(c.convergenceDetail));

  if (elevated.length === 0) {
    const template =
      `All ${input.categories.length} monitored categories are within baseline parameters ` +
      `for the week of ${input.weekOf}. No structural, AI, or thematic anomalies detected.`;
    return { expert: template, public: template, model: 'template' };
  }

  const provider = getProvider('anthropic');
  if (!provider.isAvailable()) {
    const fallback =
      `${elevated.length} of ${input.categories.length} categories are at Elevated or above ` +
      `for the week of ${input.weekOf}. AI narrative generation unavailable.`;
    return { expert: fallback, public: fallback, model: 'template' };
  }

  const systemPrompt = 'You are an expert analyst for a democratic institution monitoring system.';
  const [expertResult, publicResult] = await Promise.all([
    provider.complete(buildOverviewPrompt(input, 'expert'), {
      model: NARRATIVE_MODEL,
      maxTokens: 2048,
      systemPrompt,
    }),
    provider.complete(buildOverviewPrompt(input, 'public'), {
      model: NARRATIVE_MODEL,
      maxTokens: 1024,
      systemPrompt,
    }),
  ]);

  return {
    expert: expertResult.content,
    public: publicResult.content,
    model: expertResult.model,
  };
}
