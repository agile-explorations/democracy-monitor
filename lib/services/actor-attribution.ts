/**
 * Pure logic for the erosion-actor attribution light pass (#537).
 *
 * Historical P2 rows cannot receive erosionActor via P2 re-runs (the
 * (url, category, pass, model) unique constraint + onConflictDoNothing makes
 * same-model re-runs silent no-ops), so attribution runs as a separate cheap
 * classification over STORED assessment data (title + reasoning + cited
 * passages + a content head), writing back via UPDATE-by-id. The prompt
 * reuses buildActorFramework() so the taxonomy text is byte-identical to the
 * live P2 prompt. Attribution never changes assessments — this module only
 * ever produces an actor label.
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

/**
 * Deterministic stratified sample: proportional per category with a floor,
 * evenly spaced within each category (rows must be pre-sorted by id for
 * reproducibility across runs).
 */
export function stratifiedSample<T extends { category: string }>(
  rows: T[],
  target: number,
  floorPerCategory = 5,
): T[] {
  const byCategory = new Map<string, T[]>();
  for (const row of rows) {
    const list = byCategory.get(row.category) ?? [];
    list.push(row);
    byCategory.set(row.category, list);
  }

  const total = rows.length;
  const sampled: T[] = [];
  for (const list of byCategory.values()) {
    const proportional = Math.round((list.length / total) * target);
    const take = Math.min(list.length, Math.max(floorPerCategory, proportional));
    const step = Math.max(1, Math.floor(list.length / take));
    sampled.push(...list.filter((_, i) => i % step === 0).slice(0, take));
  }
  return sampled;
}

/** Aggregate written/predicted actors for the distribution sanity report. */
export function summarizeDistribution(
  results: Array<{ category: string; erosionActor: string }>,
): Record<string, Record<string, number>> {
  const out: Record<string, Record<string, number>> = {};
  for (const r of results) {
    out[r.category] = out[r.category] ?? {};
    out[r.category][r.erosionActor] = (out[r.category][r.erosionActor] ?? 0) + 1;
  }
  return out;
}
