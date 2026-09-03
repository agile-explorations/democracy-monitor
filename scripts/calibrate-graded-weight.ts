/**
 * #842 calibration: simulate graded statuses across the corpus for candidate
 * DISCUSSION_CONFIRMATION_WEIGHT values and report (a) the flip surface vs
 * current statuses, (b) known-event weeks whose Elevated+ standing would be
 * lost (the 39/39 protection), per weight. Read-only; pure simulation of the
 * synthesis thresholds over stored P2 verdicts + document tiers.
 *
 * Usage: DATABASE_URL=... npx tsx scripts/calibrate-graded-weight.ts
 */
import { sql } from 'drizzle-orm';
import { tierForDocument } from '@/lib/data/document-tiers';
import { getDb } from '@/lib/db';
import {
  AI_CONCERN_MIN_SAMPLE,
  AI_CONCERN_THRESHOLD,
  CC_MIN_ACTION_CONFIRMATIONS,
  P2_CONFIRMED_MIN_CLEARLY,
  P2_CONFIRMED_MIN_CONCERNING,
  P2_ELEVATED_MIN_CLEARLY,
  P2_ELEVATED_MIN_POTENTIALLY,
} from '@/lib/methodology/scoring-config';
import { addDays, getMonday } from '@/lib/utils/date-utils';
import { ALL_KNOWN_EVENTS } from '@/lib/validation/known-events';

const WEIGHTS = [0.3, 0.5, 0.7];

interface WeekRow {
  category: string;
  week_of: string;
  status: string | null;
  routine: number;
  novel: number;
  pot_action: number;
  pot_discussion: number;
  clear_action: number;
  clear_discussion: number;
}

/** Variant A: weights apply to BOTH thresholds. Variant B (raw-El): the
 *  Elevated thresholds use raw counts (discussion fully counted toward
 *  Elevated); weights + the action gate apply only to the CC path. */
function gradedStatus(r: WeekRow, w: number, rawElevated = false): string {
  const potW = r.pot_action + w * r.pot_discussion;
  const clearW = r.clear_action + w * r.clear_discussion;
  const pass2 =
    r.routine + r.novel + r.pot_action + r.pot_discussion + r.clear_action + r.clear_discussion;
  const elClear = rawElevated ? r.clear_action + r.clear_discussion : clearW;
  const elPot = rawElevated ? r.pot_action + r.pot_discussion : potW;
  const aiElevated = elClear >= P2_ELEVATED_MIN_CLEARLY || elPot >= P2_ELEVATED_MIN_POTENTIALLY;
  let high = false;
  if (pass2 >= AI_CONCERN_MIN_SAMPLE) {
    if (clearW >= P2_CONFIRMED_MIN_CLEARLY) high = true;
    else {
      const concerning = potW + clearW;
      high = concerning >= P2_CONFIRMED_MIN_CONCERNING && concerning / pass2 > AI_CONCERN_THRESHOLD;
    }
  }
  let status = 'Stable';
  if (aiElevated && high) status = 'ConfirmedConcern';
  else if (aiElevated) status = 'Elevated';
  const actionConfirmed = r.pot_action + r.clear_action;
  if (status === 'ConfirmedConcern' && actionConfirmed < CC_MIN_ACTION_CONFIRMATIONS) {
    status = 'Elevated';
  }
  return status;
}

