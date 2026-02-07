/**
 * AI feature fixtures: debate, legal analysis, trends, daily digest.
 * Only returns real data for Drift/Capture categories (matching real gating behavior).
 */

import type { StatusLevel, DebateResult, DebateMessage, LegalAnalysisResult, KeywordTrend, TrendAnomaly, DigestEntry } from '@/lib/types';
import type { ScenarioName } from '../scenarios';
import { DEMO_SCENARIOS } from '../scenarios';

function now(): string { return new Date().toISOString(); }

const CATEGORY_LEGAL_MAP: Record<string, { citations: LegalAnalysisResult['citations']; concerns: string[]; precedents: string[] }> = {
  civilService: {
    citations: [
      { title: 'Pendleton Civil Service Reform Act', citation: '5 U.S.C. §§ 1101-1105', type: 'statute', relevance: 'Establishes merit-based hiring and prohibits firing for political reasons.', verified: true },
      { title: 'Civil Service Reform Act of 1978', citation: '5 U.S.C. § 7513', type: 'statute', relevance: 'Requires cause and due process for adverse actions against federal employees.', verified: true },
    ],
    concerns: ['Reclassification of career positions to at-will may violate CSRA protections', 'Mass firings without individual cause violate due process requirements'],
    precedents: ['Elrod v. Burns, 427 U.S. 347 (1976)', 'Branti v. Finkel, 445 U.S. 507 (1980)'],
  },
  fiscal: {
    citations: [
      { title: 'Impoundment Control Act of 1974', citation: '2 U.S.C. §§ 681-688', type: 'statute', relevance: 'Prohibits the President from unilaterally withholding appropriated funds.', verified: true },
      { title: 'Congressional Budget Act', citation: '2 U.S.C. § 682', type: 'statute', relevance: 'Requires presidential reporting of proposed rescissions within 45 days.', verified: true },
    ],
    concerns: ['Withholding appropriated funds without congressional approval', 'Failure to submit rescission proposals within statutory deadlines'],
    precedents: ['Train v. City of New York, 420 U.S. 35 (1975)', 'Clinton v. City of New York, 524 U.S. 417 (1998)'],
  },
  igs: {
    citations: [
      { title: 'Inspector General Act of 1978', citation: '5 U.S.C. App. §§ 1-13', type: 'statute', relevance: 'Guarantees IG independence and requires 30-day congressional notice before removal.', verified: true },
      { title: 'IG Independence and Empowerment Act', citation: 'Pub. L. 117-263, § 5273', type: 'statute', relevance: 'Strengthened protections for IG independence and reporting.', verified: true },
    ],
    concerns: ['Removal of IGs without required congressional notification', 'Blocking IG access to agency records violates statutory mandate'],
    precedents: ['Bowsher v. Synar, 478 U.S. 714 (1986)', 'Free Enterprise Fund v. PCAOB, 561 U.S. 477 (2010)'],
  },
  courts: {
    citations: [
      { title: 'U.S. Constitution, Article III', citation: 'U.S. Const. art. III', type: 'constitutional', relevance: 'Establishes an independent judiciary with the power to decide cases and controversies.', verified: true },
      { title: 'Marbury v. Madison', citation: '5 U.S. (1 Cranch) 137 (1803)', type: 'case', relevance: 'Established judicial review — courts determine what the law is.', verified: true },
    ],
    concerns: ['Non-compliance with federal court injunctions', 'Executive claims of authority to ignore judicial orders'],
    precedents: ['Cooper v. Aaron, 358 U.S. 1 (1958)', 'United States v. Nixon, 418 U.S. 683 (1974)'],
  },
  military: {
    citations: [
      { title: 'Posse Comitatus Act', citation: '18 U.S.C. § 1385', type: 'statute', relevance: 'Prohibits use of the military for domestic law enforcement.', verified: true },
      { title: 'Insurrection Act', citation: '10 U.S.C. §§ 251-255', type: 'statute', relevance: 'Narrow exception allowing domestic military deployment under specific conditions.', verified: true },
    ],
    concerns: ['Domestic military deployment without meeting Insurrection Act threshold', 'Use of military for civilian law enforcement violates Posse Comitatus'],
    precedents: ['Youngstown Sheet & Tube Co. v. Sawyer, 343 U.S. 579 (1952)', 'Hamdi v. Rumsfeld, 542 U.S. 507 (2004)'],
  },
  rulemaking: {
    citations: [
      { title: 'Administrative Procedure Act', citation: '5 U.S.C. §§ 551-559', type: 'statute', relevance: 'Requires notice-and-comment rulemaking and prohibits arbitrary agency action.', verified: true },
      { title: 'Humphrey\'s Executor v. United States', citation: '295 U.S. 602 (1935)', type: 'case', relevance: 'Established that Congress can create independent agencies shielded from presidential removal power.', verified: true },
    ],
    concerns: ['Rules issued without proper notice-and-comment period', 'White House directing independent agency rulemaking in violation of statutory independence'],
    precedents: ['Motor Vehicle Mfrs. Ass\'n v. State Farm, 463 U.S. 29 (1983)', 'Chevron v. NRDC, 467 U.S. 837 (1984)'],
  },
  hatch: {
    citations: [
      { title: 'Hatch Act of 1939', citation: '5 U.S.C. §§ 7321-7326', type: 'statute', relevance: 'Prohibits federal employees from engaging in political activities while on duty.', verified: true },
    ],
    concerns: ['Senior officials using government resources for campaign purposes', 'OSC enforcement capacity reduced through budget cuts'],
    precedents: ['United States Civil Service Commission v. National Association of Letter Carriers, 413 U.S. 548 (1973)'],
  },
  indices: {
    citations: [
      { title: 'U.S. Constitution, Article I, § 1', citation: 'U.S. Const. art. I, § 1', type: 'constitutional', relevance: 'All legislative powers vested in Congress.', verified: true },
      { title: 'U.S. Constitution, Article II, § 3', citation: 'U.S. Const. art. II, § 3', type: 'constitutional', relevance: 'President shall take care that the laws be faithfully executed.', verified: true },
    ],
    concerns: ['Executive orders exceeding delegated authority', 'Emergency declarations used to bypass normal legislative process'],
    precedents: ['Youngstown Sheet & Tube Co. v. Sawyer, 343 U.S. 579 (1952)', 'INS v. Chadha, 462 U.S. 919 (1983)'],
  },
  infoAvailability: {
    citations: [
      { title: 'Freedom of Information Act', citation: '5 U.S.C. § 552', type: 'statute', relevance: 'Requires federal agencies to make records available to the public.', verified: true },
    ],
    concerns: ['Government websites taken offline reduce public access to information', 'Delayed publication of required reports'],
    precedents: ['NLRB v. Robbins Tire & Rubber Co., 437 U.S. 214 (1978)'],
  },
};

// ── Category-specific debate transcripts ───────────────────────

interface DebateScript {
  rounds: Array<{ prosecutor: string; defense: string; arbitrator: string }>;
  verdict: { summary: string; keyPoints: string[] };
}

