/**
 * Content for the /why-this-matters page (#549).
 *
 * Framing rule for every sentence: never "the President shouldn't" — always
 * "these rules bind whoever you voted against, too." Each pillar answers a
 * concrete question, shows what erosion looks like, and anchors the rule in
 * history with examples from both parties. Copy is owner-reviewed before any
 * change ships.
 */

export interface WhyPillar {
  /** Anchor slug, stable for deep links. */
  id: string;
  /** The question this group of checks answers. */
  question: string;
  /** Short node label for the accountability diagram (#550). */
  shortLabel: string;
  /** Category keys from CATEGORIES covered by this pillar. */
  categoryKeys: string[];
  /** The system logic: what this check stops any president from doing. */
  answer: string;
  /** The reciprocal framing: why this rule protects you when your side loses. */
  bindsBothSides: string;
  /** What it looks like when this erodes. */
  erosionLooksLike: string;
  /** Historical anchor, cross-party where possible. */
  historyAnchor: string;
}

export const WHY_PILLARS: WhyPillar[] = [
  {
    id: 'elections',
    shortLabel: 'Elections',
    question: 'Who decides elections?',
    categoryKeys: ['elections', 'hatch'],
    answer:
      'Elections only settle anything if the people running the government cannot tilt them. Two kinds of rules do that work: rules that keep election administration independent of the officials being voted on, and rules that stop the government workforce and its resources from being turned into a campaign operation for whoever is currently in charge.',
    bindsBothSides:
      'Incumbent advantage is the one advantage that compounds. If a president can direct federal agencies, prosecutors, or election administrators toward re-election, that power belongs to every future president too — including the one you fear most. Neutral election machinery is what makes it possible to vote anyone out.',
    erosionLooksLike:
      'Government employees pressured into campaign work; federal action timed or targeted to punish states and localities run by the other party; officials who administer elections investigated for decisions the administration dislikes.',
    historyAnchor:
      'The Hatch Act (1939) was passed by a Democratic Congress to rein in a Democratic administration, after WPA employees were pressed into campaign work. The party in power restrained itself because both parties understood the machinery would eventually change hands.',
  },
  {
    id: 'money-and-rules',
    shortLabel: 'Money & Rules',
    question: 'Who controls the money and the rules?',
    categoryKeys: ['fiscal', 'rulemaking', 'executiveActions'],
    answer:
      'The Constitution gives Congress — not the President — the power to tax, spend, and write law. The President proposes budgets and executes the laws Congress passes. Executive orders and agency rules are tools for carrying out laws, not for replacing them. These categories track whether that boundary is holding.',
    bindsBothSides:
      "If a president can refuse to spend money Congress appropriated, or govern by executive order where Congress declined to act, then the programs you rely on — whichever ones those are — exist only at one person's pleasure. The same power that cancels a program you oppose cancels the one you depend on, the day the office changes hands.",
    erosionLooksLike:
      'Appropriated funds withheld from programs the administration dislikes; policy enacted through executive action after Congress declined to pass it; independent agencies directed to reach predetermined outcomes.',
    historyAnchor:
      "Congress passed the Impoundment Control Act (1974) after President Nixon refused to spend funds it had appropriated — and courts have enforced the same limit against presidents of both parties since. When President Biden's student-loan cancellation exceeded statutory authority, the Supreme Court blocked it (2023), and the administration complied. The rule is the same rule. Agency rules have their own long-standing discipline: the Administrative Procedure Act (1946) requires agencies to publish a proposed rule and answer public comment before it binds anyone, and presidents of both parties have governed under it for eighty years.",
  },
  {
    id: 'watchers',
    shortLabel: 'Watchdogs & Courts',
    // "Who watches the watchers?" was retired (owner, 2026-08-17): Juvenal's
    // question frames the watchers as the THREAT — the reading erosion
    // rhetoric invites ("unelected judges") — while this section argues the
    // watchdogs are the mechanism and the danger is neutering them. The id
    // stays 'watchers' for anchor stability.
    question: 'Who keeps the government honest?',
    categoryKeys: ['executiveOversight', 'judicialIndependence'],
    answer:
      'Every large organization needs auditors, and government is the largest. Inspectors General investigate waste and abuse inside agencies. Courts decide whether government actions are legal, and their orders bind the government itself. These categories track whether the auditors stay independent and whether court orders are followed.',
    bindsBothSides:
      'Inspectors General expose scandals in administrations of both parties — that is the point of them. A president who can fire the auditors for auditing, or ignore a court ruling as optional, hands that same immunity to the next president. Court orders you agree with are only enforceable because court orders you disagree with are too.',
    erosionLooksLike:
      'Inspectors General removed after opening inquiries; court orders slow-walked, reinterpreted, or defied; officials suggesting that judicial rulings are advisory.',
    historyAnchor:
      'President Truman seized the steel mills during the Korean War; the Supreme Court ruled against him (Youngstown, 1952) and he handed them back the same day. The Inspector General Act (1978) created permanent auditors after Watergate — with support from both parties, each aware the other would eventually hold the presidency.',
  },
  {
    id: 'civil-service',
    shortLabel: 'Civil Service',
    question: "Who does the government's work?",
    categoryKeys: ['civilService'],
    answer:
      'Roughly two million civil servants process Social Security checks, inspect food, forecast hurricanes, and approve medicines. Merit rules — hired for competence, fired for cause — exist so this workforce answers to the law rather than to the political fortunes of whoever is in office. This category tracks whether those rules are being dismantled.',
    bindsBothSides:
      'The alternative to a professional civil service is not a more responsive government — it is a government staffed by whoever helped the winner campaign. Merit protections are what stop a Democratic president from purging conservative employees, and a Republican president from purging liberal ones. Strip them once, and every future administration inherits a workforce it can staff with loyalists.',
    erosionLooksLike:
      'Career positions reclassified so employees can be fired at will; hiring screened for political loyalty rather than competence; entire offices dismissed and rebuilt around personal allegiance.',
    historyAnchor:
      'The merit system exists because the alternative was tried. Under the spoils system, federal jobs were campaign rewards — until a rejected office-seeker assassinated President Garfield in 1881. The Pendleton Act (1883) followed, built by both parties on a simple bargain: neither trusted the other with a government of loyalists.',
  },
  {
    id: 'information',
    shortLabel: 'Information & Press',
    question: 'Who can tell you what is happening?',
    categoryKeys: ['mediaFreedom', 'infoAvailability'],
    answer:
      'Self-government requires knowing what the government is doing. Two channels make that possible: a press that can report without fear of official retaliation, and public records — laws, spending data, statistics, FOIA — that anyone can check for themselves. These categories track whether those channels stay open.',
    bindsBothSides:
      'Freedom-of-information tools are used most heavily by whichever side is out of power — conservative watchdogs under Democratic presidents, liberal ones under Republicans. A government that can choose its coverage, or quietly stop publishing inconvenient data, escapes scrutiny from your side exactly when you need it.',
    erosionLooksLike:
      'Reporters stripped of access for unfavorable coverage; datasets and statistics quietly withdrawn; FOIA offices defunded or rules rescinded; official information replaced by official messaging.',
    historyAnchor:
      "The Freedom of Information Act (1966) was pushed through by congressional Democrats over the objections of a Democratic president — Lyndon Johnson signed it reluctantly. It has since been the primary tool of critics of every administration, in both directions. The press side rests on the First Amendment and on custom. When the Nixon administration went to court to stop the New York Times and Washington Post from publishing the Pentagon Papers, the Supreme Court refused (1971), the papers published, and the administration complied. After the Obama Justice Department secretly obtained Associated Press reporters' phone records (2013), the department tightened its own rules for subpoenaing journalists — a limit written by an administration against itself.",
  },
  {
    id: 'enforcement-powers',
    shortLabel: 'Enforcement Powers',
    question: 'Which powers outlast the president who builds them?',
    categoryKeys: ['lawEnforcement', 'immigrationEnforcement', 'military', 'civilLiberties'],
    answer:
      'Prosecutors, immigration enforcement, domestic use of the military, surveillance — these are the powers of the state at their most physical. Democracies bind them with due process and judicial review not to prevent enforcement, but because enforcement machinery, once built, transfers intact to every future administration. These categories track the guardrails, not the policy.',
    bindsBothSides:
      'Whatever you think of any particular enforcement policy, the infrastructure is the durable part: the databases, the detention capacity, the precedent that due process can be skipped when the target is unpopular enough. Powers built for a purpose you support are fully available to the next president, for purposes you may not. Due process is the rule that protects the wrongly accused — and anyone can be wrongly accused.',
    erosionLooksLike:
      'Prosecutions selected by politics rather than evidence; removals or detentions without hearings; troops deployed against civilians; emergency powers that never sunset.',
    historyAnchor:
      'The pattern is bipartisan. A Democratic administration interned Japanese Americans in 1942 under emergency powers. Surveillance systems built after 9/11 under a Republican president were inherited and expanded by his Democratic successor. Each side has, at some point, regretted what the other did with machinery it helped build. Two of the guardrails are older than most readers assume. Troops have been kept out of civilian law enforcement by the Posse Comitatus Act (1878), passed after federal soldiers were posted at Southern polling places during Reconstruction; its exception, the Insurrection Act, has been invoked sparingly and by presidents of both parties — Eisenhower at Little Rock (1957), George H. W. Bush in Los Angeles (1992). And the rule that the White House does not direct prosecutions is a post-Watergate custom: after the Saturday Night Massacre (1973), Attorney General Griffin Bell limited who in the White House could speak to the Justice Department about cases (1978), and attorneys general of both parties have reissued a version of that policy since.',
  },
];

