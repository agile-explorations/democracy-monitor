/**
 * Combo canary (#702/#704): measures Path-A fragments + entity-phrase FTS arm
 * + LLM terminology expansion against corrected, era-aware ground truth.
 * Self-contained prototype — does its own retrieval SQL so develop's search
 * code stays untouched; productization happens on feat/702-hybrid-retrieval
 * if the numbers justify it.
 *
 * Ground-truth correction over the original harness: the Schedule F cases now
 * exclude IRS-form noise (civil-service co-occurrence) and use 2025-era
 * vocabulary on the current-term side.
 *
 * Usage: npx tsx scripts/eval-retrieval-combo.ts
 */

import { sql } from 'drizzle-orm';
import { DISCUSSION_SOURCE_TYPES } from '@/lib/data/document-tiers';
import { getDb, isDbAvailable } from '@/lib/db';

type Matcher = (text: string) => boolean;

interface ComboCase {
  name: string;
  query: string;
  truth: Matcher;
  dateFrom: string;
  dateTo: string;
  discussionOnly: boolean;
}

const civilServiceContext =
  /excepted service|competitive service|civil service|merit system|13957/i;

const CASES: ComboCase[] = [
  {
    name: 'schedule-f-trump1',
    query: 'congressional responses to the 2020 Schedule F executive order',
    truth: (t) => /schedule f/i.test(t) && civilServiceContext.test(t),
    dateFrom: '2020-01-01',
    dateTo: '2021-01-19',
    discussionOnly: true,
  },
  {
    name: 'schedule-f-trump2',
    query: 'congressional responses to the 2025 Schedule F reinstatement',
    truth: (t) =>
      (/schedule f/i.test(t) && civilServiceContext.test(t)) ||
      /excepted service/i.test(t) ||
      (/merit systems protection board|mspb/i.test(t) && /probationary|reclassif/i.test(t)),
    dateFrom: '2025-01-20',
    dateTo: '2026-12-31',
    discussionOnly: true,
  },
  {
    name: 'comey-firing',
    query: 'congressional reaction to the firing of FBI Director James Comey',
    truth: (t) => /comey/i.test(t),
    dateFrom: '2017-05-01',
    dateTo: '2017-12-31',
    discussionOnly: true,
  },
  {
    name: 'ig-firings-2025',
    query: 'congressional response to the mass firing of inspectors general',
    truth: (t) => /inspectors? general/i.test(t),
    dateFrom: '2025-01-20',
    dateTo: '2025-12-31',
    discussionOnly: true,
  },
  {
    name: 'travel-ban',
    query: 'floor debate over the travel ban executive order',
    truth: (t) => /travel ban|refugee|13769/i.test(t),
    dateFrom: '2017-01-20',
    dateTo: '2017-12-31',
    discussionOnly: true,
  },
  {
    name: 'loper-bright',
    query: 'congressional discussion of the Loper Bright decision overturning Chevron deference',
    truth: (t) => /loper bright|chevron/i.test(t),
    dateFrom: '2024-06-01',
    dateTo: '2025-01-19',
    discussionOnly: true,
  },
  {
    name: 'anti-weaponization-fund',
    query: 'debate over the Anti-Weaponization Fund and the IRS settlement',
    truth: (t) => /weaponization/i.test(t),
    dateFrom: '2026-06-01',
    dateTo: '2026-12-31',
    discussionOnly: true,
  },
  {
    name: 'blanche-confirmation',
    query: 'Senate debate on the confirmation of Todd Blanche as Attorney General',
    truth: (t) => /blanche/i.test(t),
    dateFrom: '2026-06-01',
    dateTo: '2026-12-31',
    discussionOnly: true,
  },
  {
    name: 'posse-comitatus',
    query: 'congressional concerns about domestic military deployment and posse comitatus',
    truth: (t) => /posse comitatus|insurrection act/i.test(t),
    dateFrom: '2025-01-20',
    dateTo: '2026-12-31',
    discussionOnly: true,
  },
  {
    name: 'ndaa-schedule-f-conference',
    query: 'what happened to the NDAA provision blocking Schedule F',
    truth: (t) => /schedule f/i.test(t) && civilServiceContext.test(t),
    dateFrom: '2020-10-01',
    dateTo: '2021-01-19',
    discussionOnly: false,
  },
];