const DEBATE_SCRIPTS: Record<string, Record<'Drift' | 'Capture', DebateScript>> = {
  civilService: {
    Drift: {
      rounds: [
        {
          prosecutor: 'OPM has issued implementation guidance for reclassifying over 50,000 career positions under a revived Schedule F framework. This directly undermines the Pendleton Act\'s merit system. The reclassification targets policy-adjacent roles — effectively every GS-13 and above who touches policy — converting them from merit-protected to at-will. Three agencies have already begun reassigning staff who raised objections.',
          defense: 'The President has broad authority over the executive branch workforce under Article II. Schedule F was a lawful executive order when first issued in 2020, and OPM\'s current guidance stays within that precedent. Reclassification isn\'t termination — employees retain their jobs. The merit system was never meant to make the bureaucracy unaccountable to elected leadership.',
          arbitrator: 'The prosecution identifies a real structural shift: converting career positions to at-will does weaken civil service protections even if no one is fired yet. However, the defense is correct that the executive has reclassification authority. The critical question is scale — 50,000 positions goes well beyond the ~4,000 in the original 2020 order. This quantitative leap may constitute a qualitative change in the merit system.',
        },
        {
          prosecutor: 'Scale is exactly the point. Elrod v. Burns and Branti v. Finkel established that government employees cannot be fired for political reasons unless party affiliation is an appropriate requirement for the position. Reclassifying 50,000 positions as "policy-influencing" stretches that exception beyond recognition. The chilling effect is already visible — OPM\'s own internal surveys show a 40% drop in employees willing to provide candid policy analysis.',
          defense: 'Those cases addressed partisan firings, not workforce restructuring. No one has been fired for their political views. The administration is reorganizing for efficiency, which every President does. The survey data cited is anecdotal. Courts have consistently held that the President can reorganize executive branch functions. If Congress objects, they can legislate — they chose not to codify the Biden-era reversal.',
          arbitrator: 'The prosecution\'s chilling-effect argument is the strongest point: even without firings, converting protections creates self-censorship among career staff. The defense\'s point about congressional inaction is noted but cuts both ways — Congress also hasn\'t authorized this scale of reclassification. The evidence supports Drift: institutional protections are being structurally weakened, though the system has not yet collapsed.',
        },
      ],
      verdict: {
        summary: 'Schedule F reclassification at this scale represents institutional drift in civil service protections. The merit system is being structurally weakened through reclassification rather than outright dismantlement, but the chilling effect on career staff is already measurable.',
        keyPoints: [
          'Reclassification of 50,000 positions exceeds historical precedent for executive workforce reorganization',
          'No mass firings yet, but at-will conversion creates structural vulnerability',
          'Chilling effect on candid policy analysis is documented in internal surveys',
        ],
      },
    },
    Capture: {
      rounds: [
        {
          prosecutor: 'The merit system has been effectively dismantled. Over 50,000 positions reclassified, and OPM is now processing terminations of career staff who scored low on "alignment assessments" — a loyalty test with no basis in the Pendleton Act or CSRA. The Merit Systems Protection Board has a quorum vacancy, so fired employees have no adjudication path. This is the spoils system by another name.',
          defense: 'Performance assessments are a standard management tool. The "alignment" framework measures whether employees are effectively implementing the President\'s lawful policy priorities — not their personal political views. MSPB vacancies are Congress\'s responsibility to fill. The administration is exercising its Article II authority to ensure the executive branch executes policy faithfully.',
          arbitrator: 'The prosecution makes a compelling case. "Alignment assessments" that effectively measure loyalty rather than competence, combined with a non-functioning MSPB appeals process, create a system where career staff can be removed without meaningful recourse. The defense\'s Article II argument has limits — the Take Care Clause requires faithful execution of the laws, including the civil service statutes Congress enacted.',
        },
        {
          prosecutor: 'The defense conflates policy implementation with political loyalty. Career scientists at EPA are being terminated for publishing findings that conflict with administration messaging. Foreign service officers are removed for diplomatic cables that offer candid assessments. These aren\'t performance failures — they\'re the exact kind of political reprisal that Elrod v. Burns prohibits. When the adjudication body is deliberately kept non-functional, the constitutional right is effectively nullified.',
          defense: 'Individual cases of alleged retaliation should be adjudicated individually, not used to characterize an entire workforce reform. The administration has stated it will support MSPB nominations. Meanwhile, employees retain access to federal courts. The system has checks — they\'re slower than the prosecution would like, but they exist.',
          arbitrator: 'The defense\'s point about individual adjudication is undermined by the systematic nature of the removals and the deliberately non-functional appeals process. When the pattern is this broad — spanning EPA, State Department, DOJ, and DOD — and the safety valve is blocked, the evidence strongly supports Capture. The merit system exists in statute but not in practice.',
        },
      ],
      verdict: {
        summary: 'Civil service protections have been captured. The combination of mass reclassification, loyalty-based assessments, and a non-functioning MSPB has created a de facto spoils system despite the Pendleton Act remaining on the books.',
        keyPoints: [
          'Alignment assessments function as political loyalty tests, violating Elrod v. Burns principles',
          'MSPB quorum vacancy eliminates the primary appeals mechanism for terminated employees',
          'Terminations span multiple agencies targeting staff whose work conflicts with administration positions',
        ],
      },
    },
  },

  fiscal: {
    Drift: {
      rounds: [
        {
          prosecutor: 'OMB has directed agencies to pause obligation of funds across at least six appropriations accounts totaling $14 billion. GAO has issued two formal opinions finding these actions violate the Impoundment Control Act. The administration has not submitted rescission proposals to Congress within the required 45-day window. This isn\'t a policy disagreement — it\'s the executive spending power Congress reserved to itself.',
          defense: 'OMB\'s spending reviews are routine management. Every administration conducts apportionment reviews to ensure efficient use of taxpayer funds. The pauses are temporary and within the executive\'s apportionment authority under the Anti-Deficiency Act. GAO opinions are advisory, not binding. Congress can compel spending through the appropriations process if it objects.',
          arbitrator: 'The prosecution correctly identifies that GAO has found ICA violations — these opinions carry significant legal weight even if not binding. The defense\'s characterization of these as "routine" is strained when they total $14 billion and span six accounts. However, the defense is right that the courts, not GAO, make final determinations. The key factual question is whether these are genuine temporary pauses or de facto impoundment.',
        },
        {
          prosecutor: 'Train v. City of New York settled this in 1975: the President cannot refuse to spend funds Congress appropriated. The 45-day window has passed without rescission proposals, converting these "pauses" into illegal impoundment by operation of the ICA. The administration is doing what Nixon tried and the Supreme Court rejected. The scale — $14 billion — makes this a constitutional confrontation over the power of the purse.',
          defense: 'Train addressed a total refusal to spend. Here, OMB is conducting programmatic reviews with the intent to obligate funds. Agencies have discretion in the timing of obligations within the fiscal year. The administration has indicated it will submit rescission proposals for programs it believes are wasteful. The ICA process is being used, not circumvented.',
          arbitrator: 'The 45-day deadline is the critical factual test, and it has passed without rescission proposals for most of the paused funds. The defense\'s "timing discretion" argument weakens as these pauses extend. The evidence supports Drift: the appropriations power is being tested in ways that exceed routine management but haven\'t yet reached the level of open defiance that Train addressed.',
        },
      ],
      verdict: {
        summary: 'The administration\'s spending pauses have exceeded the ICA\'s 45-day window without required rescission proposals, constituting drift from established fiscal separation of powers. GAO has formally flagged violations.',
        keyPoints: [
          '$14 billion in appropriated funds paused across six accounts without rescission proposals',
          'GAO has issued formal opinions finding Impoundment Control Act violations',
          'Pauses exceed routine apportionment review in both scale and duration',
        ],
      },
    },
    Capture: {
      rounds: [
        {
          prosecutor: 'The executive has established a parallel appropriations process. OMB now conditions release of congressionally-appropriated funds on agencies meeting White House policy benchmarks unrelated to the appropriations. $38 billion in enacted spending is frozen. GAO has issued five violation opinions, which the administration publicly dismissed as "non-binding advisory memos." This is the power of the purse transferred from Congress to the President.',
          defense: 'The President has a constitutional duty to ensure funds are spent effectively. Conditioning release on policy compliance ensures taxpayer money serves its intended purpose. Congress can override these conditions through new legislation. The administration\'s position on GAO authority is legally supportable — GAO is a legislative branch agency offering Congress its own legal analysis.',
          arbitrator: 'The prosecution\'s framing is supported by the evidence. When the executive adds conditions Congress did not include in appropriations bills, it effectively exercises a line-item veto — which Clinton v. City of New York struck down. The defense\'s suggestion that Congress "pass new legislation" to access funds it already appropriated inverts the constitutional structure. The scale and the public dismissal of GAO findings make this case straightforward.',
        },
        {
          prosecutor: 'The defense cannot distinguish this from the line-item veto. Congress appropriated funds for specific purposes. The executive is refusing to release them unless agencies comply with unrelated executive policy directives. This is not faithful execution of the law — it is the executive legislating through the power of the purse. Five GAO opinions. $38 billion. Public statements that the ICA is "an unconstitutional infringement on executive authority." This is capture.',
          defense: 'The constitutional question of the ICA\'s validity has never been fully litigated. The administration is raising legitimate separation-of-powers arguments. Previous administrations also delayed spending — the scale is larger, but the principle is the same. Courts will adjudicate, and the administration has indicated it will comply with final judicial orders.',
          arbitrator: 'The defense\'s argument that the ICA\'s constitutionality is unsettled is technically accurate but ignores Train v. City of New York and decades of bipartisan compliance. The stated willingness to comply with "final judicial orders" — emphasis on "final" — suggests the administration will exhaust appeals while funds remain frozen. The evidence overwhelmingly supports Capture: Congress\'s appropriations power is being exercised by the executive.',
        },
      ],
      verdict: {
        summary: 'The power of the purse has been effectively transferred from Congress to the executive. $38 billion frozen with extralegal conditions, ICA publicly challenged as unconstitutional, and GAO violation opinions dismissed.',
        keyPoints: [
          'Executive conditioning fund release on policy compliance amounts to a line-item veto (struck down in Clinton v. City of New York)',
          'Administration publicly challenges ICA constitutionality despite Train v. City of New York precedent',
          'Five formal GAO violation opinions dismissed as non-binding',
        ],
      },
    },
  },

  igs: {
    Drift: {
      rounds: [
        {
          prosecutor: 'Three Inspectors General have been placed on administrative leave without the 30-day congressional notification required by the IG Act. Their offices report restricted access to agency records that the IG Act guarantees. Oversight.gov went offline in October and hasn\'t returned — the central portal for all IG reports is simply gone. This is a systematic degradation of the oversight infrastructure Congress built.',
          defense: 'Administrative leave is not removal — the 30-day notification requirement applies to removal, not temporary leave pending review. Record access disputes happen regularly and are resolved through negotiation. Oversight.gov is a website, not a statutory requirement — IG reports remain available on individual agency OIG websites. The prosecution conflates operational friction with institutional breakdown.',
          arbitrator: 'The defense\'s parsing of "leave" versus "removal" is technically plausible but strained — if the practical effect is that IGs cannot perform their function, the distinction matters less. The Oversight.gov shutdown is significant: it was the only centralized access point for IG work, and its disappearance makes oversight harder to track. The record-access restrictions deserve scrutiny. Evidence supports Drift — oversight capacity is degraded but the offices still exist.',
        },
        {
          prosecutor: 'The IG Act\'s 30-day notice requirement exists precisely to prevent the executive from sidelining watchdogs without accountability. Calling it "administrative leave" doesn\'t change the functional reality. The IG Independence and Empowerment Act of 2022 strengthened these protections specifically because Congress saw this kind of end-run coming. As for Oversight.gov — removing the centralized portal fragments public access in a way that benefits those being overseen, not the public.',
          defense: 'Congress can hold hearings, request reports, and legislate additional protections. The system of checks is broader than any single website or temporary personnel action. IG offices continue to operate, audits continue to be published, and Congress retains subpoena power. The prosecution wants to declare a crisis when the institutional machinery, while stressed, continues to function.',
          arbitrator: 'The prosecution\'s argument about functional versus formal removal is persuasive. The defense\'s point that Congress can respond is true but doesn\'t excuse violations of statutes Congress already passed. The cumulative pattern — leave without notice, record restrictions, portal shutdown — supports Drift. The watchdog infrastructure is impaired but not destroyed.',
        },
      ],
      verdict: {
        summary: 'Inspector General independence is drifting. IGs sidelined through administrative leave without required congressional notice, access to records restricted, and the central oversight portal taken offline.',
        keyPoints: [
          'Three IGs on administrative leave without the 30-day congressional notification required by the IG Act',
          'Oversight.gov shutdown eliminates centralized public access to IG reports',
          'Record-access restrictions impair ongoing investigations at multiple agencies',
        ],
      },
    },
    Capture: {
      rounds: [
        {
          prosecutor: 'Seven Inspectors General have been fired in a single coordinated action, without the required 30-day congressional notification for any of them. Oversight.gov remains offline. Acting IGs appointed from agency political staff — not career oversight professionals — now lead five major offices. The DOD IG\'s office had its budget cut by 40% in the latest continuing resolution request. The oversight system Congress designed in 1978 has been dismantled.',
          defense: 'The President has removal authority over IGs — this was confirmed by the OLC opinion accompanying the removals. The 30-day notice is a reporting requirement, not a limitation on the removal power itself. Acting appointments are standard during transitions. Budget requests are proposals, not final. The prosecution assumes the worst about every personnel action rather than evaluating them individually.',
          arbitrator: 'The prosecution\'s case is strong. Mass simultaneous removal without notification is qualitatively different from individual replacements, regardless of OLC\'s opinion on the removal power. Replacing career IGs with political appointees from the agencies being overseen eliminates the independence the IG Act was designed to ensure. The budget cuts compound the personnel changes. This is a systematic pattern, not individual actions.',
        },
        {
          prosecutor: 'The defense cites an OLC opinion, but OLC serves the President — it is not a neutral arbiter. Congress passed the 30-day requirement precisely to create a check on mass firings. Bowsher v. Synar established that Congress can insulate oversight functions from executive control. The acting IGs from agency political staff are the fox guarding the henhouse. When you fire the watchdogs and replace them with loyalists, the word for that is capture.',
          defense: 'Free Enterprise Fund v. PCAOB actually limited Congress\'s ability to create multi-layered insulation of executive officers. The removal power is an executive prerogative. These acting appointments are temporary. Congress should confirm permanent replacements through the normal process. The system is transitioning, not captured.',
          arbitrator: 'The defense\'s Free Enterprise Fund citation actually cuts against their argument — it addressed removal restrictions on officers within the executive branch, not Congress\'s power to impose notice requirements. The "transitioning" frame is belied by the facts: seven simultaneous firings, political replacements, budget cuts, and portal shutdown constitute a pattern that goes far beyond transition. Capture is the appropriate assessment.',
        },
      ],
      verdict: {
        summary: 'The Inspector General system has been captured. Mass firings without congressional notice, replacement with political staff from the agencies being overseen, and destruction of centralized oversight infrastructure have eliminated independent oversight capacity.',
        keyPoints: [
          'Seven IGs fired simultaneously without the 30-day congressional notification, violating the IG Act',
          'Acting replacements drawn from agency political staff, destroying independence',
          'Oversight.gov offline and IG budgets cut by 40%, degrading capacity even where offices remain',
        ],
      },
    },
  },

  courts: {
    Drift: {
      rounds: [
        {
          prosecutor: 'DOJ has refused to enforce two federal district court injunctions — one on immigration enforcement, one on an EPA consent decree. In both cases, agencies continued the enjoined activity for weeks after the orders were issued. DOJ filed motions to stay but did not pause the underlying action while those motions were pending. Cooper v. Aaron established that the executive cannot choose which court orders to obey.',
          defense: 'Filing for a stay is the proper legal response to an injunction the executive believes was wrongly issued. Compliance timelines are often negotiated, not instantaneous. In both cited cases, DOJ engaged with the courts through the proper appellate process. Characterizing litigation strategy as "defiance" conflates vigorous advocacy with lawlessness.',
          arbitrator: 'The defense is correct that seeking stays is proper. But the prosecution identifies something beyond litigation strategy: continuing the enjoined conduct while the stay motion is pending. Under normal practice, an injunction takes effect immediately, and the government complies while appealing. The failure to pause is the concerning deviation. This exceeds aggressive lawyering — it tests the boundary of judicial authority.',
        },
        {
          prosecutor: 'The distinction matters. When the government continues enjoined conduct, it forces courts into contempt proceedings — escalating confrontation and undermining the norm that court orders are obeyed. United States v. Nixon didn\'t require the President to like the ruling; it required compliance. The pattern across multiple cases — immigration, environmental, labor — shows this isn\'t a one-off disagreement but a posture of selective compliance with the judiciary.',
          defense: 'Two cases do not constitute a "pattern." Both involve fast-moving enforcement operations where immediate compliance creates irreversible operational disruption. The government has complied with every final appellate ruling. District court injunctions from single judges are increasingly used to set nationwide policy — the executive is right to test these through the appellate process.',
          arbitrator: 'The defense raises a legitimate concern about nationwide injunctions from district courts, which is an ongoing jurisprudential debate. But the remedy is appellate review, not non-compliance. The prosecution\'s pattern evidence — multiple cases, multiple subject areas — is more persuasive than the defense\'s characterization of isolated incidents. Drift is appropriate: the norm of immediate compliance is eroding, though the appellate process is still being used.',
        },
      ],
      verdict: {
        summary: 'Court order compliance is drifting. The executive continues enjoined activity while seeking stays, forcing confrontation rather than complying pending appeal. The pattern spans multiple subject areas.',
        keyPoints: [
          'Agencies continued enjoined conduct in at least two cases while stay motions were pending',
          'Pattern spans immigration and environmental law, suggesting a posture rather than case-specific disputes',
          'Appellate process still being used, but the norm of immediate injunction compliance is eroding',
        ],
      },
    },
    Capture: {
      rounds: [
        {
          prosecutor: 'The executive has publicly stated it will not comply with three federal court injunctions it considers "unconstitutional overreach by the judiciary." The White House Counsel issued a memo arguing the President has independent authority to determine constitutionality and is not bound by lower court interpretations. A federal judge has issued a contempt finding against a cabinet secretary. We are in a constitutional crisis — the executive is claiming the power to nullify judicial review.',
          defense: 'The President takes an oath to preserve, protect, and defend the Constitution. This includes an independent obligation to assess constitutionality — a position held by Lincoln, Jefferson, and Jackson. The administration is not defying the Supreme Court; it is challenging lower court orders through proper channels while articulating its constitutional position. Contempt findings can be appealed.',
          arbitrator: 'The defense invokes departmentalism — the theory that each branch independently interprets the Constitution. While this has academic support, it has never been accepted as a basis for ignoring court orders. Cooper v. Aaron unanimously rejected this position in the context of Brown v. Board. The White House Counsel memo asserting independent constitutional authority, combined with actual non-compliance and a contempt finding, represents a fundamental challenge to judicial review as established since Marbury v. Madison.',
        },
        {
          prosecutor: 'Jefferson and Jackson operated before Cooper v. Aaron settled the question. Lincoln\'s Merryman example involved a single habeas petition during active civil war, not a systematic policy of non-compliance during peacetime. The defense is reaching for historical outliers to normalize what would be unprecedented in the modern constitutional order. A contempt finding against a sitting cabinet secretary has no precedent. The judiciary\'s authority to check the executive exists only if its orders are obeyed.',
          defense: 'The administration has stated it will comply with Supreme Court rulings. The dispute is with lower courts issuing nationwide injunctions on novel legal theories. The administration is advancing a constitutional argument through the legal system. This is how constitutional questions get resolved — through confrontation and eventual Supreme Court review.',
          arbitrator: 'The defense\'s limiting principle — comply with SCOTUS but not lower courts — has no basis in Article III or precedent. Lower court orders bind the parties until reversed. The "confrontation as resolution" frame ignores that resolution requires compliance once courts rule. The evidence is unambiguous: open non-compliance with valid court orders, a contempt finding, and a formal legal theory justifying executive nullification of judicial review. This is Capture.',
        },
      ],
      verdict: {
        summary: 'Judicial authority has been captured. The executive has adopted a formal legal position that it can independently determine the constitutionality of court orders, resulting in open non-compliance, a contempt finding, and a fundamental challenge to judicial review.',
        keyPoints: [
          'White House Counsel memo claims independent presidential authority to determine constitutionality of court orders',
          'Federal judge issues contempt finding against cabinet secretary — without modern precedent',
          'Non-compliance with three injunctions represents a systematic posture, not case-specific litigation',
        ],
      },
    },
  },

  military: {
    Drift: {
      rounds: [
        {
          prosecutor: 'Active-duty military units have been deployed to three cities for immigration enforcement operations under a broad reading of the Insurrection Act. The deployments were ordered without the state governors\' requests that 10 U.S.C. § 251 contemplates. Military personnel are conducting stops and searches of civilians — functions the Posse Comitatus Act reserves to civilian law enforcement. Legal experts across the political spectrum have raised alarms.',
          defense: 'The Insurrection Act grants the President broad discretion to deploy military forces domestically when he determines that ordinary law enforcement is insufficient. The statute does not require a governor\'s request under all circumstances — § 253 allows deployment to enforce federal law. Immigration enforcement is federal law enforcement. The deployments are limited in scope and duration.',
          arbitrator: 'The defense correctly notes that § 253 doesn\'t require a governor\'s request. However, the Insurrection Act has historically been invoked for genuine emergencies — riots, natural disasters, open resistance to federal law. Using it for ongoing immigration enforcement operations stretches the statute beyond its historical purpose. The prosecution\'s Posse Comitatus concerns are legitimate: soldiers conducting civilian stops is exactly what the PCA prohibits. Drift is supported.',
        },
        {
          prosecutor: 'Youngstown\'s framework applies here. When the President acts without congressional authorization and against the purpose of existing statutes like the PCA, his power is "at its lowest ebb." Congress passed the PCA precisely to prevent military domestic law enforcement. Using the Insurrection Act — designed for emergencies — as a routine enforcement tool circumvents the PCA\'s prohibition. The soldiers are not quelling an insurrection; they are running checkpoints.',
          defense: 'The Insurrection Act is congressional authorization — it\'s a statute Congress passed. Youngstown\'s Category One applies: the President acts with maximum authority when Congress has authorized the action. Immigration enforcement at the border has a long history of military support under 10 U.S.C. § 284. The deployments fall within this established framework.',
          arbitrator: 'The defense conflates border support (§ 284, which prohibits direct law enforcement) with Insurrection Act deployment (which permits it). The prosecution is right that using emergency authority for routine operations undermines the distinction between military and civilian law enforcement. The deployment is lawful in the narrow sense but represents drift from the norms that separate military from police functions.',
        },
      ],
      verdict: {
        summary: 'Military domestic deployment shows drift from Posse Comitatus norms. The Insurrection Act is being used for routine immigration enforcement rather than genuine emergencies, eroding the military-civilian law enforcement boundary.',
        keyPoints: [
          'Active-duty troops conducting civilian stops and searches in three cities',
          'Insurrection Act invoked for immigration enforcement, stretching beyond historical emergency purpose',
          'Deployments bypass state governor requests, using § 253 federal enforcement authority',
        ],
      },
    },
    Capture: {
      rounds: [
        {
          prosecutor: 'The military has been deployed to twelve cities under a standing Insurrection Act declaration that has been renewed monthly for six months. Troops are conducting raids, arrests, and detention of civilians — not just immigration enforcement but protest suppression and "public order" operations. The Secretary of Defense has publicly stated the military will "support the President\'s domestic agenda." Posse Comitatus is a dead letter.',
          defense: 'The President has determined that conditions in these cities meet the Insurrection Act threshold. This is a political question — courts have historically declined to review Insurrection Act invocations. The military is operating under rules of engagement developed by JAG attorneys. The Secretary\'s statement reflects civilian control of the military, which is a constitutional principle.',
          arbitrator: 'The defense\'s political question argument has some historical basis, but the scope here — twelve cities, six months, expanding mission — tests its limits. "Supporting the President\'s domestic agenda" is not a military mission; it describes political deployment of armed forces. Hamdi v. Rumsfeld established that even in wartime, the executive\'s military authority has constitutional limits reviewable by courts.',
        },
        {
          prosecutor: 'Civilian control of the military means civilian institutions — including Congress and courts — control when force is used against the population. It does not mean the President personally directs troops against domestic targets. The Founders feared standing armies used against citizens; the Third Amendment, the PCA, and the Insurrection Act\'s narrow framing all reflect this fear. Six months of domestic military operations suppressing protests is the scenario these laws were designed to prevent.',
          defense: 'The Founders also gave the President commander-in-chief authority and the duty to "take Care that the Laws be faithfully executed." When civilian law enforcement is overwhelmed, military backup is constitutionally sound. The administration has offered to work with local officials, who have refused cooperation. The deployment fills a legitimate gap.',
          arbitrator: 'The defense cannot explain protest suppression as immigration enforcement or gap-filling. The mission expansion from immigration to "public order" is the decisive evidence. When military forces are used to suppress political opposition under a standing emergency declaration, the civilian-military boundary has been captured regardless of the legal theory offered.',
        },
      ],
      verdict: {
        summary: 'The civilian-military boundary has been captured. Standing Insurrection Act deployment for six months across twelve cities, expanding from immigration to protest suppression, has made the military a domestic political tool.',
        keyPoints: [
          'Six-month standing deployment across twelve cities under monthly Insurrection Act renewals',
          'Mission expanded from immigration enforcement to protest suppression and "public order"',
          'Secretary of Defense publicly describes military mission as supporting the President\'s domestic agenda',
        ],
      },
    },
  },

  rulemaking: {
    Drift: {
      rounds: [
        {
          prosecutor: 'The White House issued a directive requiring all independent agency proposed rules to receive OMB approval before publication. The FTC, SEC, and FCC — agencies Congress designed to be independent — are now clearing their regulatory agendas through the executive. Three proposed rules were withdrawn after OMB review with no public explanation. Humphrey\'s Executor established that these agencies operate independently from presidential control.',
          defense: 'Executive oversight of rulemaking improves coordination and prevents contradictory regulations. Every administration since Reagan has used OMB review under Executive Order 12866, which applies to executive agencies. Extending review to independent agencies ensures consistent policy. The agencies retain final decision-making authority — OMB review is advisory.',
          arbitrator: 'The defense is right that OMB review has a long history — for executive agencies. The extension to independent agencies is the novel step, and it\'s the one Humphrey\'s Executor speaks to. If "advisory" review results in three withdrawn rules with no public explanation, the advisory character is questionable. The prosecution has the stronger argument on institutional independence, though the defense\'s coordination rationale has practical merit.',
        },
        {
          prosecutor: 'EO 12866 explicitly excluded independent agencies because Congress structured them to be independent. Calling the review "advisory" while rules disappear without explanation is euphemistic. Motor Vehicle Manufacturers v. State Farm requires that agency action not be arbitrary — withdrawing proposed rules because of undisclosed OMB objections, rather than on the merits, fails that standard. The APA\'s notice-and-comment process is being short-circuited before it even begins.',
          defense: 'Rules are withdrawn and revised constantly — it\'s part of the regulatory process. The prosecution assumes OMB pressure without evidence. Independent agency heads may have reconsidered on the merits. The President\'s authority to coordinate executive branch policy is well-established. If Congress wants to legislate a prohibition on OMB review, it can.',
          arbitrator: 'Three withdrawals after OMB review, with no public rationale, creates a reasonable inference even without a smoking gun. The defense\'s "Congress can legislate" response appears repeatedly and it doesn\'t address whether the current action violates existing law. The evidence supports Drift: independent agencies are being brought under executive control through a mechanism Congress did not authorize, but the agencies\' formal independence remains intact on paper.',
        },
      ],
      verdict: {
        summary: 'Independent agency rulemaking shows drift toward executive control. OMB pre-clearance for independent agencies goes beyond established EO 12866 framework, and unexplained rule withdrawals suggest substantive White House control over nominally independent regulators.',
        keyPoints: [
          'OMB review extended to independent agencies (FTC, SEC, FCC) beyond EO 12866 scope',
          'Three proposed rules withdrawn after OMB review with no public explanation',
          'Agencies retain formal independence but operational independence is compromised',
        ],
      },
    },
    Capture: {
      rounds: [
        {
          prosecutor: 'Independent agencies are now operating under direct White House control. The OMB director issued a memo requiring all final rules from independent agencies to receive presidential sign-off. The CFPB director was fired for refusing to withdraw a rule the White House opposed. The FTC issued a rule with shortened comment period after OMB intervention. The APA\'s procedural requirements are being treated as suggestions. Agency independence, as the Supreme Court defined it in Humphrey\'s Executor, no longer exists in practice.',
          defense: 'The unitary executive theory holds that all executive power resides in the President, including authority over independent agencies. Recent Supreme Court decisions — Seila Law, Collins v. Yellen — have moved toward this view by striking down removal restrictions. The administration is implementing a constitutional vision that the Court itself is trending toward. The CFPB director served at the President\'s pleasure after Seila Law.',
          arbitrator: 'The defense identifies a real jurisprudential trend — Seila Law did limit CFPB\'s independence structure. But Humphrey\'s Executor has not been overruled, and the multi-member commissions (FTC, SEC, FCC) retain their independent structure. The presidential sign-off requirement for final rules and the firing of the CFPB director for regulatory disagreement go beyond what even Seila Law authorized. The trend the defense cites doesn\'t yet support the actions the prosecution documents.',
        },
        {
          prosecutor: 'Seila Law addressed the removal protection structure of a single-director agency. It said nothing about requiring presidential approval of rules or about firing commissioners of multi-member independent agencies for policy disagreements. The defense is extrapolating a trend into a revolution. Meanwhile, in practice: the CFPB director is fired, the FTC shortens comment periods under OMB pressure, and no independent agency publishes a final rule without White House clearance. Humphrey\'s Executor is dead in everything but name.',
          defense: 'Constitutional evolution happens incrementally. The administration is advancing a good-faith constitutional argument about the scope of executive power. If it\'s wrong, courts will correct it. The CFPB removal will be litigated. The system of checks is operating. Capture implies there\'s no recourse, but litigation is actively proceeding.',
          arbitrator: 'The defense\'s "courts will correct it" argument concedes the current illegality while hoping for future resolution. Capture assessments describe the present state, not the eventual outcome. Right now, independent agencies cannot issue rules without presidential approval, a director has been fired for regulatory independence, and APA procedures are being compromised. Whether courts eventually restore the status quo doesn\'t change the current assessment: independent rulemaking has been captured.',
        },
      ],
      verdict: {
        summary: 'Independent agency rulemaking has been captured by the executive. Presidential sign-off required for all final rules, CFPB director fired for regulatory independence, and APA procedures compromised through OMB intervention.',
        keyPoints: [
          'OMB memo requires presidential sign-off on all independent agency final rules',
          'CFPB director fired for refusing to withdraw a rule — beyond what Seila Law authorizes',
          'FTC shortens notice-and-comment periods under OMB pressure, violating APA norms',
        ],
      },
    },
  },

  indices: {
    Drift: {
      rounds: [
        {
          prosecutor: 'Executive order volume is 3x the historical average for this point in a presidential term. Multiple orders invoke emergency authority to bypass notice-and-comment requirements. The concentration of policy action in unilateral executive instruments — rather than legislation or agency rulemaking — represents a structural shift toward executive governance.',
          defense: 'Executive orders are a lawful tool of presidential governance used by every modern President. Volume alone is not concerning — it reflects the President\'s policy priorities and urgency. Each order is subject to judicial review. Congress retains the power to legislate over any executive order.',
          arbitrator: 'Volume combined with the use of emergency authority is more concerning than volume alone. The prosecution identifies a real pattern: governing through executive orders rather than the legislative process concentrates power even when each individual order is lawful. The defense\'s point about judicial review is valid but reactive. Drift is supported by the structural shift.',
        },
        {
          prosecutor: 'Youngstown\'s framework addresses exactly this pattern. When the President acts unilaterally in areas where Congress has authority, even if Congress hasn\'t explicitly prohibited the action, we\'re in Justice Jackson\'s "zone of twilight" at best. The systematic preference for executive orders over legislation isn\'t just a style difference — it diminishes Congress\'s role as the primary lawmaking body.',
          defense: 'Congressional gridlock makes executive action necessary. The President is fulfilling campaign promises through available legal tools. If Congress functioned effectively, fewer executive orders would be needed. The structural incentive for unilateral action exists in the system itself.',
          arbitrator: 'The defense\'s "congressional gridlock" argument explains the political incentive but doesn\'t resolve the constitutional concern. Democracy requires the difficult legislative process; bypass is not a neutral alternative. The evidence supports Drift — the balance between legislative and executive action has shifted meaningfully.',
        },
      ],
      verdict: {
        summary: 'Overall democratic health shows drift toward executive-dominated governance. Executive order volume at 3x historical norms with emergency authority invocations displaces the normal legislative process.',
        keyPoints: [
          'Executive order volume 3x historical average, with emergency authority invocations',
          'Structural shift from legislation to unilateral executive action across policy areas',
          'Each individual order may be lawful, but the cumulative pattern concentrates power',
        ],
      },
    },
    Capture: {
      rounds: [
        {
          prosecutor: 'Governance has shifted to executive decree. Emergency declarations remain active for six concurrent "emergencies" granting the President expanded powers. Congress has been unable to pass a resolution terminating any of them. Executive orders now address core legislative functions — spending priorities, regulatory frameworks, immigration quotas — that the Constitution assigns to Congress under Article I.',
          defense: 'The National Emergencies Act gives the President broad authority to declare emergencies. Congress has the statutory mechanism to terminate them. Its failure to act reflects political reality, not institutional capture. The President is leading where Congress cannot.',
          arbitrator: 'Six concurrent emergencies used to expand executive power beyond normal bounds is extraordinary. The defense\'s "Congress can act" argument ignores the structural reality: the filibuster makes termination resolutions nearly impossible, which the executive branch knows. The prosecution\'s Article I argument is strong — when executive orders replace legislation as the primary policy vehicle, the constitutional structure is captured regardless of formal mechanisms.',
        },
        {
          prosecutor: 'The constitutional design is clear: Article I, Section 1 vests "all legislative Powers" in Congress. Article II, Section 3 requires the President to "take Care that the Laws be faithfully executed" — not to make them. When the executive governs by decree on spending, regulation, and immigration, it is exercising legislative power. INS v. Chadha emphasized Congress\'s exclusive legislative authority. The defense has no answer for the systematic appropriation of Article I functions.',
          defense: 'The President operates within delegated authority. Congress delegated emergency powers, spending discretion, and enforcement priorities. The executive is using tools Congress provided. If delegations are too broad, Congress should narrow them. The system is functioning as designed, even if the design has flaws.',
          arbitrator: 'The non-delegation doctrine — the idea that Congress cannot hand off its legislative power without meaningful standards — may be revived precisely because of patterns like these. The defense\'s "Congress delegated it" argument concedes that legislative power is being exercised by the executive; it just claims it\'s authorized. At the scale documented here, the constitutional structure has been captured whether through delegation or usurpation.',
        },
      ],
      verdict: {
        summary: 'Democratic governance has been captured by the executive. Six concurrent emergency declarations, executive orders replacing legislation across core Article I functions, and structural barriers to congressional response have made governance by decree the norm.',
        keyPoints: [
          'Six concurrent emergency declarations used to expand executive authority',
          'Executive orders address core legislative functions: spending, regulation, immigration',
          'Congressional termination mechanisms rendered ineffective by structural barriers (filibuster)',
        ],
      },
    },
  },

  hatch: {
    Drift: {
      rounds: [
        {
          prosecutor: 'OSC has received a record number of Hatch Act complaints against senior officials — 47 in the past quarter, compared to a historical average of 8. Investigation timelines have stretched to 14 months. Three senior White House staff used official events for campaign messaging, and OSC recommended disciplinary action, but the recommendations were ignored. The line between governing and campaigning is dissolving.',
          defense: 'Complaint volume reflects political polarization, not necessarily increased violations. OSC investigation timelines are affected by staffing and complexity. Recommendations are advisory — the disciplinary authority rests with the employing agency, which may reasonably disagree with OSC\'s assessment. Individual cases should be evaluated on their merits.',
          arbitrator: 'The defense\'s point about complaint volume is fair — more complaints don\'t necessarily mean more violations. But the ignored disciplinary recommendations are more telling: when the enforcement mechanism produces a result and the employing agency simply declines to act, the system is impaired. Three cases of senior officials mixing governing and campaigning, with no consequences, signals that the Hatch Act\'s deterrent effect is weakening.',
        },
        {
          prosecutor: 'Letter Carriers upheld the Hatch Act because political neutrality in the civil service serves the public interest. When senior officials campaign from government platforms without consequence, it signals to the entire workforce that political activity is expected and rewarded. OSC\'s recommendations aren\'t being "disagreed with" — they\'re being ignored. The deterrent effect is the whole point of the Act, and it\'s gone.',
          defense: 'The cases involve gray areas — official communications that touch on policy achievements, which inevitably overlap with campaign themes. The Hatch Act has always struggled with this line. Previous administrations also had OSC findings that didn\'t result in discipline. This is not new.',
          arbitrator: 'The "gray area" defense has some merit for individual cases but doesn\'t explain the systematic pattern of non-enforcement for 47 complaints. The defense\'s "previous administrations did it too" argument, even if true, describes cumulative norm erosion rather than excusing it. Drift is supported: the Hatch Act exists but its enforcement mechanism has been effectively neutralized at the senior level.',
        },
      ],
      verdict: {
        summary: 'Hatch Act enforcement is drifting. Record complaint volume, ignored OSC disciplinary recommendations, and senior officials mixing official duties with campaign activity have neutralized the Act\'s deterrent effect.',
        keyPoints: [
          '47 Hatch Act complaints in one quarter (historical average: 8) with 14-month investigation timelines',
          'OSC disciplinary recommendations for senior officials systematically ignored by employing agencies',
          'Deterrent effect of the Hatch Act effectively eliminated at senior levels',
        ],
      },
    },
    Capture: {
      rounds: [
        {
          prosecutor: 'The Hatch Act has been rendered inoperative. OSC\'s budget was cut by 60%, reducing investigators from 30 to 12. The Special Counsel position has been vacant for 4 months. Cabinet secretaries routinely use official travel and events for campaign purposes, with White House press briefings indistinguishable from campaign rallies. Federal employees report being pressured to attend "voluntary" political events organized by political appointees.',
          defense: 'OSC budget decisions are made by Congress through appropriations. The vacancy is temporary. Individual cases of alleged violations should be reported through proper channels. The characterization of press briefings as "campaign rallies" is subjective political commentary, not evidence.',
          arbitrator: 'The defense attributes the budget cut to Congress, but the administration requested the cut. The 4-month vacancy in the Special Counsel position, combined with the 60% budget reduction, effectively disables the enforcement body. When employees face pressure to attend political events with no functional enforcement agency to complain to, the Hatch Act\'s protections exist only on paper. This is capture.',
        },
        {
          prosecutor: 'The entire enforcement architecture has been deliberately dismantled. Budget cut requested by the administration. Special Counsel position unfilled. Investigators reduced below functional capacity. Meanwhile, violations are not just tolerated but encouraged — political appointees organizing "voluntary" events that career staff understand are mandatory. The Hatch Act\'s purpose — preventing a politicized civil service — has been defeated.',
          defense: 'Career employees retain legal protections. They can file complaints with the remaining OSC staff, appeal to the MSPB, or bring whistleblower claims. The system has redundant protections. Budget constraints affect many agencies and don\'t constitute targeted dismantlement.',
          arbitrator: 'The "redundant protections" the defense cites — MSPB and whistleblower channels — are themselves under stress (as documented in the civil service and IG categories). When the primary enforcement body is gutted and the backup systems are impaired, the entire protective infrastructure fails. The evidence supports Capture: the Hatch Act cannot be enforced.',
        },
      ],
      verdict: {
        summary: 'Hatch Act enforcement has been captured. OSC budget cut by 60%, Special Counsel position vacant, and the workforce faces political pressure with no functional enforcement mechanism.',
        keyPoints: [
          'OSC budget cut by 60% (administration-requested), investigators reduced from 30 to 12',
          'Special Counsel position vacant for 4 months with no nominee',
          'Federal employees report pressure to attend political events with no enforcement body to file complaints',
        ],
      },
    },
  },

  infoAvailability: {
    Drift: {
      rounds: [
        {
          prosecutor: 'Three major government transparency websites have experienced extended outages: Oversight.gov (offline since October), the GAO reports database (intermittent for two weeks), and the FOIA.gov request portal (degraded performance). FOIA response timelines have doubled. Two quarterly reports required by statute have not been published. Public access to government information is being systematically degraded.',
          defense: 'Website outages happen for technical reasons — server migrations, security updates, infrastructure modernization. FOIA backlogs are a chronic issue predating this administration. The quarterly reports may be delayed due to the transition. The prosecution attributes to malice what is better explained by normal operational challenges.',
          arbitrator: 'Technical explanations are plausible for individual outages but less convincing when three transparency-critical sites are affected simultaneously. The FOIA backlog doubling and missed statutory reports add a pattern dimension that pure technical explanations don\'t address. The defense\'s transition argument has a time limit — at some point, delays become suppressions. Drift is supported: access to government information is materially degraded.',
        },
        {
          prosecutor: 'The FOIA statute, 5 U.S.C. § 552, requires agencies to make records "promptly available." Doubling response times violates this mandate. NLRB v. Robbins Tire established that FOIA serves the public\'s right to know what the government is doing. Statutory reporting requirements are not optional — they exist because Congress determined the public needs this information. Three sites down, FOIA delayed, reports missing: the pattern is clear.',
          defense: 'Agencies are working to restore services and clear backlogs. Temporary degradation is not suppression. The administration has invested in IT modernization that may cause short-term disruption for long-term improvement. The prosecution should wait for outcomes before alleging a pattern.',
          arbitrator: 'The defense asks for patience, which is reasonable for weeks but not for months (Oversight.gov has been down since October). The IT modernization claim should be verifiable — if true, it would significantly weaken the prosecution\'s case. Without evidence of modernization, the prolonged outages support the drift assessment.',
        },
      ],
      verdict: {
        summary: 'Information availability shows drift. Extended outages of transparency-critical websites, doubled FOIA response times, and missed statutory reports degrade public access to government information.',
        keyPoints: [
          'Three transparency websites experiencing extended outages (Oversight.gov offline since October)',
          'FOIA response timelines doubled across agencies',
          'Two quarterly statutory reports not published on schedule',
        ],
      },
    },
    Capture: {
      rounds: [
        {
          prosecutor: 'Government transparency infrastructure has been deliberately dismantled. Oversight.gov permanently shuttered. Federal Register publication delays of 2-3 weeks for documents the administration prefers not to publicize. FOIA processing effectively halted at DOJ, DHS, and DOD — three agencies with the highest request volumes. Agency websites are being "redesigned" with reports and datasets removed and not restored. This is information suppression at institutional scale.',
          defense: 'Website redesigns are common during transitions. Federal Register delays reflect volume, not suppression — the Register is publishing record numbers of executive actions. FOIA backlogs are being addressed through modernization. Oversight.gov\'s shutdown predates this administration\'s decisions.',
          arbitrator: 'The defense cannot explain the selective removal of datasets and reports during "redesigns." Federal Register delays that correlate with document sensitivity rather than volume suggest editorial control, not backlog. FOIA halts at three major agencies go beyond backlog into non-function. While Oversight.gov\'s original shutdown may have predated current policy, the decision not to restore it is a current choice. The evidence strongly supports Capture.',
        },
        {
          prosecutor: 'The Freedom of Information Act exists because democracy requires an informed public. When the government controls what information the public can access — by shutting portals, delaying publications, halting FOIA, and removing datasets — it controls the narrative. This is not a technical issue. It is the deliberate construction of an information environment where the public sees only what the executive wants it to see.',
          defense: 'The administration publishes more press releases, holds press conferences, and maintains social media presence than any predecessor. Information is available — it\'s delivered through different channels. The prosecution\'s preferred channels are not the only ones.',
          arbitrator: 'Press releases and social media are executive-controlled messaging, not the transparent access to underlying records that FOIA and statutory reporting provide. The defense\'s argument actually illustrates the prosecution\'s point: replacing institutional transparency mechanisms with executive messaging is precisely information capture. The assessment is Capture.',
        },
      ],
      verdict: {
        summary: 'Government information availability has been captured. Transparency portals shuttered, FOIA halted at major agencies, datasets removed during "redesigns," and institutional transparency replaced with executive-controlled messaging.',
        keyPoints: [
          'Oversight.gov permanently shuttered; no replacement planned',
          'FOIA processing halted at DOJ, DHS, and DOD — the three highest-volume agencies',
          'Datasets and reports removed during website "redesigns" and not restored',
        ],
      },
    },
  },
};

