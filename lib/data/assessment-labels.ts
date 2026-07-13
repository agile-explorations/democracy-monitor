/**
 * Display labels and tooltips for AI assessment values, erosion mechanisms,
 * and erosion actors (#537). Shared by the week document table and category
 * assessment panel.
 */

export const ASSESSMENT_LABELS: Record<string, string> = {
  clearly_concerning: 'clearly concerning',
  potentially_concerning: 'potentially concerning',
  novel_not_concerning: 'novel, not concerning',
  routine: 'routine',
};

export const ASSESSMENT_TIPS: Record<string, string> = {
  clearly_concerning: 'Multiple indicators of democratic erosion with clear institutional impact',
  potentially_concerning: 'Some erosion indicators present but impact is uncertain or limited',
  novel_not_concerning: 'Unusual activity that does not indicate democratic erosion',
  routine: 'Normal administrative activity with no erosion signal',
};

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
    'Staffing cuts, budget reductions, or unfilled positions that degrade capacity',
  noncompliance_refusal:
    'Ignoring court orders, defying oversight, or refusing information requests',
  routine: 'Normal administrative activity with no erosion signal',
  unclear: 'Insufficient information to classify the erosion mechanism',
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
    'The President, a federal agency, or federal officials perform the erosion-relevant action',
  congress: 'Federal legislation or congressional action that itself erodes protections',
  judiciary: 'A court removes protections through its own ruling',
  state_local: 'A state, county, or municipal government performs the erosion-relevant action',
  other_unclear: 'Non-governmental, mixed, or insufficient information to attribute',
};
