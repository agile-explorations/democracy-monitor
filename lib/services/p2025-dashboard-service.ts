import { eq, sql } from 'drizzle-orm';
import { getDb, isDbAvailable } from '@/lib/db';
import { documents, p2025Matches, p2025Proposals } from '@/lib/db/schema';
import type { P2025Classification, P2025Summary } from '@/lib/types/p2025';

function buildClassificationBreakdown(
  matches: Array<{ llmClassification: string | null }>,
): Record<P2025Classification, number> {
  const breakdown: Record<P2025Classification, number> = {
    not_related: 0,
    loosely_related: 0,
    implements: 0,
    exceeds: 0,
  };

  for (const m of matches) {
    const c = m.llmClassification as P2025Classification;
    if (c in breakdown) {
      breakdown[c]++;
    }
  }

  return breakdown;
}

function buildProposalStats(
  proposals: Array<{
    id: string;
    dashboardCategory: string | null;
    severity: string;
    status: string;
  }>,
  matchedIds: Set<string>,
) {
  const byCategory: Record<string, { total: number; matched: number }> = {};
  const bySeverity: Record<string, number> = {};
  const byStatus: Record<string, number> = {};

  for (const p of proposals) {
    const cat = p.dashboardCategory || 'unknown';
    if (!byCategory[cat]) byCategory[cat] = { total: 0, matched: 0 };
    byCategory[cat].total++;
    if (matchedIds.has(p.id)) byCategory[cat].matched++;

    bySeverity[p.severity] = (bySeverity[p.severity] || 0) + 1;
    byStatus[p.status] = (byStatus[p.status] || 0) + 1;
  }

  return { byCategory, bySeverity, byStatus };
}

/**
 * Get aggregate summary of P2025 proposal tracking.
 */
export async function getP2025Summary(): Promise<P2025Summary> {
  if (!isDbAvailable()) {
    return emptySummary();
  }

  const db = getDb();

  const proposals = await db
    .select({
      id: p2025Proposals.id,
      dashboardCategory: p2025Proposals.dashboardCategory,
      severity: p2025Proposals.severity,
      status: p2025Proposals.status,
    })
    .from(p2025Proposals);

  const matches = await db
    .select({
      proposalId: p2025Matches.proposalId,
      llmClassification: p2025Matches.llmClassification,
    })
    .from(p2025Matches);

  const matchedProposalIds = new Set(
    matches
      .filter((m) => m.llmClassification === 'implements' || m.llmClassification === 'exceeds')
      .map((m) => m.proposalId),
  );

  const classificationBreakdown = buildClassificationBreakdown(matches);
  const { byCategory, bySeverity, byStatus } = buildProposalStats(proposals, matchedProposalIds);

  return {
    totalProposals: proposals.length,
    matchedCount: matchedProposalIds.size,
    classificationBreakdown,
    byCategory,
    bySeverity,
    byStatus,
  };
}

/**
 * Get detailed info for a single proposal including all matches.
 */
export async function getProposalDetail(proposalId: string) {
  if (!isDbAvailable()) return null;

  const db = getDb();

  const [proposal] = await db
    .select()
    .from(p2025Proposals)
    .where(eq(p2025Proposals.id, proposalId));

  if (!proposal) return null;

  // Get matches with document titles
  const matchRows = await db
    .select({
      id: p2025Matches.id,
      proposalId: p2025Matches.proposalId,
      documentId: p2025Matches.documentId,
      cosineSimilarity: p2025Matches.cosineSimilarity,
      llmClassification: p2025Matches.llmClassification,
      llmConfidence: p2025Matches.llmConfidence,
      llmReasoning: p2025Matches.llmReasoning,
      humanReviewed: p2025Matches.humanReviewed,
      humanClassification: p2025Matches.humanClassification,
      matchedAt: p2025Matches.matchedAt,
      documentTitle: documents.title,
      documentUrl: documents.url,
    })
    .from(p2025Matches)
    .leftJoin(documents, eq(p2025Matches.documentId, documents.id))
    .where(eq(p2025Matches.proposalId, proposalId));

  return buildProposalResponse(proposal, matchRows);
}

function buildProposalResponse(
  proposal: typeof p2025Proposals.$inferSelect,
  matchRows: Array<{
    id: number;
    proposalId: string;
    documentId: number | null;
    cosineSimilarity: number | null;
    llmClassification: string | null;
    llmConfidence: number | null;
    llmReasoning: string | null;
    humanReviewed: boolean;
    humanClassification: string | null;
    matchedAt: Date;
    documentTitle: string | null;
    documentUrl: string | null;
  }>,
) {
  return {
    proposal: {
      id: proposal.id,
      chapter: proposal.chapter,
      targetAgency: proposal.targetAgency,
      dashboardCategory: proposal.dashboardCategory,
      policyArea: proposal.policyArea,
      severity: proposal.severity,
      text: proposal.text,
      summary: proposal.summary,
      status: proposal.status,
    },
    matches: matchRows.map((m) => ({
      id: m.id,
      documentId: m.documentId,
      documentTitle: m.documentTitle,
      documentUrl: m.documentUrl,
      cosineSimilarity: m.cosineSimilarity,
      llmClassification: m.llmClassification,
      llmConfidence: m.llmConfidence,
      llmReasoning: m.llmReasoning,
      humanReviewed: m.humanReviewed,
      humanClassification: m.humanClassification,
      matchedAt: m.matchedAt,
    })),
  };
}

/**
 * Get proposals filtered by dashboard category.
 */
export async function getP2025ByCategory(categoryKey: string) {
  if (!isDbAvailable()) return [];

  const db = getDb();

  const proposals = await db
    .select({
      id: p2025Proposals.id,
      chapter: p2025Proposals.chapter,
      targetAgency: p2025Proposals.targetAgency,
      severity: p2025Proposals.severity,
      summary: p2025Proposals.summary,
      status: p2025Proposals.status,
    })
    .from(p2025Proposals)
    .where(eq(p2025Proposals.dashboardCategory, categoryKey));

  // Get match counts per proposal
  const matchCounts = await db
    .select({
      proposalId: p2025Matches.proposalId,
      total: sql<number>`count(*)::int`,
      implemented: sql<number>`count(*) filter (where ${p2025Matches.llmClassification} in ('implements', 'exceeds'))::int`,
    })
    .from(p2025Matches)
    .groupBy(p2025Matches.proposalId);

  const countMap = new Map(matchCounts.map((m) => [m.proposalId, m]));

  return proposals.map((p) => {
    const counts = countMap.get(p.id);
    return {
      ...p,
      matchCount: counts?.total ?? 0,
      implementedCount: counts?.implemented ?? 0,
    };
  });
}

function emptySummary(): P2025Summary {
  return {
    totalProposals: 0,
    matchedCount: 0,
    classificationBreakdown: {
      not_related: 0,
      loosely_related: 0,
      implements: 0,
      exceeds: 0,
    },
    byCategory: {},
    bySeverity: {},
    byStatus: {},
  };
}
