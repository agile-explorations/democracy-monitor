import { eq, sql } from 'drizzle-orm';
import { buildP2025JudgePrompt, P2025_JUDGE_SYSTEM_PROMPT } from '@/lib/ai/prompts/p2025-judge';
import { getAvailableProviders } from '@/lib/ai/provider';
import { getDb, isDbAvailable } from '@/lib/db';
import { documents, p2025Matches, p2025Proposals } from '@/lib/db/schema';
import { cosineSimilarity } from '@/lib/services/embedding-service';
import type { P2025Classification, P2025Match } from '@/lib/types/p2025';

const SIMILARITY_THRESHOLD = 0.5;
const DEFAULT_TOP_K = 10;

const VALID_CLASSIFICATIONS: P2025Classification[] = [
  'not_related',
  'loosely_related',
  'implements',
  'exceeds',
];

interface SimilarProposal {
  proposalId: string;
  summary: string;
  text: string;
  similarity: number;
}

/**
 * Find proposals similar to a given document using pgvector cosine similarity.
 * Falls back to in-memory cosine similarity if pgvector is unavailable.
 */
export async function findSimilarProposals(
  documentId: number,
  options: { threshold?: number; topK?: number } = {},
): Promise<SimilarProposal[]> {
  if (!isDbAvailable()) return [];

  const db = getDb();
  const threshold = options.threshold ?? SIMILARITY_THRESHOLD;
  const topK = options.topK ?? DEFAULT_TOP_K;

  // Get the document's embedding
  const [doc] = await db
    .select({ embedding: documents.embedding })
    .from(documents)
    .where(eq(documents.id, documentId));

  if (!doc?.embedding) return [];

  // Try pgvector similarity search
  try {
    const rows = await db.execute(sql`
      SELECT id, summary, text,
             1 - (embedding <=> ${JSON.stringify(doc.embedding)}::vector) AS similarity
      FROM p2025_proposals
      WHERE embedding IS NOT NULL
        AND 1 - (embedding <=> ${JSON.stringify(doc.embedding)}::vector) >= ${threshold}
      ORDER BY similarity DESC
      LIMIT ${topK}
    `);

    return (
      rows.rows as Array<{ id: string; summary: string; text: string; similarity: number }>
    ).map((r) => ({
      proposalId: r.id,
      summary: r.summary,
      text: r.text,
      similarity: Number(r.similarity),
    }));
  } catch (err) {
    console.warn('pgvector search failed, falling back to in-memory:', err);
    return await inMemorySearch(db, doc.embedding, threshold, topK);
  }
}

async function inMemorySearch(
  db: ReturnType<typeof getDb>,
  docEmbedding: number[],
  threshold: number,
  topK: number,
): Promise<SimilarProposal[]> {
  const proposals = await db
    .select({
      id: p2025Proposals.id,
      summary: p2025Proposals.summary,
      text: p2025Proposals.text,
      embedding: p2025Proposals.embedding,
    })
    .from(p2025Proposals)
    .where(sql`${p2025Proposals.embedding} IS NOT NULL`);

  return proposals
    .map((p) => ({
      proposalId: p.id,
      summary: p.summary,
      text: p.text,
      similarity: p.embedding ? cosineSimilarity(docEmbedding, p.embedding) : 0,
    }))
    .filter((p) => p.similarity >= threshold)
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, topK);
}

export interface JudgeResult {
  classification: P2025Classification;
  confidence: number;
  reasoning: string;
}

/**
 * Call the LLM judge to classify the match between a proposal and a document.
 */
export async function judgeMatch(
  proposal: { id: string; summary: string; text: string },
  document: { title: string; content: string | null },
): Promise<JudgeResult> {
  const providers = getAvailableProviders();
  if (providers.length === 0) {
    return { classification: 'not_related', confidence: 0, reasoning: 'No AI provider available' };
  }

  const provider = providers[0];
  const prompt = buildP2025JudgePrompt(proposal, document);

  const result = await provider.complete(prompt, {
    systemPrompt: P2025_JUDGE_SYSTEM_PROMPT,
    maxTokens: 500,
    temperature: 0.1,
  });

  return parseJudgeResponse(result.content);
}

/**
 * Parse the LLM judge response, handling malformed JSON gracefully.
 */
export function parseJudgeResponse(text: string): JudgeResult {
  try {
    // Extract JSON from response (handle markdown code blocks)
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return {
        classification: 'not_related',
        confidence: 0,
        reasoning: 'Failed to parse response',
      };
    }

    const parsed = JSON.parse(jsonMatch[0]);

    const classification = VALID_CLASSIFICATIONS.includes(parsed.classification)
      ? parsed.classification
      : 'not_related';

    const confidence =
      typeof parsed.confidence === 'number' ? Math.max(0, Math.min(1, parsed.confidence)) : 0;

    const reasoning =
      typeof parsed.reasoning === 'string' ? parsed.reasoning : 'No reasoning provided';

    return { classification, confidence, reasoning };
  } catch (err) {
    console.warn('Failed to parse judge response:', err);
    return { classification: 'not_related', confidence: 0, reasoning: 'Failed to parse response' };
  }
}

/**
 * Full pipeline: find similar proposals for a document, judge each, store results.
 */
export async function matchDocumentToProposals(
  documentId: number,
  options: { threshold?: number; topK?: number } = {},
): Promise<P2025Match[]> {
  if (!isDbAvailable()) return [];

  const db = getDb();

  // Get document details for LLM judge
  const [doc] = await db
    .select({ id: documents.id, title: documents.title, content: documents.content })
    .from(documents)
    .where(eq(documents.id, documentId));

  if (!doc) return [];

  const similar = await findSimilarProposals(documentId, options);
  const matches: P2025Match[] = [];

  for (const proposal of similar) {
    const judgeResult = await judgeMatch(
      { id: proposal.proposalId, summary: proposal.summary, text: proposal.text },
      { title: doc.title, content: doc.content },
    );

    const match: P2025Match = {
      proposalId: proposal.proposalId,
      documentId,
      cosineSimilarity: proposal.similarity,
      llmClassification: judgeResult.classification,
      llmConfidence: judgeResult.confidence,
      llmReasoning: judgeResult.reasoning,
      humanReviewed: false,
    };

    // Store in database
    await db.insert(p2025Matches).values({
      proposalId: match.proposalId,
      documentId: match.documentId,
      cosineSimilarity: match.cosineSimilarity,
      llmClassification: match.llmClassification,
      llmConfidence: match.llmConfidence,
      llmReasoning: match.llmReasoning,
      humanReviewed: false,
    });

    matches.push(match);
  }

  return matches;
}
