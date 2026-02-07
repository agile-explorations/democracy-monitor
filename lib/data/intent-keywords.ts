import type { PolicyArea } from '@/lib/types/intent';

interface IntentKeywordSet {
  authoritarian: string[]; // score > 0 (toward concentration)
  democratic: string[]; // score < 0 (toward rule of law)
}

export const RHETORIC_KEYWORDS: Record<PolicyArea, IntentKeywordSet> = {
  rule_of_law: {
    authoritarian: [
      'above the law',
      'total immunity',
      'unlimited power',
      'article ii',
      'absolute authority',
      'do whatever i want',
      'presidential prerogative',
      'unitary executive',
      'inherent authority',
      'cannot be investigated',
    ],
    democratic: [
      'rule of law',
      'no one is above the law',
      'constitutional limits',
      'separation of powers',
      'checks and balances',
      'accountability',
      'transparency',
      'comply with the courts',
    ],
  },
  civil_liberties: {
    authoritarian: [
      'enemy of the people',
      'lock them up',
      'revoke citizenship',
      'terminate the constitution',
      'suspend rights',
      'deport citizens',
      'designate as terrorists',
      'enemy combatant',
    ],
    democratic: [
      'protect civil liberties',
      'due process',
      'first amendment',
      'freedom of speech',
      'right to protest',
      'equal protection',
      'bill of rights',
      'constitutional rights',
    ],
  },
  elections: {
    authoritarian: [
      'rigged election',
      'stolen election',
      'massive fraud',
      'third term',
      'not leaving',
      'election was stolen',
      'cancel the election',
      'suspend elections',
    ],
    democratic: [
      'free and fair elections',
      'peaceful transfer',
      'voter access',
      'election integrity',
      'accept the results',
      'democratic process',
    ],
  },
  media_freedom: {
    authoritarian: [
      'fake news',
      'enemy of the people',
      'revoke licenses',
      'sue the media',
      'open up libel laws',
      'shut down',
      'ban from press pool',
      'punish the press',
    ],
    democratic: [
      'free press',
      'press freedom',
      'transparency',
      'public right to know',
      'press access',
      'first amendment',
    ],
  },
  institutional_independence: {
    authoritarian: [
      'fire them all',
      'loyalty',
      'deep state',
      'drain the swamp',
      'political appointees',
      'schedule f',
      'dismantle',
      'abolish',
      'defund',
      'take over',
      'my generals',
    ],
    democratic: [
      'independent agencies',
      'merit-based',
      'career professionals',
      'institutional integrity',
      'nonpartisan',
      'professional civil service',
      'independent judiciary',
      'congressional oversight',
    ],
  },
};

export const ACTION_KEYWORDS: Record<PolicyArea, IntentKeywordSet> = {
  rule_of_law: {
    authoritarian: [
      'defied court order',
      'refused to comply',
      'violated injunction',
      'contempt of court',
      'ignored ruling',
      'executive order overriding',
      'pardoned allies',
      'fired investigators',
    ],
    democratic: [
      'complied with court order',
      'implemented ruling',
      'appointed independent counsel',
      'cooperated with investigation',
    ],
  },
  civil_liberties: {
    authoritarian: [
      'detained without charge',
      'mass deportation',
      'revoked status',
      'banned protests',
      'surveilled journalists',
      'arrested activists',
    ],
    democratic: [
      'released detainees',
      'expanded protections',
      'signed civil rights',
      'consent decree',
      'restored voting rights',
    ],
  },
  elections: {
    authoritarian: [
      'challenged election results',
      'replaced election officials',
      'voter suppression',
      'gerrymandered',
      'purged voter rolls',
    ],
    democratic: [
      'certified election',
      'expanded voting access',
      'bipartisan election reform',
      'protected ballot access',
    ],
  },
  media_freedom: {
    authoritarian: [
      'revoked press credentials',
      'sued journalist',
      'seized records',
      'subpoenaed reporter',
      'blocked foia',
      'classified public records',
    ],
    democratic: [
      'held press conference',
      'released documents',
      'foia compliance',
      'press briefing restored',
      'journalist protections',
    ],
  },
  institutional_independence: {
    authoritarian: [
      'fired inspector general',
      'replaced career staff',
      'schedule f implemented',
      'defunded agency',
      'merged agency',
      'installed loyalist',
      'bypassed senate confirmation',
      'mass removal',
    ],
    democratic: [
      'confirmed independent nominee',
      'restored funding',
      'strengthened oversight',
      'protected whistleblower',
      'merit-based appointments',
    ],
  },
};
