/**
 * Prompt vintage stamped on stored P2 assessments (#557). BUMP THIS (to the
 * change date) whenever PASS2_SYSTEM_PROMPT or buildPass2Prompt changes
 * substantively — it is how cross-vintage confirmation drift is attributed.
 * Current vintage: actor attribution decoupled from P2 (53c761a, #537).
 */
export const PASS2_PROMPT_VERSION = 'p2-2026-07-10';

export const PASS2_SYSTEM_PROMPT = `You are a skeptical policy analyst reviewing flagged government documents.
An automated classifier flagged this document as potentially relevant to institutional erosion.
Your job is to independently assess whether the concern is warranted.

Be rigorous: consider counter-arguments, historical precedent, and whether the activity
could be routine governance. Cite specific passages from the document text.

You MUST respond with a single JSON object. No prose, no markdown fences.`;

/**
 * Week-level context injected into P2 prompts (B-E variant).
 * Built by the orchestrator from P1 results + database queries.
 */
export interface Pass2WeekContext {
  categoryTitle: string;
  expertDescription: string;
  totalDocs: number;
  flaggedDocs: number;
  flagRate: number;
  baselineAvgFlagRate: number;
  flaggedPeers: Array<{ title: string; erosionType: string }>;
  priorWeekTotalDocs: number;
  priorWeekFlaggedDocs: number;
  priorWeekFlagRate: number;
  priorWeekPeers: Array<{ title: string; erosionType: string }>;
  trajectory: string;
}

const TEXT_EXCERPT_LENGTH = 8000;

/**
 * Build the P2 user prompt.
 *
 * When `weekContext` is provided, generates the B-E format with:
 *   - Expert institutional framing
 *   - P1 stats and peer titles for the current + prior week
 *   - Trajectory label
 *   - Rhetoric framing for congressional floor speeches
 *
 * When `weekContext` is omitted, falls back to the original format (backward compat).
 */
export function buildPass2Prompt(
  title: string,
  fullText: string | undefined,
  pass1Signals: string[],
  pass1ErosionType: string,
  categoryDescription: string,
  weekContext?: Pass2WeekContext,
  docType?: string,
  docLink?: string,
): string {
  const textExcerpt = fullText
    ? fullText.slice(0, TEXT_EXCERPT_LENGTH)
    : '(full text not available)';

  if (!weekContext) {
    return buildBaselinePrompt(
      title,
      textExcerpt,
      pass1Signals,
      pass1ErosionType,
      categoryDescription,
    );
  }

  return buildContextualPrompt(
    title,
    textExcerpt,
    pass1Signals,
    pass1ErosionType,
    weekContext,
    docType,
    docLink,
  );
}

/** Original A-format prompt (no week context). */
function buildBaselinePrompt(
  title: string,
  textExcerpt: string,
  pass1Signals: string[],
  pass1ErosionType: string,
  categoryDescription: string,
): string {
  return [
    `Category concern: ${categoryDescription}`,
    '',
    `Pass 1 flagged this document with signals: ${pass1Signals.join(', ') || '(none)'}`,
    `Pass 1 erosion type: ${pass1ErosionType}`,
    '',
    `Document title: ${title}`,
    '',
    'Document text (excerpt):',
    textExcerpt,
    '',
    buildErosionFramework(),
    '',
    buildResponseSchema(),
  ].join('\n');
}

/** Build the week-context header lines from Pass2WeekContext. */
function buildContextHeader(ctx: Pass2WeekContext): string[] {
  const flagPct = (ctx.flagRate * 100).toFixed(1);
  const baselinePct = (ctx.baselineAvgFlagRate * 100).toFixed(1);
  const priorPct = (ctx.priorWeekFlagRate * 100).toFixed(1);

  const lines = [
    `Category context for ${ctx.categoryTitle}:`,
    `  Institutional framing: ${ctx.expertDescription}`,
    `  This week: ${ctx.totalDocs} documents assessed, ${ctx.flaggedDocs} flagged by Pass 1 (${flagPct}%)`,
    `  Baseline average flag rate: ${baselinePct}%`,
  ];

  if (ctx.flaggedPeers.length > 0) {
    lines.push('  Notable flagged peers this week:');
    for (const peer of ctx.flaggedPeers) lines.push(`    - "${peer.title}" (${peer.erosionType})`);
  }

  lines.push(
    `  Prior week: ${ctx.priorWeekTotalDocs} documents, ${ctx.priorWeekFlaggedDocs} flagged (${priorPct}%)`,
  );
  if (ctx.priorWeekPeers.length > 0) {
    lines.push('  Notable flagged peers last week:');
    for (const peer of ctx.priorWeekPeers)
      lines.push(`    - "${peer.title}" (${peer.erosionType})`);
  }
  lines.push(`  Trajectory: ${ctx.trajectory}`);
  return lines;
}

