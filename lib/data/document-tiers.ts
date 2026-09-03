/**
 * Action/discussion document tiers (#552).
 *
 * "Search the Documentary Record" leads with primary sources: documents that
 * ARE government actions (opinions, rules, executive orders, bills, reports,
 * enforcement). Documents that DISCUSS actions (floor speeches, debate,
 * presidential rhetoric) stay retrievable behind a facet and are labeled in
 * the synthesis context.
 *
 * The boundary is the instrument, not the speaker: an executive order is an
 * action; the president's remarks about it are discussion. Unknown source
 * types default to action (primary-source presumption; news sources are
 * already excluded from search).
 */

export type DocumentTier = 'action' | 'discussion';

/** Source types whose documents discuss government actions rather than being them. */
export const DISCUSSION_SOURCE_TYPES: ReadonlySet<string> = new Set([
  'floor_speech',
  'nomination',
  'presidential_remarks',
  'presidential_interview',
  'hearing_transcript',
]);

export function tierForSourceType(sourceType: string | null | undefined): DocumentTier {
  return sourceType && DISCUSSION_SOURCE_TYPES.has(sourceType) ? 'discussion' : 'action';
}

/**
 * CREC action subtypes (#841, R-GRADED-EVIDENCE): Congressional Record
 * granules stored as `floor_speech` that are instruments READ INTO the
 * record, not speeches — resolution text, appropriations/explanatory
 * statements, presidential messages, committee-report text. Positive
 * identification only: a speakerless title that matches none of these stays
 * discussion, because speaker extraction fails on some genuine speeches
 * ("(Mr. X asked and was given permission…)" preambles) and a speech must
 * never be promoted to action by accident.
 */
const CREC_ACTION_SUBTYPES: ReadonlyArray<[string, RegExp]> = [
  ['resolution_text', /^(senate|house) (joint |concurrent )?resolution/i],
  ['explanatory_statement', /explanatory statement/i],
  [
    'appropriations_text',
    /appropriations (act|bill)|^title [ivx]+--|^division [a-z]--|^sec(tion)?\.? ?\d|\(including transfer of funds\)/i,
  ],
  [
    'presidential_message',
    /message from the president|--pm ?\d|^presidential message|^report of the continuation|^report relative to|^report to advise|^designation of .{0,60} as acting/i,
  ],
  ['committee_report_text', /^report on (the )?resolution|^conference report/i],
];

/** Subtype name for a speakerless CREC floor_speech title, or null. */
export function crecActionSubtype(title: string | null | undefined): string | null {
  if (!title) return null;
  for (const [name, re] of CREC_ACTION_SUBTYPES) if (re.test(title)) return name;
  return null;
}

/** Ingest-time tier for a content item (#842): CREC floor_speech granules
 *  with no extractable speaker and a positive action-subtype title are
 *  action-tier; everything else derives from source_type. */
export function tierForIngestItem(args: {
  sourceType: string | null | undefined;
  hasSpeaker: boolean;
  title: string | null | undefined;
}): DocumentTier {
  if (args.sourceType === 'floor_speech' && !args.hasSpeaker && crecActionSubtype(args.title)) {
    return 'action';
  }
  return tierForSourceType(args.sourceType);
}

export interface TierableDocument {
  sourceType?: string | null;
  evidenceTier?: string | null;
}

/** Tier with the stored override (#841): `evidence_tier` wins when set;
 *  otherwise the source-type map applies as before. */
export function tierForDocument(doc: TierableDocument): DocumentTier {
  if (doc.evidenceTier === 'action' || doc.evidenceTier === 'discussion') return doc.evidenceTier;
  return tierForSourceType(doc.sourceType);
}

/** Human-readable badge labels for search-result source types. */
export const SOURCE_TYPE_LABELS: Record<string, string> = {
  judicial_opinion: 'Opinion',
  court_opinion: 'Court Filing',
  Notice: 'FR Notice',
  Rule: 'Final Rule',
  'Proposed Rule': 'Proposed Rule',
  'Presidential Document': 'Presidential Doc',
  executive_order: 'Executive Order',
  proclamation: 'Proclamation',
  presidential_document: 'Presidential Doc',
  presidential_statement: 'Presidential Statement',
  presidential_letter: 'Presidential Letter',
  presidential_remarks: 'Remarks',
  presidential_interview: 'Interview',
  press_release: 'Press Release',
  ig_report: 'IG Report',
  gao_report: 'GAO Report',
  congressional_report: 'Congressional Report',
  floor_speech: 'Floor Speech',
  hearing_transcript: 'Hearing Transcript',
  nomination: 'Nomination Debate',
  legislative_action: 'Legislative Action',
  bill: 'Bill',
  enforcement_action: 'FEC Enforcement',
  advisory_opinion: 'FEC Advisory Opinion',
};

/** press_release is multi-origin (DOJ API + DHS newsrooms); the origin picks the label. */
const PRESS_RELEASE_ORIGIN_LABELS: Record<string, string> = {
  doj: 'DOJ Release',
  dhs_press: 'DHS Release',
};

export function labelForSourceType(
  sourceType: string | null | undefined,
  sourceOrigin?: string | null,
): string {
  if (!sourceType) return 'Document';
  if (sourceType === 'press_release' && sourceOrigin && PRESS_RELEASE_ORIGIN_LABELS[sourceOrigin]) {
    return PRESS_RELEASE_ORIGIN_LABELS[sourceOrigin];
  }
  return SOURCE_TYPE_LABELS[sourceType] ?? sourceType.replace(/_/g, ' ');
}

/** Share of the research context reserved for action-tier docs in 'all' mode (#552). */
export const ACTION_TIER_SHARE = 0.6;

/**
 * Compose a research context from per-tier result lists (#552). Actions first
 * (stable citation numbering, primary sources lead), then discussions; when
 * one tier comes up short, the other backfills. Pure — unit-tested.
 */
export function composeTieredResults<T>(actions: T[], discussions: T[], topK: number): T[] {
  const actionTarget = Math.round(topK * ACTION_TIER_SHARE);
  const discussionTarget = topK - actionTarget;
  const actionCount = Math.min(
    actions.length,
    actionTarget + Math.max(0, discussionTarget - discussions.length),
  );
  const discussionCount = Math.min(discussions.length, topK - actionCount);
  return [...actions.slice(0, actionCount), ...discussions.slice(0, discussionCount)];
}