export interface CommonQuestion {
  id: string;
  question: string;
  answer: string[];
}

export const COMMON_QUESTIONS: CommonQuestion[] = [
  {
    id: 'president-in-charge',
    question: "Isn't the President supposed to be in charge of all of this?",
    answer: [
      'The President is the most powerful official in the government — but the Constitution deliberately makes the office powerful and bounded at the same time. Congress writes the laws and controls the money (Article I). The President executes those laws (Article II). Courts decide what the laws mean (Article III). The friction between them is not a malfunction; it is the design.',
      'The practical reason is simple: the presidency changes hands. Every limit that frustrates a president you support is the same limit that will constrain the next president, whom you may oppose. This monitor does not track whether the President is pursuing good policies — it tracks whether the boundaries that apply to every president are holding.',
    ],
  },
  {
    id: 'deep-state',
    question:
      'Isn\'t the "Deep State" the real problem — unelected bureaucrats blocking the elected President?',
    answer: [
      'Career civil servants do not set policy. They execute laws that Congress passed and regulations adopted through processes Congress created. When an official refuses an instruction, the question that matters is which side of the law the instruction was on — and that is a question courts, not press conferences, are built to answer.',
      "America tried the alternative. For a century, federal jobs were handed out as campaign rewards, and each new administration purged the last one's people. The result was corruption and incompetence severe enough that a disappointed job-seeker assassinated a president. The merit system replaced loyalty tests with competence tests — for every administration, of both parties.",
      'It is worth noticing that the same career workforce gets called obstructionist by both sides, depending on who holds the White House. That is what you would expect from a workforce that follows the law rather than the leader.',
    ],
  },
  {
    id: 'presidents-budget',
    question:
      "Isn't the budget the President's responsibility? Cutting agencies like USAID seems like the President's call.",
    answer: [
      'The Constitution is unambiguous on this one: "No Money shall be drawn from the Treasury, but in Consequence of Appropriations made by Law" (Article I, Section 9). The President proposes a budget; Congress decides what is funded. Once Congress appropriates money, spending it is not optional — a rule Congress wrote into law in 1974 after President Nixon tried refusing.',
      'Whether any particular agency deserves cutting is a policy debate, and elections are how it gets settled — by electing a Congress that cuts it. What this monitor tracks is the separate question of whether one official can override a spending law alone. A president who can zero out an agency you oppose without Congress can zero out the one you depend on the same way.',
    ],
  },
  {
    id: 'efficiency',
    question: "Isn't making government more efficient a good thing?",
    answer: [
      'Yes — waste is real, and wanting government to work better is one of the few genuinely bipartisan instincts. The question worth asking is what "efficient" means for a government, because it does not mean what it means for a business. A business has one measure of success. The Constitution\'s preamble lists six — justice, domestic tranquility, common defense, general welfare, liberty, union — and efficiency is not among them. Those purposes pull against each other, and they are owed to everyone, including the people who lost the last election. Much of what makes a business efficient is choosing whom to serve. Government does not get that choice — the hardest people to serve are still owed the same justice, the same ballot, and the same due process as everyone else.',
      "Much of what looks inefficient in government is constraint doing its job. Notice-and-comment rulemaking is slower than decree; appropriations are slower than a purchase order; courts are slower than orders. The most efficient possible government is one person deciding everything — which is the exact arrangement the Constitution's authors had just fought a war to escape. They chose friction on purpose.",
      'It is also worth checking whether an efficiency campaign cuts waste or cuts the machinery that finds waste. Inspectors General, the Government Accountability Office, and agency audit offices exist to catch fraud and duplication — eliminating them is not efficiency even on its own terms. That distinction is what this monitor tracks: not whether any particular cut is good policy, but whether the constraints that outlast every administration — the ones that will also bind the next president, whoever that is — are holding.',
    ],
  },
  {
    id: 'immigration-and-democracy',
    question: 'What does immigration enforcement have to do with democracy?',
    answer: [
      'Not the policy — the process. How much immigration to allow and how strictly to enforce the border are legitimate policy debates that elections are supposed to settle. This monitor takes no position on them.',
      'What it tracks is whether enforcement stays inside constitutional guardrails: hearings before removal, judicial review of detention, limits on using the military against civilians. Those guardrails are not immigration policy — they are the rules that determine what the government may do to a person it has accused. History shows that enforcement powers built without them do not stay pointed at their original targets: the deportation raids of 1919 swept up citizens; the internment camps of 1942 held Americans. Due process is not protection for lawbreakers. It is the procedure for finding out, before the government acts, whether it has the right person.',
    ],
  },
  {
    id: 'mandate',
    question: "The President won the election. Isn't this what voters asked for?",
    answer: [
      'Winning an election confers the power to govern: appoint officials, set enforcement priorities, propose budgets, sign or veto laws. It does not confer the power to change the rules that make the next election meaningful. That distinction is the entire design of a constitutional system — majorities decide policy, while the rules protect the ability of future majorities to decide differently.',
      'A mandate for a policy agenda gets tested at the next ballot box. What this site tracks is a different question: changes to the machinery itself — who counts the votes, who audits the agencies, whether court orders are followed — that determine whether the ballot box can still deliver a verdict at all.',
    ],
  },
  {
    id: 'every-president',
    question: "Doesn't every president push the limits? Isn't this just politics as usual?",
    answer: [
      'Presidents of both parties test their boundaries, which is exactly why measurement beats anecdote. The same reviewer that reads this administration’s documents has read the Trump 2017–2021 and Biden 2021–2025 records under identical instructions, and those rates are published side by side in the methodology.',
      "That makes 'everyone does it' a testable claim here rather than a conversation-ender — and you can see how it tested. Under the two administrations before this one, most weeks came back consistent with norms: 69% and 87% of category-weeks (Trump 2017–21, Biden 2021–25) as of August 2026. Under this one, most don't — 30%. Every flag links to the documents behind it, so you can read them and disagree.",
    ],
  },
  {
    id: 'trust',
    question: "Why should I trust this site? Isn't it just another partisan project?",
    answer: [
      "Don't trust it — check it. The code is open source, the methodology is published in full, every assessment links to the government documents behind it, and the complete database is downloadable. Anyone can rerun the analysis and disagree in detail. Criticism that survives that kind of scrutiny is the only endorsement worth having.",
      'The strongest evidence we can offer: the same AI review — same prompts, same thresholds — ran against Biden-administration documents, and those assessments are published here alongside the current ones. The rates differ by era — most weeks under the two previous administrations came back consistent with norms; fewer do now — and a monitor that flagged everything would be a monitor that told you nothing.',
    ],
  },
];

