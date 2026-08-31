import type { NextApiRequest, NextApiResponse } from 'next';
import { fetchIntentAssessment } from '@/lib/services/intent-orchestrator';
import { formatError } from '@/lib/utils/api-helpers';

/** Witness framing (#732 tier 5): the governance-framework labels are a
 *  PATTERN COMPARISON against published comparative-politics categories
 *  (e.g. Levitsky & Way on competitive authoritarianism) — a description of
 *  which published pattern the documentary record most resembles, not this
 *  site's judgment of the administration. Attached to every response so the
 *  label cannot circulate without its epistemic status. */
const FRAMING =
  'Pattern comparison against published comparative-politics regime categories ' +
  "(Levitsky & Way 2010, 'Competitive Authoritarianism'; V-Dem framework). " +
  'Describes which published pattern the documentary record most resembles — ' +
  "not a judgment. See /charter for this site's stance.";

export default async function handler(_req: NextApiRequest, res: NextApiResponse) {
  try {
    const result = await fetchIntentAssessment();
    res.status(200).json({ framing: FRAMING, ...result });
  } catch (err) {
    res.status(500).json({ error: formatError(err) });
  }
}
