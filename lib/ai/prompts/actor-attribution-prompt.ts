/**
 * Client-safe prompt logic for erosion-actor attribution (#537). No DB or
 * provider imports — safe to include in browser bundles (the transparency
 * page renders this prompt). The attribution RUNNER (DB + provider I/O) lives
 * in lib/services/actor-attribution.ts.
 */

import { z } from 'zod';
import { buildActorFramework } from '@/lib/ai/prompts/document-review-pass2';
import { EROSION_ACTORS } from '@/lib/types/structural';
import { extractJsonFromLlm } from '@/lib/utils/ai-helpers';

export const ATTRIBUTION_SYSTEM_PROMPT = `You classify WHICH institutional actor performs the erosion-relevant action
described in a previously assessed government document. You do NOT re-assess
whether the document is concerning — that judgment is already made.
Respond with a single JSON object. No prose, no markdown fences.`;

export const AttributionResponseSchema = z.object({
  erosionActor: z.enum(EROSION_ACTORS),
  confidence: z.number().min(0).max(1),
  rationale: z.string(),
});

export type AttributionResponse = z.infer<typeof AttributionResponseSchema>;

/** Candidate row for attribution: stored P2 assessment joined to its document. */
export interface AttributionCandidate {
  id: number;
  url: string;
  category: string;
  title: string;
  reasoning: string | null;
  citedPassages: string[] | null;
  erosionType: string | null;
  assessment: string | null;
  contentHead: string | null;
  weekOf: string;
}

/** Build the light-pass prompt from stored assessment data. */
export function buildAttributionPrompt(c: AttributionCandidate): string {
  return [
    `Category: ${c.category}`,
    `Document title: ${c.title}`,
    `Prior assessment: ${c.assessment ?? 'unknown'} (erosion type: ${c.erosionType ?? 'unknown'})`,
    '',
    'Assessment reasoning (from the prior review):',
    c.reasoning || '(none recorded)',
    '',
    'Cited passages:',
    ...(c.citedPassages?.length ? c.citedPassages.map((p) => `  - "${p}"`) : ['  (none)']),
    '',
    'Document opening:',
    c.contentHead || '(content unavailable)',
    '',
    buildActorFramework(),
    '',
    'Respond with JSON:',
    '{',
    '  "erosionActor": "federal_executive" | "congress" | "judiciary" | "state_local" | "other_unclear",',
    '  "confidence": number (0-1),',
    '  "rationale": string (1 sentence: who performs the erosion-relevant action and why)',
    '}',
  ].join('\n');
}

/** Parse an attribution response; null when unparseable. */
export function parseAttributionResponse(raw: string): AttributionResponse | null {
  const parsed = extractJsonFromLlm(raw);
  if (!parsed) return null;
  const result = AttributionResponseSchema.safeParse(parsed);
  return result.success ? result.data : null;
}
