/**
 * Compare 3-pass Opus vs single-pass Sonnet research synthesis pipelines.
 *
 * Runs both pipelines on the same query and documents, outputs side-by-side results
 * with timing and token usage for quality comparison before shipping.
 *
 * Usage: source .env.local && tsx scripts/compare-research-pipelines.ts [query]
 * Default query: "What actions has the executive branch taken regarding immigration
 * enforcement and habeas corpus protections?"
 */

import { embedText } from '@/lib/services/embedding-service';
import {
  synthesizeResearchAnswer,
  synthesizeResearchAnswerSinglePass,
} from '@/lib/services/research-synthesis-service';
import { searchCorpusStats } from '@/lib/services/search-research-queries';
import { searchResearch } from '@/lib/services/search-service';

const DEFAULT_QUERY =
  'What actions has the executive branch taken regarding immigration enforcement and habeas corpus protections?';

const CONTEXT_DOCS = 30;
const DIVIDER = '='.repeat(80);
const SECTION = '-'.repeat(60);

async function main() {
  const query = process.argv[2] || DEFAULT_QUERY;

  console.log(DIVIDER);
  console.log('RESEARCH PIPELINE COMPARISON');
  console.log(DIVIDER);
  console.log(`Query: "${query}"\n`);

  // --- Retrieve documents (shared between both pipelines) ---
  console.log('Retrieving documents...');
  const embedding = await embedText(query);
  if (!embedding) {
    console.error('Failed to generate embedding. Check OPENAI_API_KEY.');
    process.exit(1);
  }

  const docs = await searchResearch(query, CONTEXT_DOCS, embedding);
  if (docs.length === 0) {
    console.error('No matching documents found.');
    process.exit(1);
  }

  const leastSimilarity = Math.min(...docs.map((d) => d.cosineSimilarity));
  const corpusStats =
    leastSimilarity > 0 ? await searchCorpusStats(embedding, 1 - leastSimilarity) : null;

  console.log(
    `Retrieved ${docs.length} documents (similarity range: ${leastSimilarity.toFixed(3)} – ${Math.max(...docs.map((d) => d.cosineSimilarity)).toFixed(3)})`,
  );
  if (corpusStats) {
    console.log(`Corpus total: ${corpusStats.totalMatching} matching documents`);
  }

  const contextDocs = docs.slice(0, CONTEXT_DOCS);
  console.log(`Using ${contextDocs.length} documents for synthesis\n`);

  // --- Run both pipelines ---
  console.log(DIVIDER);
  console.log('PIPELINE A: 3-Pass Opus (Draft → Feedback → Revision)');
  console.log(DIVIDER);

  const startA = Date.now();
  const resultA = await synthesizeResearchAnswer(query, contextDocs, corpusStats);
  const latencyA = Date.now() - startA;

  console.log(`\nCompleted in ${(latencyA / 1000).toFixed(1)}s`);
  console.log(
    `Models: draft=${resultA.draftModel}, feedback=${resultA.feedbackModel}, final=${resultA.finalModel}`,
  );

  console.log(`\n${DIVIDER}`);
  console.log('PIPELINE B: Single-Pass Sonnet (Self-Verification)');
  console.log(DIVIDER);

  const startB = Date.now();
  const resultB = await synthesizeResearchAnswerSinglePass(query, contextDocs, corpusStats);
  const latencyB = Date.now() - startB;

  console.log(`\nCompleted in ${(latencyB / 1000).toFixed(1)}s`);
  console.log(`Model: ${resultB.model}`);
  console.log(`Tokens: ${resultB.tokensUsed.input} in / ${resultB.tokensUsed.output} out`);

  // --- Side-by-side output ---
  console.log(`\n${DIVIDER}`);
  console.log('TIMING COMPARISON');
  console.log(DIVIDER);
  console.log(`Pipeline A (3-pass Opus):     ${(latencyA / 1000).toFixed(1)}s`);
  console.log(`Pipeline B (single Sonnet):   ${(latencyB / 1000).toFixed(1)}s`);
  console.log(`Speedup:                      ${(latencyA / latencyB).toFixed(1)}x`);

  console.log(`\n${DIVIDER}`);
  console.log('EXPERT ANSWER — Pipeline A (3-Pass Opus)');
  console.log(SECTION);
  console.log(resultA.expert);

  console.log(`\n${DIVIDER}`);
  console.log('EXPERT ANSWER — Pipeline B (Single-Pass Sonnet)');
  console.log(SECTION);
  console.log(resultB.expert);

  console.log(`\n${DIVIDER}`);
  console.log('PUBLIC ANSWER — Pipeline A (3-Pass Opus)');
  console.log(SECTION);
  console.log(resultA.public);

  console.log(`\n${DIVIDER}`);
  console.log('PUBLIC ANSWER — Pipeline B (Single-Pass Sonnet)');
  console.log(SECTION);
  console.log(resultB.public);

  console.log(`\n${DIVIDER}`);
  console.log('RELATED QUESTIONS — Pipeline A');
  console.log(SECTION);
  resultA.relatedQuestions.forEach((q, i) => console.log(`  ${i + 1}. ${q}`));

  console.log(`\nRELATED QUESTIONS — Pipeline B`);
  console.log(SECTION);
  resultB.relatedQuestions.forEach((q, i) => console.log(`  ${i + 1}. ${q}`));

  // --- Editorial feedback (only available from 3-pass) ---
  console.log(`\n${DIVIDER}`);
  console.log('EDITORIAL FEEDBACK (Pipeline A only — Pass 2 GPT-4o)');
  console.log(SECTION);
  console.log(resultA.feedback);

  // --- Draft vs Final comparison (3-pass only) ---
  console.log(`\n${DIVIDER}`);
  console.log('DRAFT vs FINAL (Pipeline A — was the revision substantive?)');
  console.log(SECTION);
  const draftWords = resultA.expertDraft.split(/\s+/).length;
  const finalWords = resultA.expert.split(/\s+/).length;
  console.log(`Expert draft: ${draftWords} words → final: ${finalWords} words`);
  console.log(
    `Draft and final are ${resultA.expertDraft === resultA.expert ? 'IDENTICAL' : 'DIFFERENT'}`,
  );

  console.log(`\n${DIVIDER}`);
  console.log('COMPARISON COMPLETE');
  console.log(DIVIDER);
}

main().catch(console.error);
