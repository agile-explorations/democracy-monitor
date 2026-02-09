export type MaturityBadge = 'Experimental' | 'Calibrating' | 'Validated';

/** Maturity level for each category's scoring pipeline. */
export const CATEGORY_MATURITY: Record<string, MaturityBadge> = {
  civilService: 'Experimental',
  fiscal: 'Experimental',
  igs: 'Experimental',
  hatch: 'Experimental',
  courts: 'Experimental',
  military: 'Experimental',
  rulemaking: 'Experimental',
  indices: 'Experimental',
  infoAvailability: 'Experimental',
  elections: 'Experimental',
  mediaFreedom: 'Experimental',
};
