import type { LegalDocument } from '@/lib/types/legal';

export const LEGAL_KNOWLEDGE_BASE: LegalDocument[] = [
  {
    title: 'Impoundment Control Act of 1974',
    type: 'statute',
    citation: '2 U.S.C. §§ 681-688',
    content:
      "The Impoundment Control Act (ICA) prohibits the President from unilaterally withholding or delaying the expenditure of funds appropriated by Congress. It establishes two mechanisms: deferrals (temporary delays) which must be reported to Congress and can be overruled by either chamber, and proposed rescissions (permanent cancellations) which require affirmative congressional approval within 45 days. The Act was passed in response to President Nixon's systematic impoundment of appropriated funds.",
    relevantCategories: ['fiscal', 'all'],
  },
  {
    title: 'Hatch Act of 1939',
    type: 'statute',
    citation: '5 U.S.C. §§ 7321-7326',
    content:
      'The Hatch Act restricts federal employees from engaging in certain political activities. It prohibits using official authority to interfere with or affect the result of an election, knowingly soliciting contributions from subordinates, and engaging in political activity while on duty, in a government building, or using government vehicles. The Office of Special Counsel (OSC) investigates violations and can recommend disciplinary action.',
    relevantCategories: ['hatch', 'all'],
  },
  {
    title: 'Administrative Procedure Act (APA)',
    type: 'statute',
    citation: '5 U.S.C. §§ 551-559',
    content:
      'The APA governs the process by which federal agencies develop and issue regulations. It requires notice-and-comment rulemaking for most regulations, establishes standards for judicial review of agency actions, and provides that agency actions found to be "arbitrary, capricious, an abuse of discretion, or otherwise not in accordance with law" shall be set aside. The APA is a cornerstone of administrative law.',
    relevantCategories: ['rulemaking', 'all'],
  },
  {
    title: 'Posse Comitatus Act',
    type: 'statute',
    citation: '18 U.S.C. § 1385',
    content:
      'The Posse Comitatus Act prohibits the use of the Army (and by extension, the Air Force) as a posse comitatus or otherwise to execute the laws, except in cases authorized by the Constitution or Act of Congress. Violations are a federal crime. The Act reflects the fundamental principle of civilian control and the separation of military and civilian law enforcement.',
    relevantCategories: ['military', 'all'],
  },
  {
    title: 'Insurrection Act',
    type: 'statute',
    citation: '10 U.S.C. §§ 251-255',
    content:
      'The Insurrection Act authorizes the President to deploy the military domestically under specific circumstances: when requested by a state legislature or governor, to suppress insurrection, or to enforce federal law when ordinary means are insufficient. It is the primary exception to the Posse Comitatus Act. The Act has been invoked rarely and its invocation is subject to limited judicial review.',
    relevantCategories: ['military', 'all'],
  },
  {
    title: 'Inspector General Act of 1978',
    type: 'statute',
    citation: '5 U.S.C. App. §§ 1-13',
    content:
      'The Inspector General Act created independent Inspectors General in federal agencies to conduct audits and investigations, promote economy and efficiency, and prevent fraud and abuse. IGs have broad powers including subpoena authority and access to agency records. The President can remove IGs but must communicate the reasons to Congress 30 days in advance. IG independence is considered essential to government accountability.',
    relevantCategories: ['igs', 'all'],
  },
  {
    title: 'Pendleton Civil Service Reform Act',
    type: 'statute',
    citation: '5 U.S.C. §§ 1101-1105',
    content:
      'The Pendleton Act established the merit-based system for federal employment, replacing the spoils system. It created the Civil Service Commission (now OPM) and mandated that federal jobs be awarded based on merit through competitive exams. The Act prohibits termination of covered employees for political reasons and established the principle of a nonpartisan professional civil service.',
    relevantCategories: ['civilService', 'all'],
  },
  {
    title: 'Marbury v. Madison',
    type: 'case',
    citation: '5 U.S. (1 Cranch) 137 (1803)',
    content:
      'Established the principle of judicial review — the power of federal courts to declare legislative and executive actions unconstitutional. Chief Justice Marshall wrote: "It is emphatically the province and duty of the Judicial Department to say what the law is." This case is the foundation of the courts\' role as a check on executive power.',
    relevantCategories: ['courts', 'all'],
  },
  {
    title: 'Youngstown Sheet & Tube Co. v. Sawyer',
    type: 'case',
    citation: '343 U.S. 579 (1952)',
    content:
      "The Steel Seizure Case limited presidential power by ruling that President Truman's executive order seizing steel mills was unconstitutional. Justice Jackson's concurrence established a three-category framework for analyzing presidential power: (1) acting with congressional authorization (maximum authority), (2) acting in congressional silence (twilight zone), (3) acting against congressional will (lowest ebb). This framework is the foundation for separation of powers analysis.",
    relevantCategories: ['rulemaking', 'fiscal', 'all'],
  },
  {
    title: 'United States v. Nixon',
    type: 'case',
    citation: '418 U.S. 683 (1974)',
    content:
      'The Supreme Court unanimously held that the President is not above the law and must comply with judicial subpoenas. While recognizing a constitutionally based executive privilege, the Court held it is not absolute and must yield to the demonstrated, specific need for evidence in a criminal proceeding. The case established that the rule of law applies to the President.',
    relevantCategories: ['courts', 'all'],
  },
  {
    title: 'U.S. Constitution, Article I',
    type: 'constitutional',
    citation: 'U.S. Const. art. I',
    content:
      'Article I vests all legislative powers in Congress, including the power of the purse (§8), the power to declare war (§8), and the power to impeach (§2-3). The Appropriations Clause (§9, cl. 7) provides that "No Money shall be drawn from the Treasury, but in Consequence of Appropriations made by Law." This is the constitutional foundation for Congress\'s control over federal spending.',
    relevantCategories: ['fiscal', 'all'],
  },
  {
    title: 'U.S. Constitution, Article II',
    type: 'constitutional',
    citation: 'U.S. Const. art. II',
    content:
      'Article II vests executive power in the President, establishes the Take Care Clause (§3) requiring the President to "take Care that the Laws be faithfully executed," and provides for appointment and removal of officers. The Take Care Clause is both a grant and a limitation of presidential power — it requires faithful execution of all laws, not selective enforcement.',
    relevantCategories: ['civilService', 'rulemaking', 'all'],
  },
];
