export type MaturityBadge = 'Experimental' | 'Calibrating' | 'Validated';

/** Maturity level for each category's scoring pipeline. */
export const CATEGORY_MATURITY: Record<string, MaturityBadge> = {
  civilService: 'Experimental',
  fiscal: 'Experimental',
  executiveOversight: 'Experimental',
  hatch: 'Experimental',
  judicialIndependence: 'Experimental',
  military: 'Experimental',
  rulemaking: 'Experimental',
  executiveActions: 'Experimental',
  infoAvailability: 'Experimental',
  elections: 'Experimental',
  mediaFreedom: 'Experimental',
  lawEnforcement: 'Experimental',
  civilLiberties: 'Experimental',
  immigrationEnforcement: 'Experimental',
};
