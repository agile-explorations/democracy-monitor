/**
 * Draft-generation rules for research synthesis (#707 — relocated from
 * research-prompts.ts). Every grounding-discipline rule the answer audit
 * produced lives here: coverage scoping (9a), public-answer discipline
 * (10a), judicial-disposition precision (10b), own-framing attribution
 * (10c), and the annotation rules (11-12).
 */

export function draftRules(p2Count: number, totalDocs: number): string[] {
  const rules = [
    'Rules:',
    '1. Only make claims supported by the provided documents.',
    '2. Cite each claim with [Doc N] where N matches the document number below. When',
    '   citing several documents, prefer separate brackets ([Doc 3] [Doc 7]) or the',
    '   forms [Doc 3, Doc 7] / [Docs 3, 7] — never prose lists inside one bracket.',
    '   Words in quotation marks must appear verbatim in the document cited in the',
    '   same sentence — before finalizing, re-check each quoted phrase against its',
    "   cited document's text, and if you cannot confirm which document a phrase",
    '   came from, paraphrase it without quotation marks instead.',
    "3. If the documents don't contain enough information to answer, say so explicitly.",
    '4. Note the date range of available documents.',
    '5. If documents suggest conflicting actions, present both sides.',
    '6. Do not editorialize or assess democratic health — present what the documents show.',
    '7. Present alternative explanations and stated justifications where available.',
    '8. Where documented evidence supports it, briefly note why a finding might matter for',
    '   institutional checks and balances. Ground this in specific document evidence, not',
    '   speculation. Use conditional language ("this could indicate", "this may reflect").',
    '9. Explicitly state the date range of retrieved documents in your answer and note that',
    '   documents are weighted toward recent publications. If corpus statistics show many',
    '   matching documents outside the retrieval window, note this.',
    '9a. COVERAGE DISCIPLINE: any statement about missing document types ("no floor',
    '    speeches", "no hearings appear") MUST be scoped to this retrieval — write "in',
    '    this retrieval" or "among these documents", never "the record", "the corpus",',
    '    or "the available record". You see only a small retrieved sample; absence here',
    '    is not evidence of absence in the corpus, and different retrieval filters (the',
    '    Commentary & debate filter, different phrasing) may surface what is missing',
    '    here. Never characterize overall corpus coverage except by quoting the corpus',
    '    statistics section when provided.',
    '10. Documents are tagged ACTION (primary sources: what the government did — opinions,',
    '    orders, rules, bills, reports) or DISCUSSION (reactions: floor speeches, remarks,',
    '    debate). Ground claims about government actions in ACTION documents; use DISCUSSION',
    '    documents for reception, characterization, and political response, attributed as such',
    '    ("Senator X characterized...").',
  ];
  rules.push(...answerDisciplineRules());
  if (p2Count > 0) rules.push(...annotationRules(p2Count, totalDocs));
  return rules;
}

/** Answer-discipline rules 10a-10c (#707 audit). */
function answerDisciplineRules(): string[] {
  return [
    '10a. PUBLIC ANSWER discipline: the public answer simplifies the expert answer and',
    '    must not ADD anything — no quotation, no legislative status (e.g. "passed"),',
    '    and no absence claim that the expert answer does not contain.',
    '10b. JUDICIAL DISPOSITION PRECISION: for court opinions, attribute holdings and',
    '    relief only to the specific parties the visible excerpt confirms. Multi-party',
    '    cases often split (one plaintiff wins, another is dismissed as moot) and the',
    '    disposition may lie beyond your excerpt — when the excerpt does not show who',
    '    obtained what relief, describe the dispute without asserting outcomes, or hedge',
    '    explicitly ("the excerpt does not state the disposition as to X").',
    "10c. Never present this answer's own synthesis as a document's framing: a connection",
    '    the documents do not themselves draw belongs to the answer ("taken together,',
    '    these documents suggest..."), not to a speaker or document ("the speech',
    '    explicitly connects...").',
  ];
}

/** Rules for documents carrying automated-review annotations (#707 audit). */
function annotationRules(p2Count: number, totalDocs: number): string[] {
  return [
    `11. ${p2Count} of ${totalDocs} documents include classifications from Democracy Monitor's`,
    '    automated document review. When referencing one, attribute it explicitly and render',
    '    the label in plain language — write "Democracy Monitor\'s automated review classified',
    '    this document as clearly concerning (a formal override of existing rules)", never the',
    '    raw label ("clearly_concerning (formal_override)") and never phrased as the',
    "    document's own claim or as this answer's judgment.",
    '12. Lines marked "(annotation)" — AI Assessment and AI Review Note — are machine',
    '    annotations, NOT document text. Never quote them, never attribute their phrasing',
    '    or details to the document. Repeat a detail from an annotation only when the',
    "    document's own excerpt or matched passage supports it; otherwise attribute it",
    "    explicitly to Democracy Monitor's automated review. Matched Passage lines ARE",
    '    verbatim document text and are quotable.',
  ];
}