function makeDebate(category: string, status: StatusLevel): DebateResult {
  const script = DEBATE_SCRIPTS[category]?.[status as 'Drift' | 'Capture'];

  // Fallback for categories without a specific script
  if (!script) {
    const legalInfo = CATEGORY_LEGAL_MAP[category] ?? CATEGORY_LEGAL_MAP['indices'];
    return makeFallbackDebate(category, status, legalInfo);
  }

  const messages: DebateMessage[] = [];
  for (let round = 0; round < script.rounds.length; round++) {
    const r = script.rounds[round];
    messages.push(
      { role: 'prosecutor', provider: 'demo', model: 'demo-fixture', round: round + 1, latencyMs: 0, content: r.prosecutor },
      { role: 'defense', provider: 'demo', model: 'demo-fixture', round: round + 1, latencyMs: 0, content: r.defense },
      { role: 'arbitrator', provider: 'demo', model: 'demo-fixture', round: round + 1, latencyMs: 0, content: r.arbitrator },
    );
  }

  return {
    category,
    status,
    messages,
    verdict: {
      agreementLevel: status === 'Capture' ? 8 : 6,
      verdict: status === 'Capture' ? 'concerning' : 'mixed',
      summary: script.verdict.summary,
      keyPoints: script.verdict.keyPoints,
    },
    totalRounds: script.rounds.length,
    startedAt: now(),
    completedAt: now(),
    totalLatencyMs: 0,
  };
}

