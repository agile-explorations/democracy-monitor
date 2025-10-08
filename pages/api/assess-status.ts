import type { NextApiRequest, NextApiResponse } from 'next';

// Assessment rules for each category
const ASSESSMENT_RULES = {
  civilService: {
    keywords: {
      // CAPTURE: Explicit legal violations or mass conversions
      capture: [
        'schedule f', 'excepted schedule f', 'mass termination', 'mass removal',
        'political appointee conversion', 'title 5 exemption', 'merit system violation',
        'violated civil service protections', 'unlawful termination', 'systematic purge',
        'political loyalty test', 'removed for political reasons'
      ],
      // DRIFT: Structural changes that weaken protections
      drift: [
        'reclassification', 'excepted service', 'policy-influencing position',
        'career staff removed', 'reduced career positions', 'political control over hiring',
        'at-will employment', 'bypassing merit system', 'categorical exclusion'
      ],
      // WARNING: Normal personnel actions with potential concern
      warning: [
        'workforce reduction', 'reorganization', 'senior executive service',
        'position eliminated', 'restructuring'
      ]
    },
    volumeThreshold: { warning: 5, drift: 10, capture: 20 }
  },
  fiscal: {
    keywords: {
      // CAPTURE: GAO/court findings of illegality
      capture: [
        'violated impoundment control act', 'illegal impoundment', 'unlawful withholding',
        'anti-deficiency act violation', 'gao decision', 'violated appropriations law',
        'illegal rescission', 'unconstitutional refusal', 'contempt for withholding'
      ],
      // DRIFT: Actions that circumvent appropriations
      drift: [
        'deferral', 'apportionment withheld', 'rescission', 'budget authority withheld',
        'refused to obligate', 'selective implementation', 'funding freeze',
        'impoundment', 'delayed obligation'
      ],
      // WARNING: Normal budget execution variations
      warning: [
        'funding delay', 'obligation rate', 'apportionment', 'spend plan'
      ]
    },
    volumeThreshold: { warning: 2, drift: 5, capture: 10 }
  },
  igs: {
    keywords: {
      // CAPTURE: Removals, firings, or systematic obstruction
      capture: [
        'inspector general removed', 'ig fired', 'ig terminated without cause',
        'mass ig removal', 'defunded inspector general', 'eliminated ig office',
        'systematic obstruction of oversight', 'ig independence violated'
      ],
      // DRIFT: Weakening of IG function
      drift: [
        'acting inspector general', 'ig vacancy', 'funding cut to oversight',
        'obstruction of investigation', 'denied access', 'ig report suppressed',
        'oversight.gov', 'lack of apportionment', 'delayed ig appointment',
        'restricted ig authority'
      ],
      // WARNING: Normal oversight friction
      warning: [
        'independence concern', 'access delayed', 'report delayed',
        'investigation pending'
      ]
    },
    volumeThreshold: { warning: 2, drift: 4, capture: 8 },
    oversightGovDown: 'drift'
  },
  hatch: {
    keywords: {
      // CAPTURE: OSC findings or systematic violations
      capture: [
        'hatch act violation found', 'systematic hatch act violations',
        'osc enforcement suspended', 'defunded office of special counsel',
        'violated hatch act', 'osc found violation', 'unlawful partisan activity'
      ],
      // DRIFT: Pattern of violations or weakened enforcement
      drift: [
        'multiple hatch act violations', 'repeated partisan messaging',
        'official channels for campaign', 'political activity in office',
        'pattern of violations', 'weakened enforcement'
      ],
      // WARNING: Complaints or investigations
      warning: [
        'hatch act complaint', 'osc investigation', 'alleged violation',
        'partisan communication'
      ]
    },
    volumeThreshold: { warning: 3, drift: 6, capture: 12 }
  },
  courts: {
    keywords: {
      // CAPTURE: Defiance or contempt findings
      capture: [
        'contempt of court', 'defied court order', 'refused to comply',
        'violated injunction', 'ignored court ruling', 'non-compliance with order',
        'contempt citation', 'willful violation of court order'
      ],
      // DRIFT: Delayed or partial compliance
      drift: [
        'delayed compliance', 'partial compliance', 'slow-walking court order',
        'emergency stay sought', 'appealing for delay', 'minimal compliance',
        'procedural objections to compliance'
      ],
      // WARNING: Normal litigation activity
      warning: [
        'injunction issued', 'preliminary injunction', 'temporary restraining order',
        'court ordered', 'judicial review'
      ]
    },
    volumeThreshold: { warning: 5, drift: 10, capture: 15 }
  },
  military: {
    keywords: {
      // CAPTURE: Actual domestic military deployment
      capture: [
        'insurrection act invoked', 'martial law declared', 'military occupation',
        'troops deployed domestically', 'military law enforcement', 'suspended habeas corpus'
      ],
      // DRIFT: Preparations or authority expansion
      drift: [
        'domestic military deployment', 'law enforcement role for military',
        'posse comitatus', 'preparing to invoke insurrection act',
        'military on standby', 'federalized national guard'
      ],
      // WARNING: Normal Guard/border operations
      warning: [
        'national guard activated', 'border deployment', 'title 32 activation',
        'state request for troops'
      ]
    },
    volumeThreshold: { warning: 3, drift: 6, capture: 10 }
  },
  rulemaking: {
    keywords: {
      // CAPTURE: Overriding independent agency authority
      capture: [
        'independent agency overridden', 'executive order supremacy over statute',
        'violated apa', 'unlawful regulatory action', 'exceeded statutory authority',
        'unconstitutional rule'
      ],
      // DRIFT: Expanded White House control
      drift: [
        'white house review required', 'oira clearance expanded',
        'regulatory freeze', 'independent agency subject to review',
        'centralized regulatory control', 'political clearance required'
      ],
      // WARNING: Normal regulatory activity
      warning: [
        'significant increase in rules', 'review backlog', 'regulatory agenda',
        'notice and comment'
      ]
    },
    volumeThreshold: { warning: 50, drift: 100, capture: 200 }
  },
  indices: {
    keywords: {
      // CAPTURE: Explicit democratic backsliding
      capture: [
        'democracy downgrade', 'authoritarian shift', 'democratic decline',
        'rule of law erosion', 'institutional collapse'
      ],
      // DRIFT: Warning signs from monitors
      drift: [
        'declining democratic score', 'erosion of norms', 'weakening checks',
        'executive aggrandizement', 'institutional degradation'
      ],
      // WARNING: Concerns raised
      warning: [
        'concern raised', 'watchlist', 'monitoring situation',
        'potential risk'
      ]
    }
  }
};

