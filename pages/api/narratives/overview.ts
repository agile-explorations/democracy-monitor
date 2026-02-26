import type { NextApiRequest, NextApiResponse } from 'next';
import {
  generateOverviewNarrative,
  isElevatedStatus,
} from '@/lib/services/narrative-generation-service';
import { loadAllLayerData } from '@/lib/services/narrative-pipeline';
import { getStoredNarratives, storeNarratives } from '@/lib/services/narrative-store';
import type { NarrativeVersion, StoredNarrative } from '@/lib/types';
import { requireMethod, requireDb, formatError } from '@/lib/utils/api-helpers';

const OVERVIEW_CATEGORY_KEY = '_overview';

/** Return stored narrative if available, or null to signal generation needed. */
function tryStoredResponse(
  stored: { expert: StoredNarrative | null; public: StoredNarrative | null },
  version?: NarrativeVersion,
): Record<string, string> | null {
  if (version) {
    if (stored[version]) return { [version]: stored[version]!.content };
  } else if (stored.expert && stored.public) {
    return { expert: stored.expert.content, public: stored.public.content };
  }
  return null;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (!requireMethod(req, res, 'GET')) return;
  if (!requireDb(res)) return;

  const weekOf = req.query.weekOf as string | undefined;
  if (!weekOf) {
    return res.status(400).json({ error: 'Missing required query parameter: weekOf' });
  }

  const version = req.query.version as NarrativeVersion | undefined;
  if (version && version !== 'expert' && version !== 'public') {
    return res.status(400).json({ error: 'Invalid version. Must be "expert" or "public".' });
  }

  try {
    const stored = await getStoredNarratives(OVERVIEW_CATEGORY_KEY, weekOf);
    const cached = tryStoredResponse(stored, version);
    if (cached) return sendCached(res, cached);

    return await generateOverviewAndRespond(res, weekOf, version);
  } catch (err) {
    console.error('[api/narratives/overview] Error:', err);
    return res.status(500).json({ error: formatError(err) });
  }
}

async function generateOverviewAndRespond(
  res: NextApiResponse,
  weekOf: string,
  version?: NarrativeVersion,
) {
  const allData = await loadAllLayerData(weekOf);
  if (allData.length === 0) {
    return res.status(404).json({ error: `No data for week ${weekOf}` });
  }

  const elevated = allData.filter((c) => isElevatedStatus(c.convergenceDetail));
  if (elevated.length === 0) {
    const template =
      `All ${allData.length} monitored categories are within baseline parameters ` +
      `for the week of ${weekOf}. No structural, AI, or thematic anomalies detected.`;
    return sendCached(res, formatResponse(template, template, version));
  }

  const result = await generateOverviewNarrative({ weekOf, categories: allData });
  await storeNarratives(OVERVIEW_CATEGORY_KEY, weekOf, result).catch((err) =>
    console.error('[narratives/overview] Store failed:', err),
  );
  return sendCached(res, formatResponse(result.expert, result.public, version));
}

function formatResponse(
  expert: string,
  pub: string,
  version?: NarrativeVersion,
): Record<string, string> {
  if (version === 'expert') return { expert };
  if (version === 'public') return { public: pub };
  return { expert, public: pub };
}

function sendCached(res: NextApiResponse, body: Record<string, string>) {
  res.setHeader('Cache-Control', 'public, s-maxage=3600');
  return res.status(200).json(body);
}