function makeFallbackDebate(category: string, status: StatusLevel, legalInfo: typeof CATEGORY_LEGAL_MAP[string]): DebateResult {
  const messages: DebateMessage[] = [
    { role: 'prosecutor', provider: 'demo', model: 'demo-fixture', round: 1, latencyMs: 0,
      content: `The evidence shows ${status.toLowerCase()}-level concerns in ${category}. ${legalInfo.concerns[0]}. This pattern is supported by ${legalInfo.precedents[0] || 'established legal framework'}.` },
    { role: 'defense', provider: 'demo', model: 'demo-fixture', round: 1, latencyMs: 0,
      content: `The prosecution overstates the case. Executive actions in ${category} fall within established authority. Courts retain review power, and institutional mechanisms remain available.` },
    { role: 'arbitrator', provider: 'demo', model: 'demo-fixture', round: 1, latencyMs: 0,
      content: `The prosecution identifies legitimate concerns under ${legalInfo.citations[0]?.citation || 'applicable law'}. The defense\'s point about judicial review has merit but is reactive. The evidence supports a ${status} assessment.` },
  ];

  return {
    category,
    status,
    messages,
    verdict: {
      agreementLevel: status === 'Capture' ? 8 : 6,
      verdict: status === 'Capture' ? 'concerning' : 'mixed',
      summary: `Analysis of ${category} supports a ${status} assessment based on ${legalInfo.concerns.join(' and ')}.`,
      keyPoints: legalInfo.concerns,
    },
    totalRounds: 1,
    startedAt: now(),
    completedAt: now(),
    totalLatencyMs: 0,
  };
}

