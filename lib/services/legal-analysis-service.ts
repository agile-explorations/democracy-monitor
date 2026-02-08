import { LEGAL_SYSTEM_PROMPT, buildLegalAnalysisPrompt } from '@/lib/ai/prompts/legal-analysis';
import { getProvider, getAvailableProviders } from '@/lib/ai/provider';
import { cacheGet, cacheSet } from '@/lib/cache';
import { LEGAL_KNOWLEDGE_BASE } from '@/lib/data/legal-knowledge-base';
import type { LegalAnalysisResult, LegalCitation } from '@/lib/types/legal';
import { embedText, cosineSimilarity } from './embedding-service';

async function findRelevantLegalDocs(
  context: string,
  category: string,
  topK = 5,
): Promise<Array<{ title: string; citation: string; content: string }>> {
  // First try embedding-based search
  const contextEmbedding = await embedText(context);

  if (contextEmbedding) {
    // Score each document by embedding similarity
    const scored = await Promise.all(
      LEGAL_KNOWLEDGE_BASE.filter(
        (doc) =>
          doc.relevantCategories.includes(category) || doc.relevantCategories.includes('all'),
      ).map(async (doc) => {
        const docEmbedding = await embedText(doc.content.slice(0, 500));
        const similarity = docEmbedding ? cosineSimilarity(contextEmbedding, docEmbedding) : 0;
        return { doc, similarity };
      }),
    );

    return scored
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, topK)
      .map((s) => ({ title: s.doc.title, citation: s.doc.citation, content: s.doc.content }));
  }

  // Fallback: keyword-based matching
  return LEGAL_KNOWLEDGE_BASE.filter(
    (doc) => doc.relevantCategories.includes(category) || doc.relevantCategories.includes('all'),
  )
    .slice(0, topK)
    .map((doc) => ({ title: doc.title, citation: doc.citation, content: doc.content }));
}

export async function runLegalAnalysis(
  category: string,
  status: string,
  evidence: string[],
): Promise<LegalAnalysisResult | null> {
  const cacheKey = `legal:${category}:${Date.now() - (Date.now() % (6 * 60 * 60 * 1000))}`;
  const cached = await cacheGet<LegalAnalysisResult>(cacheKey);
  if (cached) return cached;

  // Prefer Claude for legal analysis
  const providers = getAvailableProviders();
  const provider = providers.find((p) => p.name === 'anthropic') || providers[0];
  if (!provider) return null;

  const context = evidence.join('\n');
  const relevantDocs = await findRelevantLegalDocs(context, category);

  const start = Date.now();
  const result = await provider.complete(
    buildLegalAnalysisPrompt(category, status, evidence, relevantDocs),
    { systemPrompt: LEGAL_SYSTEM_PROMPT, maxTokens: 2000, temperature: 0.3 },
  );

  let parsed: {
    citations: LegalCitation[];
    analysis: string;
    constitutionalConcerns: string[];
    precedents: string[];
  };
  try {
    // Strip code fences by finding fence markers and slicing between them
    let jsonSource = result.content;
    const openFence = result.content.match(/`{3,}\w*[ \t]*\n?/);
    if (openFence && openFence.index !== undefined) {
      const start = openFence.index + openFence[0].length;
      const closeIdx = result.content.indexOf('```', start);
      if (closeIdx !== -1) {
        jsonSource = result.content.slice(start, closeIdx);
      }
    }
    const jsonMatch = jsonSource.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('No JSON object found');
    parsed = JSON.parse(jsonMatch[0]);
  } catch (err) {
    console.error(
      'Legal analysis parse failed:',
      err instanceof Error ? err.message : err,
      '\nFirst 300 chars:',
      result.content.slice(0, 300),
    );
    parsed = {
      citations: [],
      analysis: 'Legal analysis could not be parsed.',
      constitutionalConcerns: [],
      precedents: [],
    };
  }

  // Verify citations against knowledge base
  const verifiedCitations = (parsed.citations || []).map((citation) => ({
    ...citation,
    verified: LEGAL_KNOWLEDGE_BASE.some(
      (doc) => doc.citation === citation.citation || doc.title === citation.title,
    ),
  }));

  const analysisResult: LegalAnalysisResult = {
    category,
    status,
    citations: verifiedCitations,
    analysis: parsed.analysis || '',
    constitutionalConcerns: parsed.constitutionalConcerns || [],
    precedents: parsed.precedents || [],
    provider: provider.name,
    model: result.model,
    latencyMs: result.latencyMs,
  };

  await cacheSet(cacheKey, analysisResult, 6 * 60 * 60);
  return analysisResult;
}