async function expandQuery(query: string, apiKey: string): Promise<string[]> {
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      temperature: 0,
      messages: [
        {
          role: 'user',
          content:
            `For this search query about the U.S. government record, list SHORT ATOMIC search ` +
            `terms (1-3 words each, plus bare order/statute numbers) that would appear LITERALLY ` +
            `in government documents from 2017-2026 — official entity names, EO numbers you are ` +
            `CERTAIN of, and era-specific renamings. Never invent numbers or compose descriptive ` +
            `titles; include the core entity itself. Return ONLY a JSON array of 3-8 terms. ` +
            `Query: "${query}"`,
        },
      ],
    }),
  });
  if (!res.ok) return [];
  const data = (await res.json()) as { choices: Array<{ message: { content: string } }> };
  try {
    const raw = data.choices[0].message.content.replace(/```json|```/g, '').trim();
    const arr = JSON.parse(raw) as string[];
    return arr.filter((p) => typeof p === 'string' && p.length >= 3 && p.length <= 60).slice(0, 8);
  } catch {
    return [];
  }
}

async function embed(query: string, apiKey: string): Promise<string | null> {
  const res = await fetch('https://api.openai.com/v1/embeddings', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ model: 'text-embedding-3-small', input: query }),
  });
  if (!res.ok) return null;
  const data = (await res.json()) as { data: Array<{ embedding: number[] }> };
  return `[${data.data[0].embedding.join(',')}]`;
}

interface Doc {
  id: number;
  title: string;
  content: string;
  snippet?: string;
  cosine: number;
  keyword: boolean;
}

function tierFilter(discussionOnly: boolean) {
  if (!discussionOnly) return sql``;
  const types = sql.join(
    [...DISCUSSION_SOURCE_TYPES].map((t) => sql`${t}`),
    sql`, `,
  );
  return sql`AND d.source_type IN (${types})`;
}

const BASE_FILTERS = sql`
  d.embedding IS NOT NULL
  AND d.retrieval_relevant IS NOT FALSE
  AND d.content_type != 'metadata_only'
  AND d.source_origin IS NOT NULL AND d.source_origin NOT IN ('gdelt', 'whitehouse')
  AND d.category != 'intent'`;

async function vectorArm(vec: string, c: ComboCase, limit: number): Promise<Doc[]> {
  // nosemgrep: opengrep.cron-needs-env-config — loadEnvConfig called in CLI entry block below
  const db = getDb();
  const rows = await db.execute(sql`
    SELECT d.id, d.title, LEFT(d.content, 3000) AS content,
      1 - (d.embedding <=> ${vec}::vector) AS cosine, false AS keyword
    FROM documents d
    WHERE ${BASE_FILTERS}
      AND d.published_at >= ${c.dateFrom} AND d.published_at <= ${c.dateTo}
      ${tierFilter(c.discussionOnly)}
    ORDER BY d.embedding <=> ${vec}::vector
    LIMIT ${limit}`);
  return rows.rows as unknown as Doc[];
}

interface ValidatedPhrase {
  phrase: string;
  matches: number;
}

/** Corpus validation: keep phrases matching >=1 doc and <=5% of the window. */
async function validatePhrases(phrases: string[], c: ComboCase): Promise<ValidatedPhrase[]> {
  const db = getDb();
  const windowTotal = Number(
    (
      (
        await db.execute(sql`
      SELECT count(*) AS n FROM documents d
      WHERE ${BASE_FILTERS}
        AND d.published_at >= ${c.dateFrom} AND d.published_at <= ${c.dateTo}
        ${tierFilter(c.discussionOnly)}`)
      ).rows[0] as { n: string }
    ).n,
  );
  const maxMatches = Math.max(200, Math.floor(windowTotal * 0.05));
  const BOILERPLATE =
    /^(congressional record|congress|senate|house|united states|federal government|government)$/i;
  const kept: ValidatedPhrase[] = [];
  for (const p of phrases) {
    if (BOILERPLATE.test(p.trim())) continue;
    const q = `"${p.replace(/"/g, '')}"`;
    const r = await db.execute(sql`
      SELECT count(*) AS n FROM documents d
      WHERE ${BASE_FILTERS}
        AND d.published_at >= ${c.dateFrom} AND d.published_at <= ${c.dateTo}
        ${tierFilter(c.discussionOnly)}
        AND d.search_vector @@ websearch_to_tsquery('english', ${q})`);
    const n = Number((r.rows[0] as { n: string }).n);
    if (n >= 1 && n <= maxMatches) kept.push({ phrase: p, matches: n });
  }
  return kept;
}