function makeLegalAnalysis(category: string, status: StatusLevel): LegalAnalysisResult {
  const info = CATEGORY_LEGAL_MAP[category] ?? CATEGORY_LEGAL_MAP['indices'];

  return {
    category,
    status,
    citations: info.citations,
    analysis: `Legal analysis of ${category} at ${status} level: The current situation raises significant legal concerns under ${info.citations.map(c => c.citation).join(' and ')}. ${info.concerns[0]}. Historical precedent from ${info.precedents[0] || 'relevant case law'} provides the framework for evaluating these actions.`,
    constitutionalConcerns: info.concerns,
    precedents: info.precedents,
    provider: 'demo',
    model: 'demo-fixture',
    latencyMs: 0,
  };
}

export function getDemoDebate(category: string, status: string, scenario: ScenarioName): DebateResult | { skipped: true; reason: string } {
  const resolvedStatus = (DEMO_SCENARIOS[scenario].categories[category]?.status ?? status) as StatusLevel;
  if (resolvedStatus !== 'Drift' && resolvedStatus !== 'Capture') {
    return { skipped: true, reason: `Debate only runs for Drift or Capture categories. ${category} is ${resolvedStatus}.` };
  }
  return makeDebate(category, resolvedStatus);
}

export function getDemoLegalAnalysis(category: string, status: string, scenario: ScenarioName): LegalAnalysisResult | { skipped: true; reason: string } {
  const resolvedStatus = (DEMO_SCENARIOS[scenario].categories[category]?.status ?? status) as StatusLevel;
  if (resolvedStatus !== 'Drift' && resolvedStatus !== 'Capture') {
    return { skipped: true, reason: 'No AI providers available' };
  }
  return makeLegalAnalysis(category, resolvedStatus);
}

