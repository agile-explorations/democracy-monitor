/**
 * Display labels and tooltips for AI assessment values, change mechanisms,
 * and actors (#537; witness-stance vocabulary #732). Shared by the week
 * document table, category assessment panel, and Explore cards.
 *
 * WITNESS RULE (charter, /why-this-matters#charter): display language
 * describes departure from documented baseline practice — precision without
 * valence. Stored enum values (clearly_concerning, erosion types, ...) are
 * UNCHANGED — 100+ weeks of data, prompts, and eval baselines depend on
 * them; this file is the single mapping layer between the instrument's
 * internal names and what readers see.
 */

export const ASSESSMENT_LABELS: Record<string, string> = {
  clearly_concerning: 'clear departure',
  potentially_concerning: 'possible departure',
  novel_not_concerning: 'novel, within baseline',
  routine: 'routine',
};

export const ASSESSMENT_TIPS: Record<string, string> = {
  clearly_concerning:
    'Multiple indicators of departure from baseline institutional practice, with clear institutional impact',
  potentially_concerning:
    'Some departure indicators present, but the impact is uncertain or limited',
  novel_not_concerning: 'Unusual activity that stays within baseline institutional practice',
  routine: 'Normal administrative activity; no departure indicated',
};

/** Mechanisms of change (stored as "erosion types"): HOW the departure
 *  happens. The mechanism names are descriptive and unchanged. */
export const EROSION_TYPE_LABELS: Record<string, string> = {
  formal_override: 'formal override',
  operational_hollowing: 'operational hollowing',
  noncompliance_refusal: 'noncompliance / refusal',
  routine: 'routine',
  unclear: 'unclear',
};

export const EROSION_TYPE_TIPS: Record<string, string> = {
  formal_override: 'Explicit legal or policy changes that remove institutional protections',
  operational_hollowing:
    'Staffing cuts, budget reductions, or unfilled positions that reduce capacity',
  noncompliance_refusal:
    'Continuing past court orders, declining oversight requests, or withholding required information',
  routine: 'Normal administrative activity; no departure indicated',
  unclear: 'Insufficient information to classify the mechanism of change',
};

export const EROSION_ACTOR_LABELS: Record<string, string> = {
  federal_executive: 'federal executive',
  congress: 'Congress',
  judiciary: 'judiciary',
  state_local: 'state / local',
  other_unclear: 'other / unclear',
};

export const EROSION_ACTOR_TIPS: Record<string, string> = {
  federal_executive:
    'The President, a federal agency, or federal officials perform the action in question',
  congress: 'Federal legislation or congressional action produces the departure',
  judiciary: 'A court removes protections through its own ruling',
  state_local: 'A state, county, or municipal government performs the action in question',
  other_unclear: 'Non-governmental, mixed, or insufficient information to attribute',
};
