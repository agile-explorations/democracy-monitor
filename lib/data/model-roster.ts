/**
 * Every AI model the instrument runs, by role (#812). The orchestrators
 * import their model ids FROM here so the apparatus inventory on the charter
 * page (components/why/ApparatusInventory.tsx) is generated from the same
 * constants the pipeline uses — the description cannot drift from the code.
 * Pure data: safe to import in client components.
 */

export interface ModelRole {
  /** Stable role key. */
  role: string;
  /** Reader-facing role description. */
  label: string;
  /** Exact model id passed to the provider. */
  id: string;
  /** Reader-facing model name. */
  name: string;
  provider: 'OpenAI' | 'Anthropic';
}

export const MODEL_ROSTER = {
  pass1Screen: {
    role: 'pass1Screen',
    label: 'Screens every document for relevance (Pass 1)',
    id: 'gpt-4o-mini',
    name: 'GPT-4o-mini',
    provider: 'OpenAI',
  },
  pass2Review: {
    role: 'pass2Review',
    label: 'Reviews each flagged document (Pass 2)',
    id: 'claude-sonnet-4-5-20250929',
    name: 'Claude Sonnet 4.5',
    provider: 'Anthropic',
  },
  narrativeDraft: {
    role: 'narrativeDraft',
    label: 'Drafts and finalizes weekly summaries',
    id: 'claude-opus-4-6',
    name: 'Claude Opus 4.6',
    provider: 'Anthropic',
  },
  narrativeCritique: {
    role: 'narrativeCritique',
    label: 'Critiques weekly-summary and research drafts',
    id: 'gpt-4o',
    name: 'GPT-4o',
    provider: 'OpenAI',
  },
  synthesisDraft: {
    role: 'synthesisDraft',
    label: 'Drafts and finalizes research answers (editorial mode)',
    id: 'claude-opus-4-6',
    name: 'Claude Opus 4.6',
    provider: 'Anthropic',
  },
  synthesisSinglePass: {
    role: 'synthesisSinglePass',
    label: 'Writes research answers (standard mode)',
    id: 'claude-sonnet-4-6',
    name: 'Claude Sonnet 4.6',
    provider: 'Anthropic',
  },
  retrievalHelpers: {
    role: 'retrievalHelpers',
    label: 'Expands search terms, judges salience arms, re-ranks results',
    id: 'gpt-4o-mini',
    name: 'GPT-4o-mini',
    provider: 'OpenAI',
  },
} as const satisfies Record<string, ModelRole>;

export const MODEL_ROLES: ModelRole[] = Object.values(MODEL_ROSTER);