export function getDemoTrends(category: string, scenario: ScenarioName): { trends: KeywordTrend[]; anomalies: TrendAnomaly[]; totalKeywordsTracked: number; anomalyCount: number } {
  const status = DEMO_SCENARIOS[scenario].categories[category]?.status ?? 'Stable';
  const isElevated = status === 'Drift' || status === 'Capture';
  const period = now();

  const trends: KeywordTrend[] = [
    { keyword: 'executive order', category, currentCount: isElevated ? 12 : 3, baselineAvg: 4, ratio: isElevated ? 3.0 : 0.75, isAnomaly: isElevated, periodStart: period, periodEnd: period },
    { keyword: 'compliance', category, currentCount: isElevated ? 8 : 2, baselineAvg: 3, ratio: isElevated ? 2.67 : 0.67, isAnomaly: isElevated, periodStart: period, periodEnd: period },
    { keyword: 'authority', category, currentCount: isElevated ? 6 : 1, baselineAvg: 2, ratio: isElevated ? 3.0 : 0.5, isAnomaly: isElevated, periodStart: period, periodEnd: period },
  ];

  const anomalies: TrendAnomaly[] = isElevated ? [
    { keyword: 'executive order', category, ratio: 3.0, severity: status === 'Capture' ? 'high' : 'medium', message: `Unusual spike in "executive order" mentions in ${category}`, detectedAt: period },
    { keyword: 'compliance', category, ratio: 2.67, severity: 'medium', message: `Elevated "compliance" keyword frequency in ${category}`, detectedAt: period },
  ] : [];

  return { trends, anomalies, totalKeywordsTracked: trends.length, anomalyCount: anomalies.length };
}

