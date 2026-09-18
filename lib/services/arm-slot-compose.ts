/**
 * Pure slot/roster math for the enumeration retrieval loop (#762, #776),
 * split from research-loop-retrieval.ts (orchestration/I/O) for single
 * responsibility. Every function here is deterministic and unit-tested.
 */

import type { ValidatedAlias } from '@/lib/services/query-expansion-service';
import type { ArmHit } from '@/lib/services/research-fusion';
import { rosterTighteningEnabled } from '@/lib/services/salience-knobs';

export { rosterTighteningEnabled } from '@/lib/services/salience-knobs';

/** Enumeration-loop ceiling on arm-guaranteed slots (half the pool). */
export const GUARANTEED_SLOTS = 30;
/** Docs any single arm may place in the guaranteed pool. Bounds breadth:
 *  no term, however many matches, can flood the pool (#762 neutrality). */
export const PER_ARM_CAP = 2;
/** Roster bound = the arms that can actually place documents plus slack
 *  for empty-result arms: GUARANTEED_SLOTS/PER_ARM_CAP = 15 contributors.
 *  Measured (#762 candidate run 1): 48 concurrent cold arm queries
 *  saturated the DB pool — 121s arms stage; slot-justified width only. */
export const MAX_ROSTER_ARMS = 18;
/** Slot cap for an arm whose nominee was question-blind and uncorroborated
 *  (#913): it earned its seat only by being specific, so it places one doc,
 *  not two. `SALIENCE_ROSTER_TIGHTEN=off` restores the flat cap. */
export const UNCORROBORATED_ARM_CAP = 1;

export interface SlotArm {
  phrase: string;
  /** Corpus match count — ordering key (sharpest arm first). */
  matches: number;
  items: ArmHit[];
  /** Per-arm slot cap override (#913); the pool-wide cap applies otherwise. */
  perArmCap?: number;
}

/** Roster inputs after tightening (#913): uncorroborated judge picks lose
 *  their priority seat and every uncorroborated arm gets the smaller cap.
 *  Pure; a no-op when the knob is off. */
export function applyRosterTightening(
  selection: { judgedPhrases: string[]; uncorroboratedPhrases: string[] },
  enabled: boolean = rosterTighteningEnabled(),
): { priorityPhrases: string[]; lowCapPhrases: Set<string> } {
  if (!enabled) return { priorityPhrases: selection.judgedPhrases, lowCapPhrases: new Set() };
  const lowCapPhrases = new Set(selection.uncorroboratedPhrases.map((ph) => ph.toLowerCase()));
  return {
    priorityPhrases: selection.judgedPhrases.filter((ph) => !lowCapPhrases.has(ph.toLowerCase())),
    lowCapPhrases,
  };
}

/**
 * Round-robin bounded slot allocation across arms (pure, #762). Each round,
 * every arm still under `perArmCap` contributes its next unseen hit;
 * deterministic arm order = ascending corpus matches (sharpest first),
 * phrase tiebreak. Stops at `totalSlots` or when every arm is exhausted.
 * Exported for tests.
 */
export function composeArmSlotPool(
  arms: SlotArm[],
  excludeIds: Set<number>,
  perArmCap: number,
  totalSlots: number,
): ArmHit[] {
  const ordered = [...arms].sort(
    (a, b) => a.matches - b.matches || a.phrase.localeCompare(b.phrase),
  );
  const cursors = new Map<SlotArm, number>();
  const taken = new Map<SlotArm, number>();
  const picked: ArmHit[] = [];
  const seen = new Set<number>();
  for (;;) {
    let advanced = false;
    for (const arm of ordered) {
      if (picked.length >= totalSlots) return picked;
      if ((taken.get(arm) ?? 0) >= (arm.perArmCap ?? perArmCap)) continue;
      let cursor = cursors.get(arm) ?? 0;
      while (cursor < arm.items.length) {
        const hit = arm.items[cursor];
        cursor++;
        if (!seen.has(hit.id) && !excludeIds.has(hit.id)) {
          seen.add(hit.id);
          picked.push(hit);
          taken.set(arm, (taken.get(arm) ?? 0) + 1);
          advanced = true;
          break;
        }
      }
      cursors.set(arm, cursor);
    }
    if (!advanced) return picked;
  }
}

/** Judge-picked arms guaranteed roster seats: sharpest-first alone let
 *  swarms of low-match captions fill all 18 seats and cut the judge's
 *  question-relevant picks (Trump v. J.G.G. at 31 matches lost every seat
 *  to sub-20-match junk — 2026-08-24 gate miss). */
const ROSTER_PRIORITY_SEATS = 10;

/** Pure roster selection: priority phrases (judge's relevance order) claim
 *  up to ROSTER_PRIORITY_SEATS; remaining seats fill sharpest-first from
 *  everything else. Exported for tests. */
export function composeRoster(
  aliases: ValidatedAlias[],
  priorityPhrases: string[] = [],
  maxArms: number = MAX_ROSTER_ARMS,
  prioritySeats: number = ROSTER_PRIORITY_SEATS,
): ValidatedAlias[] {
  const byPhrase = new Map(aliases.map((a) => [a.phrase.toLowerCase(), a]));
  const priority: ValidatedAlias[] = [];
  for (const ph of priorityPhrases) {
    const a = byPhrase.get(ph.toLowerCase());
    if (a && priority.length < prioritySeats && !priority.includes(a)) priority.push(a);
  }
  const taken = new Set(priority.map((a) => a.phrase.toLowerCase()));
  const rest = aliases
    .filter((a) => !taken.has(a.phrase.toLowerCase()))
    .sort((a, b) => a.matches - b.matches || a.phrase.localeCompare(b.phrase));
  return [...priority, ...rest].slice(0, maxArms);
}

/** Dedupe aliases across sources by lowercase phrase, preserving order. */
export function dedupeAliases(groups: ValidatedAlias[][]): ValidatedAlias[] {
  const seen = new Set<string>();
  const out: ValidatedAlias[] = [];
  for (const group of groups) {
    for (const alias of group) {
      const key = alias.phrase.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(alias);
    }
  }
  return out;
}
