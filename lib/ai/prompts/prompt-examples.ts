/**
 * Generates rendered prompt examples for the methodology page.
 *
 * Calls actual production prompt builders with representative sample data
 * so the methodology page stays in sync with the real prompts automatically.
 *
 * NOTE: These prompts are displayed on the public methodology page.
 * Changes to the prompt source files are immediately visible to users.
 */

import {
  ATTRIBUTION_SYSTEM_PROMPT,
  buildAttributionPrompt,
} from '@/lib/ai/prompts/actor-attribution-prompt';
import { CATEGORIES } from '@/lib/data/categories';
import { PASS1_SYSTEM_PROMPT, buildPass1Prompt } from './document-review-pass1';
import { PASS2_SYSTEM_PROMPT, buildPass2Prompt } from './document-review-pass2';
import {
  narrativeDraftExample,
  narrativeFeedbackExample,
  narrativeRevisionExample,
} from './prompt-examples-narrative';

export interface PromptVariable {
  variable: string;
  description: string;
  example: string;
}

export interface PromptExample {
  id: string;
  label: string;
  description: string;
  model: string;
  systemPrompt: string;
  userPrompt: string;
  variables: PromptVariable[];
}

// ---------------------------------------------------------------------------
// Sample data — Civil Service category with a realistic example document
// ---------------------------------------------------------------------------

const EXAMPLE_CATEGORY = CATEGORIES.find((c) => c.key === 'civilService')!;

const EXAMPLE_DOC = {
  title: 'Executive Order on Restoring Accountability to Policy-Influencing Positions',
  content: '[Document content: first 8,000 characters of the full text are provided to the AI]',
  docType: 'executive_order',
  agency: 'Executive Office of the President',
  pubDate: '2025-02-11',
};

const EXAMPLE_PASS1_SIGNALS = [
  'reclassification of career positions',
  'removal of civil service protections',
];

const EXAMPLE_WEEK_CONTEXT = {
  categoryTitle: EXAMPLE_CATEGORY.title,
  expertDescription: EXAMPLE_CATEGORY.expertDescription ?? EXAMPLE_CATEGORY.description,
  totalDocs: 47,
  flaggedDocs: 5,
  flagRate: 0.106,
  baselineAvgFlagRate: 0.031,
  flaggedPeers: [
    { title: 'OPM Directive on Probationary Employee Evaluations', erosionType: 'formal_override' },
    {
      title: 'Reduction in Force Plan for Environmental Protection Agency',
      erosionType: 'operational_hollowing',
    },
  ],
  priorWeekTotalDocs: 42,
  priorWeekFlaggedDocs: 3,
  priorWeekFlagRate: 0.071,
  priorWeekPeers: [
    {
      title: 'Merit Systems Protection Board Vacancy Notice',
      erosionType: 'operational_hollowing',
    },
  ],
  trajectory: 'increasing',
};

// ---------------------------------------------------------------------------
// Narrative prompt instruction sections (extracted from production builders)
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------

const CATEGORY_DESC = EXAMPLE_CATEGORY.expertDescription ?? EXAMPLE_CATEGORY.description;

function pass1Example(): PromptExample {
  return {
    id: 'pass1',
    label: 'Pass 1 — Document Screening',
    description:
      'Every document is screened for relevance to institutional erosion concerns. Most government documents are routine; this pass identifies the small fraction worth closer examination.',
    model: 'GPT-4o-mini (OpenAI)',
    systemPrompt: PASS1_SYSTEM_PROMPT,
    userPrompt: buildPass1Prompt(
      EXAMPLE_DOC.title,
      EXAMPLE_DOC.content,
      EXAMPLE_DOC.docType,
      EXAMPLE_DOC.agency,
      EXAMPLE_DOC.pubDate,
      CATEGORY_DESC,
    ),
    variables: [
      {
        variable: 'categoryDescription',
        description: 'Expert description of the category being assessed',
        example: CATEGORY_DESC.slice(0, 120) + '...',
      },
      { variable: 'title', description: 'Document title', example: EXAMPLE_DOC.title },
      {
        variable: 'content',
        description: 'First 8,000 characters of the document text',
        example: '[truncated for display]',
      },
      { variable: 'docType', description: 'Document type', example: EXAMPLE_DOC.docType },
      { variable: 'agency', description: 'Publishing agency', example: EXAMPLE_DOC.agency },
      { variable: 'pubDate', description: 'Publication date', example: EXAMPLE_DOC.pubDate },
    ],
  };
}