type StatusLevel = 'Stable' | 'Warning' | 'Drift' | 'Capture';

function analyzeContent(items: any[], category: string): { status: StatusLevel; reason: string; matches: string[] } {
  const rules = ASSESSMENT_RULES[category as keyof typeof ASSESSMENT_RULES];
  if (!rules) {
    return { status: 'Warning', reason: 'No assessment rules configured', matches: [] };
  }

  // Special case: Check if oversight.gov is down for igs category
  if (category === 'igs') {
    const oversightDown = items.some(item =>
      item.title?.includes('CURRENTLY DOWN') ||
      item.title?.includes('offline') ||
      item.note?.includes('lack of apportionment')
    );
    if (oversightDown) {
      return {
        status: 'Drift',
        reason: 'Oversight.gov (central IG portal) is offline due to funding issues',
        matches: ['oversight.gov shutdown']
      };
    }
  }

  let captureMatches: string[] = [];
  let driftMatches: string[] = [];
  let warningMatches: string[] = [];

  // Analyze each item with source weighting
  const highAuthorityKeywords: string[] = [];

  items.forEach(item => {
    const itemText = `${item.title || ''} ${item.summary || ''} ${item.note || ''} ${item.agency || ''}`.toLowerCase();

    // Source weighting: GAO decisions, court orders, and IG reports are authoritative
    const isHighAuthority = itemText.includes('gao') ||
                           itemText.includes('court') ||
                           itemText.includes('inspector general') ||
                           itemText.includes('violated') ||
                           itemText.includes('illegal') ||
                           itemText.includes('unlawful');

    // Check for temporal/pattern indicators
    const hasPatternLanguage = itemText.includes('unprecedented') ||
                               itemText.includes('systematic') ||
                               itemText.includes('pattern of') ||
                               itemText.includes('multiple') ||
                               itemText.includes('repeated');

    // Check keywords with context
    if (rules.keywords) {
      for (const keyword of rules.keywords.capture || []) {
        if (itemText.includes(keyword.toLowerCase())) {
          captureMatches.push(keyword);
          if (isHighAuthority) {
            highAuthorityKeywords.push(`${keyword} (authoritative source)`);
          }
        }
      }
      for (const keyword of rules.keywords.drift || []) {
        if (itemText.includes(keyword.toLowerCase())) {
          driftMatches.push(keyword);
          if (hasPatternLanguage) {
            // Upgrade drift to capture if pattern language is present
            captureMatches.push(`${keyword} (systematic pattern)`);
          }
        }
      }
      for (const keyword of rules.keywords.warning || []) {
        if (itemText.includes(keyword.toLowerCase())) {
          warningMatches.push(keyword);
        }
      }
    }
  });

  // Deduplicate matches
  captureMatches = [...new Set(captureMatches)];
  driftMatches = [...new Set(driftMatches)];
  warningMatches = [...new Set(warningMatches)];

  // Assess based on severity
  const itemCount = items.filter(i => !i.isError && !i.isWarning).length;

  if (captureMatches.length > 0) {
    const hasHighAuthority = highAuthorityKeywords.length > 0;
    return {
      status: 'Capture',
      reason: hasHighAuthority
        ? `Serious violations found by official sources (GAO, courts, or IGs): ${captureMatches.slice(0, 3).join(', ')}`
        : `Critical warning signs detected: ${captureMatches.slice(0, 3).join(', ')}`,
      matches: captureMatches,
      detail: {
        captureCount: captureMatches.length,
        driftCount: driftMatches.length,
        warningCount: warningMatches.length,
        itemsReviewed: itemCount,
        hasAuthoritative: hasHighAuthority
      }
    };
  }

  if (driftMatches.length >= 2) {
    return {
      status: 'Drift',
      reason: `Multiple concerning patterns found: ${driftMatches.slice(0, 3).join(', ')}`,
      matches: driftMatches,
      detail: {
        captureCount: 0,
        driftCount: driftMatches.length,
        warningCount: warningMatches.length,
        itemsReviewed: itemCount,
        hasAuthoritative: false
      }
    };
  }

  if (driftMatches.length === 1) {
    return {
      status: 'Warning',
      reason: `One concerning pattern detected: ${driftMatches[0]}`,
      matches: driftMatches,
      detail: {
        captureCount: 0,
        driftCount: 1,
        warningCount: warningMatches.length,
        itemsReviewed: itemCount,
        hasAuthoritative: false
      }
    };
  }

  if (warningMatches.length > 0) {
    return {
      status: 'Warning',
      reason: `Minor issues found: ${warningMatches.slice(0, 3).join(', ')}`,
      matches: warningMatches,
      detail: {
        captureCount: 0,
        driftCount: 0,
        warningCount: warningMatches.length,
        itemsReviewed: itemCount,
        hasAuthoritative: false
      }
    };
  }

  // Volume-based assessment
  if (rules.volumeThreshold) {
    if (itemCount >= rules.volumeThreshold.capture) {
      return {
        status: 'Drift',
        reason: `Very high activity level (${itemCount} documents) - may show increased government control`,
        matches: [],
        detail: {
          captureCount: 0,
          driftCount: 0,
          warningCount: 0,
          itemsReviewed: itemCount,
          hasAuthoritative: false
        }
      };
    }
    if (itemCount >= rules.volumeThreshold.drift) {
      return {
        status: 'Warning',
        reason: `Higher than normal activity (${itemCount} documents)`,
        matches: [],
        detail: {
          captureCount: 0,
          driftCount: 0,
          warningCount: 0,
          itemsReviewed: itemCount,
          hasAuthoritative: false
        }
      };
    }
  }

  // If we have successful data and no red flags, it's Stable
  if (itemCount > 0) {
    return {
      status: 'Stable',
      reason: 'Everything looks normal - no warning signs detected',
      matches: [],
      detail: {
        captureCount: 0,
        driftCount: 0,
        warningCount: 0,
        itemsReviewed: itemCount,
        hasAuthoritative: false
      }
    };
  }

  return {
    status: 'Warning',
    reason: 'Not enough information to make an assessment',
    matches: [],
    detail: {
      captureCount: 0,
      driftCount: 0,
      warningCount: 0,
      itemsReviewed: 0,
      hasAuthoritative: false
    }
  };
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const { category, items } = req.body;

    if (!category) {
      return res.status(400).json({ error: 'Missing category parameter' });
    }

    if (!items || !Array.isArray(items)) {
      return res.status(400).json({ error: 'Missing or invalid items array' });
    }

    const assessment = analyzeContent(items, category);

    res.status(200).json({
      category,
      ...assessment,
      assessedAt: new Date().toISOString()
    });
  } catch (err: any) {
    res.status(500).json({ error: String(err?.message || err) });
  }
}
