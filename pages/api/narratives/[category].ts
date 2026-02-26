import { and, eq } from 'drizzle-orm';
import type { NextApiRequest, NextApiResponse } from 'next';
import { CATEGORIES } from '@/lib/data/categories';
import { getDb } from '@/lib/db';
import { weeklyAggregates } from '@/lib/db/schema';
import {
  buildStableTemplate,
  generateCategoryNarrative,
  isElevatedStatus,
} from '@/lib/services/narrative-generation-service';
import { toNarrativeLayerData } from '@/lib/services/narrative-pipeline';
import { getStoredNarratives, storeNarratives } from '@/lib/services/narrative-store';
import type { NarrativeLayerData, NarrativeVersion, StoredNarrative } from '@/lib/types';
import { requireMethod, requireDb, formatError } from '@/lib/utils/api-helpers';

/** Fetch the weekly_aggregates row to build NarrativeLayerData. */
async function fetchLayerData(
  category: string,
  categoryTitle: string,
  weekOf: string,
): Promise<NarrativeLayerData | null> {
  const db = getDb();
  const rows = await db
    .select()
    .from(weeklyAggregates)
    .where(and(eq(weeklyAggregates.category, category), eq(weeklyAggregates.weekOf, weekOf)))
    .limit(1);

  const row = rows[0];
  if (!row) return null;
  return toNarrativeLayerData({ key: category, title: categoryTitle }, row);
}

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

  const categoryKey = req.query.category as string;
  const category = CATEGORIES.find((c) => c.key === categoryKey);
  if (!category) {
    return res.status(404).json({ error: `Unknown category: ${categoryKey}` });
  }

  const weekOf = req.query.weekOf as string | undefined;
  if (!weekOf) {
    return res.status(400).json({ error: 'Missing required query parameter: weekOf' });
  }

  const version = req.query.version as NarrativeVersion | undefined;
  if (version && version !== 'expert' && version !== 'public') {
    return res.status(400).json({ error: 'Invalid version. Must be "expert" or "public".' });
  }

  try {
    const stored = await getStoredNarratives(categoryKey, weekOf);
    const cached = tryStoredResponse(stored, version);
    if (cached) return sendCached(res, cached);

    return await generateAndRespond(res, categoryKey, category.title, weekOf, version);
  } catch (err) {
    console.error(`[api/narratives/${categoryKey}] Error:`, err);
    return res.status(500).json({ error: formatError(err) });
  }
}

async function generateAndRespond(
  res: NextApiResponse,
  categoryKey: string,
  categoryTitle: string,
  weekOf: string,
  version?: NarrativeVersion,
) {
  const layerData = await fetchLayerData(categoryKey, categoryTitle, weekOf);
  if (!layerData) {
    return res.status(404).json({ error: `No data for ${categoryKey} week ${weekOf}` });
  }

  if (!isElevatedStatus(layerData.convergenceDetail)) {
    const template = buildStableTemplate(categoryTitle, weekOf);
    return sendCached(res, formatResponse(template.expert, template.public, version));
  }

  const result = await generateCategoryNarrative(layerData);
  await storeNarratives(categoryKey, weekOf, result).catch((err) =>
    console.error(`[narratives/${categoryKey}] Store failed:`, err),
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
