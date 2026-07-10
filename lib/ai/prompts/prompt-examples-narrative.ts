/**
 * Narrative-pipeline prompt examples for the transparency page.
 * Split from prompt-examples.ts (max-lines).
 */

import type { PromptExample } from './prompt-examples';

const NARRATIVE_DRAFT_INSTRUCTIONS = `You are an analyst for a democratic institution monitoring system.
Generate both an expert and a public narrative for this category-week assessment.
Focus on what happened in the real world, not how the monitoring system works.
Minimize self-referential language about "our system" or "our layers".
Reference specific documents as markdown links: [document title](URL). Use the URL from each document's metadata.
When describing what happened, ground claims in the "WHY THIS WAS FLAGGED" reasoning for
each document — it contains event-level descriptions from a separate AI review of the full text.
This is AI-generated analysis, not a finding of fact.
Do not make claims unsupported by the data.

CRITICAL: Your second paragraph in BOTH narratives MUST include a "why this might matter"
sentence connecting the pattern to the specific democratic institution at stake.

COUNTER-ARGUMENTS:
For every concern you raise, include a weighted counter-argument. Rank alternative
explanations by plausibility — lead with the most likely benign explanation. Stronger
evidence warrants a briefer counter-argument; weaker evidence warrants a more prominent one.
Limit to 2-3 alternative explanations in the PUBLIC narrative, 3-4 in the EXPERT narrative.
Do not list all possibilities with equal weight.

[Layer scores, document details, and source data for the category-week are injected here]

--- OUTPUT FORMAT ---
Produce BOTH sections in your response.
Aim for the LOWER end of each word range unless the evidence demands the upper end.

=== EXPERT NARRATIVE ===
(400-800 words. Technical analysis for researchers. Reference specific documents by title.
Include a Limitations sentence. Present counter-arguments.
Focus on what P2 found in the documents and what it means — do not restate L1 or L3 statistics.
L1 structural and L3 thematic data are descriptive context only; they do NOT drive concern status.
Your second paragraph MUST include a "why this might matter" sentence connecting the pattern
to the democratic institution at stake, using conditional language ("could affect", "may indicate").
Name the observable fact and the institution at risk — not generic "democratic norms".)

=== PUBLIC NARRATIVE ===
(200-500 words. Plain language for general audiences. No jargon.
Include a Limitations sentence. Present counter-arguments.
Your second paragraph MUST include a "why this might matter" sentence.)`;

const NARRATIVE_FEEDBACK_INSTRUCTIONS = `You are an editorial reviewer for a democratic institution monitoring system.
Review the following AI-generated narrative drafts against the source data.

[Expert and public drafts, plus source data, are provided here]

--- REVIEW INSTRUCTIONS ---
Review both drafts against the source data. Provide structured feedback:

(a) FACTUAL ACCURACY — Does the draft correctly represent the layer scores and document
content? List any specific misstatements.

(b) CONFIDENCE CALIBRATION — Does the draft overstate certainty or imply causation from
correlation? Quote specific phrases that need softening.

(c) MISSING COUNTER-ARGUMENTS — Are there plausible benign explanations the draft didn't
consider? Suggest specific alternatives.

(d) CHARACTERIZATION CONCERNS — Does the draft describe government actions in language that
goes beyond what the documents say? Flag specific phrases.

(e) BALANCE — If the draft characterizes a government action, does it also note any stated
justification from the administration's own documents? What's missing?

(f) EVIDENCE SUFFICIENCY — Is the narrative length proportional to the available evidence?
If no P2-confirmed documents or L2 AI analysis are present, the narrative should be
concise. Flag any sections that pad length beyond what the data supports.

(g) "WHY THIS MIGHT MATTER" — Do both narratives include a sentence within the first two
substantive paragraphs that connects the observed pattern to a specific democratic institution
or protection at stake? The sentence must use conditional language ("could affect",
"may indicate"). If this sentence is missing from either narrative, flag it as the
highest-priority revision item.

(h) COUNTER-ARGUMENT COUNT — The expert narrative should have 3-4 alternative
explanations and the public narrative 2-3. If either exceeds these limits, flag the excess
items for removal (drop the least plausible ones).`;

