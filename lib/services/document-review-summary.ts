/**
 * Build AIAssessmentSummary from stored ai_document_assessments rows.
 * Shared by enrich-weekly-scores.ts and retrospective.ts.
 */

import { and, eq, gte, lt } from 'drizzle-orm';
import { tierForDocument } from '@/lib/data/document-tiers';
import { getDb } from '@/lib/db';
import { aiDocumentAssessments, documents } from '@/lib/db/schema';
import { computeAIAssessmentSummary } from '@/lib/services/document-review-assessment-service';
import type { Pass1Result, Pass2Result } from '@/lib/services/document-review-assessment-service';
import { getBaselineAIFlagRate } from '@/lib/services/document-review-store';
import type { AIAssessmentSummary } from '@/lib/types/structural';
import { addDays } from '@/lib/utils/date-utils';

const STUB_META = { tokensInput: 0, tokensOutput: 0, latencyMs: 0 };

type Pass1Row = {
  url: string;
  relevant: boolean | null;
  confidence: number | null;
  erosionType: string | null;
  signals: unknown;
  model: string;
  provider: string;
};

type Pass2Row = {
  url: string;
  assessment: string | null;
  confidence: number | null;
  erosionType: string | null;
  erosionActor: string | null;
  reasoning: string | null;
  comparativeContext: string | null;
  citedPassages: unknown;
  counterArguments: unknown;
  model: string;
  provider: string;
  isAuditSample: boolean | null;
  docSourceType: string | null;
  docEvidenceTier: string | null;
};

function toPass1Result(r: Pass1Row): Pass1Result {
  return {
    url: r.url,
    response: {
      relevant: r.relevant ?? false,
      confidence: r.confidence ?? 0,
      erosionType: (r.erosionType ?? 'unclear') as Pass1Result['response']['erosionType'],
      signals: (r.signals as string[]) ?? [],
    },
    meta: { model: r.model, provider: r.provider, ...STUB_META },
  };
}

function toPass2Result(r: Pass2Row): Pass2Result {
  return {
    url: r.url,
    isAuditSample: r.isAuditSample ?? false,
    tier: tierForDocument({ sourceType: r.docSourceType, evidenceTier: r.docEvidenceTier }),
    response: {
      assessment: (r.assessment ?? 'routine') as Pass2Result['response']['assessment'],
      confidence: r.confidence ?? 0,
      erosionType: (r.erosionType ?? 'unclear') as Pass2Result['response']['erosionType'],
      // NULL stays undefined → lands in the 'unattributed' bucket downstream
      erosionActor: (r.erosionActor ?? undefined) as Pass2Result['response']['erosionActor'],
      reasoning: r.reasoning ?? '',
      comparativeContext: r.comparativeContext ?? '',
      citedPassages: (r.citedPassages as string[]) ?? [],
      counterArguments: (r.counterArguments as string[]) ?? [],
    },
    meta: { model: r.model, provider: r.provider, ...STUB_META },
  };
}

/** Build the week-range filter for a Monday-to-Sunday window. */
function weekFilter(category: string, weekOf: string) {
  const nextWeekStr = addDays(weekOf, 7);
  return and(
    eq(aiDocumentAssessments.category, category),
    gte(aiDocumentAssessments.weekOf, weekOf),
    lt(aiDocumentAssessments.weekOf, nextWeekStr),
  );
}

/** Query pass 1 and pass 2 rows for a category-week. */
async function fetchPassRows(category: string, weekOf: string) {
  const db = getDb();
  const range = weekFilter(category, weekOf);

  const pass1Rows = await db
    .select({
      url: aiDocumentAssessments.url,
      relevant: aiDocumentAssessments.relevant,
      confidence: aiDocumentAssessments.confidence,
      erosionType: aiDocumentAssessments.erosionType,
      signals: aiDocumentAssessments.signals,
      model: aiDocumentAssessments.model,
      provider: aiDocumentAssessments.provider,
    })
    .from(aiDocumentAssessments)
    .where(and(range, eq(aiDocumentAssessments.pass, 1)));

  const pass2Rows = await db
    .select({
      url: aiDocumentAssessments.url,
      assessment: aiDocumentAssessments.assessment,
      confidence: aiDocumentAssessments.confidence,
      erosionType: aiDocumentAssessments.erosionType,
      erosionActor: aiDocumentAssessments.erosionActor,
      reasoning: aiDocumentAssessments.reasoning,
      comparativeContext: aiDocumentAssessments.comparativeContext,
      citedPassages: aiDocumentAssessments.citedPassages,
      counterArguments: aiDocumentAssessments.counterArguments,
      model: aiDocumentAssessments.model,
      provider: aiDocumentAssessments.provider,
      isAuditSample: aiDocumentAssessments.isAuditSample,
      docSourceType: documents.sourceType,
      docEvidenceTier: documents.evidenceTier,
    })
    .from(aiDocumentAssessments)
    .leftJoin(
      documents,
      and(
        eq(documents.url, aiDocumentAssessments.url),
        eq(documents.category, aiDocumentAssessments.category),
      ),
    )
    .where(and(range, eq(aiDocumentAssessments.pass, 2)));

  return { pass1Rows, pass2Rows };
}

export async function buildAISummaryFromDB(
  category: string,
  weekOf: string,
): Promise<AIAssessmentSummary | null> {
  const { pass1Rows, pass2Rows } = await fetchPassRows(category, weekOf);
  if (pass1Rows.length === 0) return null;

  const pass1Model = pass1Rows[0]?.model ?? 'unknown';
  const pass2Model = pass2Rows[0]?.model ?? 'unknown';
  const baseline = await getBaselineAIFlagRate(category, 'biden_2022');

  return computeAIAssessmentSummary(
    pass1Rows.map(toPass1Result),
    pass2Rows.map(toPass2Result),
    baseline?.rate ?? 0,
    baseline?.stdDev ?? 0,
    pass1Model,
    pass2Model,
  );
}
