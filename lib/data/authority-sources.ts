/** Authoritative agency identifiers — matched against the `agency` field, not content text. */
export const HIGH_AUTHORITY_AGENCIES = [
  'government accountability office',
  'gao',
  'congressional budget office',
  'cbo',
  'inspector general',
  'oig',
  'office of special counsel',
  'osc',
  'supreme court',
  'federal courts',
  'congressional research service',
  'crs',
];

export function isHighAuthoritySource(agency?: string): boolean {
  if (!agency) return false;
  const lower = agency.toLowerCase();
  return HIGH_AUTHORITY_AGENCIES.some((a) => lower.includes(a));
}
