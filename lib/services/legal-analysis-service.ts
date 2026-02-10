import { LEGAL_SYSTEM_PROMPT, buildLegalAnalysisPrompt } from '@/lib/ai/prompts/legal-analysis';
import { getAvailableProviders } from '@/lib/ai/provider';
import { cacheGet, cacheSet } from '@/lib/cache';
import { AI_CACHE_BUCKET_MS, AI_CACHE_TTL_S } from '@/lib/data/cache-config';
import { LEGAL_KNOWLEDGE_BASE } from '@/lib/data/legal-knowledge-base';
import type { LegalAnalysisResult, LegalCitation } from '@/lib/types/legal';
import { selectProvider } from '@/lib/utils/ai-helpers';
import { embedText, cosineSimilarity } from './embedding-service';

interface ParsedAnalysis {
  citations: LegalCitation[];
  analysis: string;
  constitutionalConcerns: string[];
  precedents: string[];
}

const PARSE_FALLBACK: ParsedAnalysis = {
  citations: [],
  analysis: 'Legal analysis could not be parsed.',
  constitutionalConcerns: [],
  precedents: [],
};

function repairTruncatedJson(sanitized: string): ParsedAnalysis {
  let repaired = sanitized.replace(/,\s*$/, '');
  const openBrackets = (repaired.match(/\[/g) || []).length;
  const closeBrackets = (repaired.match(/\]/g) || []).length;
  const openBraces = (repaired.match(/\{/g) || []).length;
  const closeBraces = (repaired.match(/\}/g) || []).length;
  repaired = repaired.replace(/,\s*"[^"]*$/, '');
  repaired = repaired.replace(/,\s*\{[^}]*$/, '');
  for (let i = 0; i < openBrackets - closeBrackets; i++) repaired += ']';
  for (let i = 0; i < openBraces - closeBraces; i++) repaired += '}';
  return JSON.parse(repaired);
}

function parseAnalysisResponse(content: string): ParsedAnalysis {
  try {
    let jsonSource = content;
    const openFence = content.match(/`{3,}\w*[ \t]*\n?/);
    if (openFence && openFence.index !== undefined) {
      const fenceStart = openFence.index + openFence[0].length;
      const closeIdx = content.indexOf('```', fenceStart);
      if (closeIdx !== -1) jsonSource = content.slice(fenceStart, closeIdx);
    }
    const jsonMatch = jsonSource.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('No JSON object found');
    const sanitized = jsonMatch[0].replace(/[\x00-\x1f\x7f]/g, (ch) =>
      ch === '\n' || ch === '\r' || ch === '\t' ? ch : ' ',
    );
    try {
      return JSON.parse(sanitized);
    } catch (parseErr) {
      console.warn('Initial JSON parse failed, attempting repair:', parseErr);
      return repairTruncatedJson(sanitized);
    }
  } catch (err) {
    console.error(
      'Legal analysis parse failed:',
      err instanceof Error ? err.message : err,
      '\nFirst 300 chars:',
      content.slice(0, 300),
    );
    return PARSE_FALLBACK;
  }
}

async function findRelevantLegalDocs(
  context: string,
  category: string,
  topK = 5,
): Promise<Array<{ title: string; citation: string; content: string }>> {
  const contextEmbedding = await embedText(context);

  if (contextEmbedding) {
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
  const cacheKey = `legal:${category}:${Date.now() - (Date.now() % AI_CACHE_BUCKET_MS)}`;
  const cached = await cacheGet<LegalAnalysisResult>(cacheKey);
  if (cached) return cached;

  const provider = selectProvider(getAvailableProviders());
  if (!provider) return null;

  const context = evidence.join('\n');
  const relevantDocs = await findRelevantLegalDocs(context, category);

  const result = await provider.complete(
    buildLegalAnalysisPrompt(category, status, evidence, relevantDocs),
    { systemPrompt: LEGAL_SYSTEM_PROMPT, maxTokens: 3000, temperature: 0.3 },
  );

  const parsed = parseAnalysisResponse(result.content);

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

  await cacheSet(cacheKey, analysisResult, AI_CACHE_TTL_S);
  return analysisResult;
}