const NARRATIVE_REVISION_INSTRUCTIONS = `You are an analyst for a democratic institution monitoring system.
Revise the following drafts based on editorial feedback.

[Original drafts, editorial feedback, and source data are provided here]

--- REVISION INSTRUCTIONS ---
Address each feedback item (a through h):
- Revise where feedback identifies legitimate issues.
- Do not fundamentally rewrite — adjust, soften, or strengthen specific claims.
- If feedback identifies a factual error, correct it.
- If feedback identifies overstatement, soften the language.
- If feedback suggests missing counter-arguments, add them.
- If feedback flags characterization concerns, revise the phrasing.
- If feedback notes missing balance, incorporate stated justifications.
- If feedback flags evidence insufficiency, trim the narrative to match available data.
- If feedback flags a missing "why this might matter" sentence, ADD ONE. This is mandatory.
- If feedback flags missing small-sample acknowledgment, add a note about limited statistical
  reliability due to the small document count.
- If feedback flags excess counter-arguments, remove the least plausible ones to meet the limit.`;

export function narrativeDraftExample(): PromptExample {
  return {
    id: 'narrative-draft',
    label: 'Narrative Draft Generation',
    description:
      'For categories at Elevated or above, generates both expert and public narrative drafts. Counter-arguments are mandatory and must be ranked by plausibility.',
    model: 'Claude Opus (Anthropic)',
    systemPrompt:
      'You are an expert analyst for a democratic institution monitoring system. You produce rigorous, evidence-based analysis grounded in specific documents and metrics.',
    userPrompt: NARRATIVE_DRAFT_INSTRUCTIONS,
    variables: [
      {
        variable: 'layerScores',
        description:
          'Structural, AI, and thematic scores with detailed breakdowns for the category-week',
        example: 'Structural: 3.2 (z-score), AI: Elevated (2 clearly concerning), Thematic: 0.15',
      },
      {
        variable: 'documentContext',
        description:
          'P2-assessed documents with titles, URLs, assessment reasoning, and cited passages',
        example: '3-5 documents with full P2 review details',
      },
    ],
  };
}

export function narrativeFeedbackExample(): PromptExample {
  return {
    id: 'narrative-feedback',
    label: 'Narrative Editorial Review',
    description:
      'A separate AI provider reviews both drafts against the source data, checking for overstatement, missing counter-arguments, and factual accuracy. This is the primary fairness gate.',
    model: 'GPT-4o (OpenAI)',
    systemPrompt:
      'You are an independent editorial reviewer for a democratic institution monitoring system. Your role is epistemic auditing — checking factual accuracy, confidence calibration, and balanced characterization of government actions.',
    userPrompt: NARRATIVE_FEEDBACK_INSTRUCTIONS,
    variables: [
      {
        variable: 'expertDraft',
        description: 'The expert narrative draft from the draft generation pass',
        example: '[400-800 word expert draft]',
      },
      {
        variable: 'publicDraft',
        description: 'The public narrative draft from the draft generation pass',
        example: '[200-500 word public draft]',
      },
    ],
  };
}

export function narrativeRevisionExample(): PromptExample {
  return {
    id: 'narrative-revision',
    label: 'Narrative Revision',
    description:
      'The original drafter revises both narratives based on editorial feedback, addressing each item without fundamentally rewriting.',
    model: 'Claude Opus (Anthropic)',
    systemPrompt:
      'You are an expert analyst for a democratic institution monitoring system. You are revising a draft narrative based on structured editorial feedback. Address each feedback item, but do not fundamentally rewrite the analysis.',
    userPrompt: NARRATIVE_REVISION_INSTRUCTIONS,
    variables: [
      {
        variable: 'feedback',
        description: 'Structured editorial feedback from the review pass (items a through h)',
        example: '[Detailed feedback addressing each criterion]',
      },
    ],
  };
}
