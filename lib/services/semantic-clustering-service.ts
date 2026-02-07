import type { SemanticCluster } from '@/lib/types/trends';
import { embedBatch, cosineSimilarity } from './embedding-service';
import { isDbAvailable, getDb } from '@/lib/db';
import { semanticClusters } from '@/lib/db/schema';
import { getAvailableProviders } from '@/lib/ai/provider';

interface DocumentForClustering {
  text: string;
  category: string;
  title: string;
}

// Simple k-means clustering implementation
function kMeans(
  vectors: number[][],
  k: number,
  maxIterations = 20
): { assignments: number[]; centroids: number[][] } {
  if (vectors.length === 0 || k <= 0) return { assignments: [], centroids: [] };
  k = Math.min(k, vectors.length);

  const dim = vectors[0].length;

  // Initialize centroids by picking k random vectors
  const indices = new Set<number>();
  while (indices.size < k) {
    indices.add(Math.floor(Math.random() * vectors.length));
  }
  let centroids = [...indices].map(i => [...vectors[i]]);
  let assignments = new Array(vectors.length).fill(0);

  for (let iter = 0; iter < maxIterations; iter++) {
    // Assign each vector to nearest centroid
    const newAssignments = vectors.map(vec => {
      let bestDist = -Infinity;
      let bestIdx = 0;
      for (let c = 0; c < centroids.length; c++) {
        const sim = cosineSimilarity(vec, centroids[c]);
        if (sim > bestDist) {
          bestDist = sim;
          bestIdx = c;
        }
      }
      return bestIdx;
    });

    // Check convergence
    if (JSON.stringify(newAssignments) === JSON.stringify(assignments)) break;
    assignments = newAssignments;

    // Recompute centroids
    centroids = centroids.map((_, c) => {
      const clusterVectors = vectors.filter((_, i) => assignments[i] === c);
      if (clusterVectors.length === 0) return centroids[c];

      const centroid = new Array(dim).fill(0);
      for (const vec of clusterVectors) {
        for (let d = 0; d < dim; d++) centroid[d] += vec[d];
      }
      for (let d = 0; d < dim; d++) centroid[d] /= clusterVectors.length;
      return centroid;
    });
  }

  return { assignments, centroids };
}

export async function clusterDocuments(
  documents: DocumentForClustering[],
  k = 5
): Promise<SemanticCluster[]> {
  if (documents.length < k) k = Math.max(1, documents.length);

  const texts = documents.map(d => `${d.title}: ${d.text.slice(0, 300)}`);
  const embeddings = await embedBatch(texts);

  // Filter out null embeddings
  const validPairs = documents
    .map((doc, i) => ({ doc, embedding: embeddings[i] }))
    .filter((p): p is { doc: DocumentForClustering; embedding: number[] } => p.embedding !== null);

  if (validPairs.length === 0) return [];

  const { assignments, centroids } = kMeans(
    validPairs.map(p => p.embedding),
    k
  );

  // Build clusters
  const clusters: SemanticCluster[] = [];

  for (let c = 0; c < centroids.length; c++) {
    const clusterDocs = validPairs.filter((_, i) => assignments[i] === c);
    if (clusterDocs.length === 0) continue;

    // Extract top keywords from cluster
    const wordFreq: Record<string, number> = {};
    for (const { doc } of clusterDocs) {
      const words = `${doc.title} ${doc.text}`.toLowerCase().split(/\s+/);
      for (const word of words) {
        if (word.length > 3) wordFreq[word] = (wordFreq[word] || 0) + 1;
      }
    }
    const topKeywords = Object.entries(wordFreq)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([w]) => w);

    const categories = [...new Set(clusterDocs.map(d => d.doc.category))];

    // Generate label from AI if available
    let label = `Cluster ${c + 1}`;
    let description = `${clusterDocs.length} documents about ${topKeywords.slice(0, 3).join(', ')}`;

    const providers = getAvailableProviders();
    if (providers.length > 0) {
      try {
        const titles = clusterDocs.map(d => d.doc.title).slice(0, 5).join(', ');
        const result = await providers[0].complete(
          `These documents are grouped together: ${titles}. Top keywords: ${topKeywords.slice(0, 5).join(', ')}. Give a short label (3-5 words) and one-sentence description. Format: LABEL: <label>\nDESCRIPTION: <description>`,
          { maxTokens: 100, temperature: 0.3 }
        );
        const labelMatch = result.content.match(/LABEL:\s*(.+)/);
        const descMatch = result.content.match(/DESCRIPTION:\s*(.+)/);
        if (labelMatch) label = labelMatch[1].trim();
        if (descMatch) description = descMatch[1].trim();
      } catch {
        // Use default label
      }
    }

    clusters.push({
      id: c,
      label,
      description,
      documentCount: clusterDocs.length,
      topKeywords,
      categories,
      centroid: centroids[c],
      createdAt: new Date().toISOString(),
    });
  }

  // Store in DB
  if (isDbAvailable()) {
    const db = getDb();
    for (const cluster of clusters) {
      await db.insert(semanticClusters).values({
        label: cluster.label,
        description: cluster.description,
        documentCount: cluster.documentCount,
        topKeywords: cluster.topKeywords,
        categories: cluster.categories,
      });
    }
  }

  return clusters;
}