function pass2Example(): PromptExample {
  const ctx = EXAMPLE_WEEK_CONTEXT;
  return {
    id: 'pass2',
    label: 'Pass 2 — Detailed Assessment',
    description:
      'Documents flagged by Pass 1 are independently assessed by a different AI provider. The prompt includes week-level context so the reviewer can evaluate the document alongside its peers.',
    model: 'Claude (Anthropic)',
    systemPrompt: PASS2_SYSTEM_PROMPT,
    userPrompt: buildPass2Prompt(
      EXAMPLE_DOC.title,
      EXAMPLE_DOC.content,
      EXAMPLE_PASS1_SIGNALS,
      'formal_override',
      CATEGORY_DESC,
      ctx,
      EXAMPLE_DOC.docType,
    ),
    variables: [
      {
        variable: 'weekContext',
        description:
          'Stats for the current week: total docs assessed, flag count/rate, baseline comparison, flagged peer titles, trajectory',
        example: `${ctx.totalDocs} docs, ${ctx.flaggedDocs} flagged (${(ctx.flagRate * 100).toFixed(1)}%), baseline ${(ctx.baselineAvgFlagRate * 100).toFixed(1)}%`,
      },
      {
        variable: 'pass1Signals',
        description: 'Signals identified by Pass 1 screening',
        example: EXAMPLE_PASS1_SIGNALS.join(', '),
      },
      {
        variable: 'pass1ErosionType',
        description: 'Erosion classification from Pass 1',
        example: 'formal_override',
      },
      {
        variable: 'flaggedPeers',
        description: 'Other flagged documents from the same category-week',
        example: ctx.flaggedPeers.map((p) => p.title).join('; '),
      },
    ],
  };
}

function actorAttributionExample(): PromptExample {
  return {
    id: 'actor-attribution',
    label: 'Actor Attribution — Light Pass',
    description:
      'Confirmed documents receive an erosion-actor label (who performs the erosion-relevant ' +
      'action) from a separate lightweight pass over the stored assessment. Deliberately ' +
      'decoupled from Pass 2: a controlled experiment showed embedding attribution in the ' +
      'assessment prompt measurably shifted assessment outcomes. Attribution never changes ' +
      'how a document is assessed.',
    model: 'GPT-4o-mini (OpenAI)',
    systemPrompt: ATTRIBUTION_SYSTEM_PROMPT,
    userPrompt: buildAttributionPrompt({
      id: 0,
      url: 'https://example.gov/doc',
      category: 'civilService',
      title: EXAMPLE_DOC.title,
      reasoning:
        'Reclassifies career positions into an excepted service schedule, removing merit-based ' +
        'protections for policy-influencing roles.',
      citedPassages: ['positions of a confidential, policy-determining character'],
      erosionType: 'formal_override',
      assessment: 'clearly_concerning',
      contentHead: EXAMPLE_DOC.content,
      weekOf: '2025-02-10',
    }),
    variables: [
      {
        variable: 'reasoning',
        description: 'The stored Pass 2 assessment reasoning being attributed',
        example: 'Reclassifies career positions…',
      },
      {
        variable: 'contentHead',
        description: 'First 1,500 characters of the document text',
        example: '[document opening]',
      },
    ],
  };
}

export function getPromptExamples(): PromptExample[] {
  return [
    pass1Example(),
    pass2Example(),
    actorAttributionExample(),
    narrativeDraftExample(),
    narrativeFeedbackExample(),
    narrativeRevisionExample(),
  ];
}