async function ftsArm(phrase: string, vec: string, c: ComboCase, limit: number): Promise<Doc[]> {
  const db = getDb();
  const tsquery = `"${phrase.replace(/"/g, '')}"`;
  const rows = await db.execute(sql`
    SELECT d.id, d.title, LEFT(d.content, 3000) AS content,
      ts_headline('english', LEFT(d.content, 200000), websearch_to_tsquery('english', ${tsquery}),
        'MaxFragments=3, MaxWords=50, MinWords=20') AS snippet,
      1 - (d.embedding <=> ${vec}::vector) AS cosine, true AS keyword
    FROM documents d
    WHERE ${BASE_FILTERS}
      AND d.published_at >= ${c.dateFrom} AND d.published_at <= ${c.dateTo}
      ${tierFilter(c.discussionOnly)}
      AND d.search_vector @@ websearch_to_tsquery('english', ${tsquery})
    ORDER BY ts_rank(coalesce(d.search_rank_vector, d.search_vector), websearch_to_tsquery('english', ${tsquery})) DESC
    LIMIT ${limit}`);
  return rows.rows as unknown as Doc[];
}

/** Reciprocal Rank Fusion (k=60): standard multi-arm merge, no hand weights. */
interface WeightedArm {
  docs: Doc[];
  weight: number;
}

/** IDF-style arm weight: aliases under ~100 matches compete at near-full
 * weight; only genuinely broad ones are damped. (RRF cutoff math: an arm
 * needs weight > ~0.67 vs a 150-deep vector arm to surface at all.) */
function armWeight(matches: number): number {
  return 1 / (1 + Math.log10(1 + matches / 100));
}

/** Weighted Reciprocal Rank Fusion (k=60). Vector arm weight = 1. */
function fuse(vectorDocs: Doc[], ftsArms: WeightedArm[], topK: number): Doc[] {
  const RRF_K = 60;
  const byId = new Map<number, Doc>();
  const scores = new Map<number, number>();
  for (const arm of [{ docs: vectorDocs, weight: 1 }, ...ftsArms]) {
    arm.docs.forEach((d, rank) => {
      scores.set(d.id, (scores.get(d.id) ?? 0) + arm.weight / (RRF_K + rank + 1));
      const prev = byId.get(d.id);
      if (!prev) byId.set(d.id, { ...d });
      else {
        prev.keyword = prev.keyword || d.keyword;
        if (d.snippet) prev.snippet = d.snippet;
      }
    });
  }
  return [...byId.values()]
    .sort((a, b) => (scores.get(b.id) ?? 0) - (scores.get(a.id) ?? 0))
    .slice(0, topK);
}

// eslint-disable-next-line max-lines-per-function
async function main(): Promise<void> {
  if (!isDbAvailable()) throw new Error('DATABASE_URL not configured');
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('OPENAI_API_KEY not configured');

  let baseTotal = 0;
  let comboTotal = 0;
  for (const c of CASES) {
    const vec = await embed(c.query, apiKey);
    if (!vec) throw new Error(`embedding failed for ${c.name}`);
    const raw = await expandQuery(c.query, apiKey);
    const phrases = await validatePhrases(raw, c);
    const vectorDocs = await vectorArm(vec, c, 150);
    const baseline = fuse(vectorDocs, [], 30);
    const ftsArms: WeightedArm[] = [];
    for (const vp of phrases) {
      ftsArms.push({ docs: await ftsArm(vp.phrase, vec, c, 40), weight: armWeight(vp.matches) });
    }
    const combo = fuse(vectorDocs, ftsArms, 30);
    const hits = (docs: Doc[]) =>
      docs.filter((d) => c.truth(`${d.title} ${d.content} ${d.snippet ?? ''}`)).length;
    const b = hits(baseline);
    const k = hits(combo);
    baseTotal += b;
    comboTotal += k;
    console.log(
      `${c.name.padEnd(28)} baseline ${String(b).padStart(2)} | combo ${String(k).padStart(2)}  aliases(kept/raw ${phrases.length}/${raw.length}): ${phrases
        .map((v) => `${v.phrase}(${v.matches})`)
        .join(' | ')
        .slice(0, 80)}`,
    );
  }
  console.log(`\nTOTALS on corrected ground truth: baseline ${baseTotal} | combo ${comboTotal}`);
}

if (require.main === module) {
  const { loadEnvConfig } = require('@next/env');
  loadEnvConfig(process.cwd());
  main()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('[combo] Fatal:', err);
      process.exit(1);
    });
}