/** CREC rhetoric framing note for congressional floor speeches. */
const CREC_FRAMING = [
  'Note: This is a congressional floor speech. Congressional rhetoric is analytically',
  'significant because it reflects how legislators characterize government actions.',
  'Assess whether the rhetoric signals institutional pressure, policy intent, or erosion',
  'framing — not just whether a formal government action is described. A floor speech',
  'denouncing an executive action IS evidence of institutional conflict.',
  '',
  'In your reasoning, identify what specific executive action or policy this speech is',
  'responding to (e.g., "This floor speech responds to the mass IG firing of January 24.',
  'The speaker characterizes it as undermining congressional oversight authority.").',
  '',
].join('\n');

/** B-E format prompt with week context, peer titles, and rhetoric framing. */
function buildContextualPrompt(
  title: string,
  textExcerpt: string,
  pass1Signals: string[],
  pass1ErosionType: string,
  ctx: Pass2WeekContext,
  docType?: string,
  docLink?: string,
): string {
  const parts = [
    ...buildContextHeader(ctx),
    '',
    `Pass 1 flagged this document with signals: ${pass1Signals.join(', ') || '(none)'}`,
    `Pass 1 erosion type: ${pass1ErosionType}`,
    '',
    `Document title: ${title}`,
    '',
    'Document text (excerpt):',
    textExcerpt,
    '',
  ];

  if (isCRECDocument(docType, docLink)) parts.push(CREC_FRAMING);
  parts.push(buildErosionFramework(), '', buildReasoningGuidance(), '', buildResponseSchema());
  return parts.join('\n');
}

function isCRECDocument(docType?: string, docLink?: string): boolean {
  if (docType === 'floor_speech') return true;
  if (docLink?.includes('/CREC-')) return true;
  return false;
}

export function buildErosionFramework(): string {
  return [
    'Erosion type framework:',
    '  - formal_override: explicit legal/policy changes that remove protections',
    '  - operational_hollowing: staffing cuts, budget reductions, unfilled positions that degrade capacity',
    '  - noncompliance_refusal: ignoring court orders, defying oversight, refusing information requests',
    '  - routine: normal administrative activity with no erosion signal',
    '  - unclear: insufficient information to classify',
  ].join('\n');
}

/**
 * Actor attribution framework (#537). Classifies WHO performs the
 * erosion-relevant action — orthogonal to erosionType (the mechanism).
 * DELIBERATELY NOT injected into the live P2 prompt: a 3-arm calibration A/B
 * (2026-07-10) measured 11.1pp of prompt-attributable assessment drift above
 * a 97.8% same-prompt noise floor, so attribution runs as a fully decoupled
 * light pass (lib/services/actor-attribution.ts) over stored assessments —
 * P2 calibration stays byte-identical by construction. This builder is the
 * single source of the taxonomy text for that pass.
 */
export function buildActorFramework(): string {
  return [
    'Erosion actor framework (attribution only — applies AFTER your assessment):',
    'First complete your concern assessment exactly as you would without this section.',
    'Then, separately, classify WHO performs the action you assessed. This is the actor',
    "whose conduct weakens the institutional protection — NOT the document's author,",
    'court, or venue. Attribution must not influence assessment, confidence, or reasoning.',
    '  - federal_executive: President, federal agencies, DOJ, federal officials',
    '  - congress: federal legislation or congressional actions that themselves erode protections',
    '  - judiciary: courts removing protections through their own rulings',
    '  - state_local: state/county/municipal governments, police, jails, or state courts acting as eroders',
    '  - other_unclear: non-governmental actors, mixed/inseparable, or insufficient information',
    'Disambiguation rules:',
    "  - A court opinion DOCUMENTING another actor's erosion takes that actor's label",
    '    (an opinion finding a federal agency defied a court order = federal_executive).',
    '  - A court ruling AGAINST an actor is a check functioning, not judicial erosion —',
    "    the actor being checked is the eroder. Use judiciary only when the court's own",
    '    ruling removes the protection.',
    '  - A bill or congressional rule that itself erodes = congress; a floor speech',
    '    describing an executive action takes federal_executive (the speech is evidence',
    '    about that action).',
    '  - State implementing a federal mandate = federal_executive (policy origin);',
    '    state_local only where the state exceeds the mandate or the policy is its own.',
    '  - Erosion by inaction (refusal to enforce or comply) attributes to the actor',
    '    holding the duty.',
    'Examples:',
    '  - Opinion: federal agency held in contempt for ignoring discovery orders -> federal_executive',
    '  - Appellate ruling that itself removes a constitutional protection -> judiciary',
    '  - Bill restricting protest rights or stripping court jurisdiction -> congress',
    '  - County jail contempt finding for unconstitutional conditions -> state_local',
    '  - Floor speech condemning mass firing of inspectors general -> federal_executive',
    '  - Private-actor intimidation with no government action -> other_unclear',
  ].join('\n');
}

export function buildReasoningGuidance(): string {
  return [
    'Reasoning guidance:',
    '  - Name the specific institutional protection affected and the specific mechanism',
    '    by which it is weakened (e.g., "removes the employee grievance pathway for',
    '    performance ratings" not "represents a potential erosion of civil service protections").',
    '  - If other flagged documents this week relate to the same policy action or',
    '    institutional pressure, note the connection in your reasoning.',
  ].join('\n');
}

export function buildResponseSchema(): string {
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