async function main(): Promise<void> {
  const db = getDb();
  const rows = await db.execute(sql`
    WITH conf AS (
      SELECT a.category, a.week_of, a.assessment, d.source_type, d.evidence_tier
      FROM ai_document_assessments a
      LEFT JOIN documents d ON d.url = a.url AND d.category = a.category
      WHERE a.pass = 2 AND a.is_audit_sample IS NOT TRUE
    )
    SELECT wa.category, wa.week_of::text AS week_of,
      wa.convergence_detail->>'status' AS status,
      count(*) FILTER (WHERE c.assessment = 'routine')::int AS routine,
      count(*) FILTER (WHERE c.assessment = 'novel_not_concerning')::int AS novel,
      count(*) FILTER (WHERE c.assessment = 'potentially_concerning'
        AND (c.evidence_tier = 'action' OR (c.evidence_tier IS NULL AND c.source_type NOT IN
          ('floor_speech','hearing_transcript','presidential_remarks','presidential_interview','nomination'))))::int AS pot_action,
      count(*) FILTER (WHERE c.assessment = 'potentially_concerning'
        AND (c.evidence_tier = 'discussion' OR (c.evidence_tier IS NULL AND c.source_type IN
          ('floor_speech','hearing_transcript','presidential_remarks','presidential_interview','nomination'))))::int AS pot_discussion,
      count(*) FILTER (WHERE c.assessment = 'clearly_concerning'
        AND (c.evidence_tier = 'action' OR (c.evidence_tier IS NULL AND c.source_type NOT IN
          ('floor_speech','hearing_transcript','presidential_remarks','presidential_interview','nomination'))))::int AS clear_action,
      count(*) FILTER (WHERE c.assessment = 'clearly_concerning'
        AND (c.evidence_tier = 'discussion' OR (c.evidence_tier IS NULL AND c.source_type IN
          ('floor_speech','hearing_transcript','presidential_remarks','presidential_interview','nomination'))))::int AS clear_discussion
    FROM weekly_aggregates wa
    LEFT JOIN conf c ON c.category = wa.category AND c.week_of >= wa.week_of AND c.week_of < wa.week_of + 7
    WHERE wa.week_of >= '2017-01-16' AND wa.convergence_detail->>'status' IS NOT NULL
    GROUP BY wa.category, wa.week_of, wa.convergence_detail->>'status'`);

  const weeks = rows.rows as unknown as WeekRow[];
  const eventWeeks = new Set(
    ALL_KNOWN_EVENTS.filter((e) => e.expectedMinStatus !== 'Stable').map(
      (e) => `${e.category}|${getMonday(new Date(e.date))}`,
    ),
  );
  // Detection latency tolerance: an event may confirm the following week.
  const eventWeeksWithLatency = new Set(eventWeeks);
  for (const k of eventWeeks) {
    const [cat, wk] = k.split('|');
    eventWeeksWithLatency.add(`${cat}|${addDays(wk, 7)}`);
  }

  // Per-event minimum-status map for the strict 39/39 check.
  const eventMin = new Map<string, string>();
  for (const e of ALL_KNOWN_EVENTS) {
    if (e.expectedMinStatus === 'Stable') continue;
    const wk = getMonday(new Date(e.date));
    for (const k of [`${e.category}|${wk}`, `${e.category}|${addDays(wk, 7)}`]) {
      eventMin.set(k, e.expectedMinStatus);
    }
  }
  const rank = (s: string) => (s === 'ConfirmedConcern' ? 2 : s === 'Elevated' ? 1 : 0);

  console.log(`weeks simulated: ${weeks.length}`);
  for (const rawElevated of [false, true]) {
    console.log(
      `\n=== variant ${rawElevated ? 'B raw-Elevated (weights gate CC only)' : 'A fully weighted'} ===`,
    );
    for (const w of WEIGHTS) {
      let ccToEl = 0;
      let elToStable = 0;
      let ccToStable = 0;
      let upgrades = 0;
      const eventLoss: string[] = [];
      for (const r of weeks) {
        const next = gradedStatus(r, w, rawElevated);
        const cur = r.status ?? 'Stable';
        if (cur === next) continue;
        if (cur === 'ConfirmedConcern' && next === 'Elevated') ccToEl++;
        else if (cur === 'Elevated' && next === 'Stable') elToStable++;
        else if (cur === 'ConfirmedConcern' && next === 'Stable') ccToStable++;
        else upgrades++;
        const key = `${r.category}|${r.week_of}`;
        const min = eventMin.get(key);
        // Strict check: the simulated status must still meet the event's
        // expected minimum AND the current status must have met it (an event
        // satisfied by its sibling week stays satisfied there).
        if (min && rank(cur) >= rank(min) && rank(next) < rank(min)) {
          eventLoss.push(`${key} ${cur}→${next} (needs ${min})`);
        }
      }
      console.log(
        `w=${w}: CC→El ${ccToEl} · El→Stable ${elToStable} · CC→Stable ${ccToStable} · other ${upgrades} · KNOWN-EVENT WEEKS LOST: ${eventLoss.length}`,
      );
      for (const e of eventLoss) console.log(`    LOST: ${e}`);
    }
  }
  // Reference: tierForDocument import kept so simulation and runtime share the map.
  void tierForDocument;
}

if (require.main === module) {
  const savedDbUrl = process.env.DATABASE_URL;
  const { loadEnvConfig } = require('@next/env');
  loadEnvConfig(process.cwd());
  if (savedDbUrl) process.env.DATABASE_URL = savedDbUrl;
  main()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('[calibrate] Fatal:', err);
      process.exit(1);
    });
}