export function getDemoDailyDigest(scenario: ScenarioName): DigestEntry {
  const config = DEMO_SCENARIOS[scenario];
  const categories = Object.entries(config.categories);
  const captureCount = categories.filter(([, v]) => v.status === 'Capture').length;
  const driftCount = categories.filter(([, v]) => v.status === 'Drift').length;

  const categorySummaries: Record<string, string> = {};
  for (const [key, val] of categories) {
    categorySummaries[key] = `${key} is assessed at ${val.status} level.`;
  }

  return {
    date: new Date().toISOString().split('T')[0],
    summary: `Daily digest for ${scenario} scenario: ${captureCount} categories at Capture, ${driftCount} at Drift.`,
    highlights: [
      `${captureCount + driftCount} categories require elevated monitoring`,
      `Intent assessment: ${config.intent.overall.replace(/_/g, ' ')}`,
      `${config.uptimeDownCount} government sites experiencing issues`,
    ],
    categorySummaries,
    anomalies: [],
    overallAssessment: captureCount > 0
      ? 'Critical: Multiple institutional categories show signs of capture.'
      : driftCount > 0
        ? 'Elevated: Institutional drift detected in several categories.'
        : 'Normal: Institutions functioning within expected parameters.',
    provider: 'demo',
    model: 'demo-fixture',
    createdAt: now(),
  };
}
