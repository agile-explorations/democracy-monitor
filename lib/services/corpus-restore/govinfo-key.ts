/** GovInfo-backed restores need the key up front: without it the fetchers
 *  return null text and the run would store content-less rows. */
export function requireGovInfoKey(): string {
  const apiKey = process.env.GOVINFO_API_KEY;
  if (!apiKey) throw new Error('GOVINFO_API_KEY not configured');
  return apiKey;
}