/** Anchor id of the pillar that covers a given category key, for deep links. */
export function pillarIdForCategory(categoryKey: string): string | null {
  const pillar = WHY_PILLARS.find((p) => p.categoryKeys.includes(categoryKey));
  return pillar ? pillar.id : null;
}

/**
 * One-line "why this matters" shown on each category page, linking to the
 * category's pillar. Same framing rule as the pillars: reciprocal, never
 * partisan.
 */
export const CATEGORY_WHY_LINES: Record<string, string> = {
  civilService:
    'Merit rules are what stop every administration — this one and the next — from staffing the government with loyalists.',
  fiscal:
    'If a president can ignore spending laws, every program exists at one person’s pleasure — including the ones you depend on.',
  executiveOversight:
    'Inspectors General are the government’s auditors; a president who can fire the auditor for auditing passes that immunity to every successor.',
  hatch:
    'When government machinery works for the incumbent’s campaign, elections lose the power to remove anyone.',
  judicialIndependence:
    'Court orders you agree with are only enforceable because court orders you disagree with are too.',
  military:
    'The rules keeping troops out of domestic politics protect both parties’ voters — whoever is protesting next.',
  rulemaking:
    'Independent agencies answer to law rather than to the White House; capture them once, and they answer to every future White House.',
  executiveActions:
    'Executive orders carry out laws; when they replace laws, policy lasts exactly until the next president’s pen.',
  infoAvailability:
    'Public data is how you check the government’s claims — whichever side you are checking.',
  elections:
    'Neutral election administration is the mechanism by which every other abuse can eventually be corrected.',
  mediaFreedom:
    'A press the government can punish reports what the government prefers — under every administration.',
  lawEnforcement: 'Prosecution chosen by politics is a weapon that changes hands every four years.',
  civilLiberties:
    'Due process is the procedure for finding out whether the government has the right person — and anyone can be wrongly accused.',
  immigrationEnforcement:
    'Enforcement machinery built without due-process limits transfers intact to the next administration, pointed wherever it chooses.',
};
