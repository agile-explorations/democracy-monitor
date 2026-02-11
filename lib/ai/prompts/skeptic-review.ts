import type { StatusLevel, ContentItem, KeywordMatchContext } from '@/lib/types';
import { formatItemSummaries } from './format-items';

export type { KeywordMatchContext };

export function buildSkepticReviewPrompt(
  category: string,
  categoryTitle: string,
  items: ContentItem[],
  keywordStatus: StatusLevel,
  keywordReason: string,
  keywordMatches: KeywordMatchContext[],
): string {
  const itemSummaries = formatItemSummaries(items);

  const matchDetails = keywordMatches
    .map((m) => `- "${m.keyword}" (${m.tier}) found in: ${m.matchedIn.slice(0, 200)}`)
    .join('\n');

  return `You are a skeptical reviewer of automated keyword-based alerts for the "${categoryTitle}" category of a democracy monitoring dashboard.

CATEGORY: ${category}
KEYWORD ENGINE RESULT: ${keywordStatus}
KEYWORD REASONING: ${keywordReason}

KEYWORD MATCHES THAT TRIGGERED THIS ALERT:
${matchDetails || '(no specific matches)'}

RECENT DOCUMENTS:
${itemSummaries}

Your job is to review the keyword matches above and determine whether they represent genuine concerns or false positives. The keyword engine tends to over-alert — many matches are coincidental, taken out of context, or from routine government documents.

For each keyword, also recommend whether it belongs in its current severity tier. If a keyword is a false positive in this context, suggest whether it should be removed from the dictionary entirely or just moved to a lower tier. If it only triggers falsely in certain contexts (e.g., "routine administrative" documents), describe that context as a suppression pattern.

IMPORTANT CONSTRAINTS:
- You may recommend the SAME status or a LOWER status than "${keywordStatus}". You CANNOT recommend a higher status.
- You must find at least one piece of evidence that the situation may not be as bad as the keyword alert suggests.
- You must identify at least two ways the current assessment could be wrong.

Respond in JSON format:
{
  "keywordReview": [
    {
      "keyword": "matched keyword",
      "assessment": "genuine_concern|false_positive|ambiguous",
      "reasoning": "why this match is or isn't meaningful",
      "suggestedAction": "keep|remove|move_to_warning|move_to_drift|move_to_capture",
      "suppressionContext": "context where this keyword is a false positive (omit if not applicable)"
    }
  ],
  "recommendedStatus": "Stable|Warning|Drift|Capture",
  "downgradeReason": "why matches are misleading (empty string if no downgrade)",
  "confidence": 0.0-1.0,
  "evidenceFor": ["evidence supporting the concerning assessment"],
  "evidenceAgainst": ["evidence suggesting not as bad as it appears"],
  "howWeCouldBeWrong": ["way 1 assessment could be wrong", "way 2"],
  "whatWouldChangeMind": "what evidence would cause you to agree with the higher severity"
}`;
}

export const SKEPTIC_REVIEW_SYSTEM_PROMPT = `You are a skeptical analyst who challenges over-reactive alerts in a democracy monitoring system. Your role is to distinguish real signals from noise. Keyword-based systems have high recall but low precision — they flag many routine government documents as concerning.

Your default stance: most keyword matches are false positives or ambiguous. The burden of proof is on the alert, not on dismissing it. Look for:
- Keywords appearing in historical/analytical context rather than describing current events
- Routine government activity being flagged as concerning
- Matches in document titles that describe monitoring the issue, not the issue itself
- Legal/regulatory terminology used in normal administrative processes

Be honest when matches ARE genuine concerns, but challenge the overall severity level when false positives inflate it.

Respond only with valid JSON.`;
