/* eslint-disable max-lines-per-function */
import { DOMAIN_STOPWORDS, STOPWORDS } from '@/lib/data/tfidf-stopwords';

const MIN_TOKEN_LENGTH = 3;
const PURE_NUMBER_RE = /^\d+$/;

/** Strip HTML/CSS/boilerplate from document content, returning plain text. */
export function stripMarkup(text: string): string {
  let cleaned = text;
  // Remove CSS blocks: everything between { } including nested (style attributes, embedded stylesheets)
  cleaned = cleaned.replace(/\{[^}]*\}/g, ' ');
  // Remove CSS selectors and property names left over (e.g., ".s1", "font-size:", "color:")
  cleaned = cleaned.replace(/\.[a-z]\d+/gi, ' ');
  // Remove HTML tags
  cleaned = cleaned.replace(/<[^>]+>/g, ' ');
  // Remove HTML entities
  cleaned = cleaned.replace(/&[a-z]+;/gi, ' ');
  // Remove document ID prefixes (e.g., DCPD202500636, FR-2025-01234)
  cleaned = cleaned.replace(/[A-Z]{2,}-?\d{6,}/g, ' ');
  // Collapse whitespace
  return cleaned.replace(/\s+/g, ' ').trim();
}

/** Tokenize text: strip markup, lowercase, split on non-alphanumeric, filter stopwords + noise. */
export function tokenize(text: string): string[] {
  return stripMarkup(text)
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(
      (t) =>
        t.length >= MIN_TOKEN_LENGTH &&
        !STOPWORDS.has(t) &&
        !DOMAIN_STOPWORDS.has(t) &&
        !PURE_NUMBER_RE.test(t),
    );
}

/** Extract bigrams (two-word phrases) from tokens. */
function extractBigrams(tokens: string[]): string[] {
  const bigrams: string[] = [];
  for (let i = 0; i < tokens.length - 1; i++) {
    bigrams.push(`${tokens[i]} ${tokens[i + 1]}`);
  }
  return bigrams;
}

/** Extract unigrams + bigrams from a document. */
function extractTerms(text: string): string[] {
  const tokens = tokenize(text);
  return [...tokens, ...extractBigrams(tokens)];
}

/** Count term frequency across a set of documents (unigrams + bigrams). */
function termFrequency(docs: string[]): Map<string, number> {
  const tf = new Map<string, number>();
  let totalTerms = 0;
  for (const doc of docs) {
    const terms = extractTerms(doc);
    totalTerms += terms.length;
    for (const term of terms) {
      tf.set(term, (tf.get(term) ?? 0) + 1);
    }
  }
  if (totalTerms === 0) return tf;
  for (const [term, count] of tf) {
    tf.set(term, count / totalTerms);
  }
  return tf;
}

/** Count how many documents contain each term (for IDF). */
function documentFrequency(docs: string[]): Map<string, number> {
  const df = new Map<string, number>();
  for (const doc of docs) {
    const unique = new Set(extractTerms(doc));
    for (const term of unique) {
      df.set(term, (df.get(term) ?? 0) + 1);
    }
  }
  return df;
}

/** Compute TF-IDF scores for a corpus, using combined IDF from both corpora. */
function tfidfScores(
  tf: Map<string, number>,
  totalDocs: number,
  df: Map<string, number>,
): Map<string, number> {
  const scores = new Map<string, number>();
  for (const [term, freq] of tf) {
    const docFreq = df.get(term) ?? 0;
    const idf = Math.log((totalDocs + 1) / (docFreq + 1)) + 1;
    scores.set(term, freq * idf);
  }
  return scores;
}

export interface ShiftTerms {
  fromTerms: string[];
  toTerms: string[];
}

/**
 * Compute terms with highest TF-IDF differential between typical and drift-driving docs.
 * Returns top terms (unigrams or bigrams) that characterize what the corpus is
 * shifting *from* and *to*. Bigrams are preferred when available since they
 * capture meaningful phrases ("civil rights") rather than isolated words.
 */
export function computeShiftTerms(
  typicalTexts: string[],
  driftTexts: string[],
  topN = 5,
): ShiftTerms {
  if (typicalTexts.length === 0 && driftTexts.length === 0) {
    return { fromTerms: [], toTerms: [] };
  }

  const allDocs = [...typicalTexts, ...driftTexts];
  const totalDocs = allDocs.length;
  const df = documentFrequency(allDocs);

  const typicalTf = termFrequency(typicalTexts);
  const driftTf = termFrequency(driftTexts);

  const typicalScores = tfidfScores(typicalTf, totalDocs, df);
  const driftScores = tfidfScores(driftTf, totalDocs, df);

  const allTerms = new Set([...typicalScores.keys(), ...driftScores.keys()]);

  const diffs: Array<{ term: string; diff: number }> = [];
  for (const term of allTerms) {
    const tScore = typicalScores.get(term) ?? 0;
    const dScore = driftScores.get(term) ?? 0;
    diffs.push({ term, diff: dScore - tScore });
  }

  diffs.sort((a, b) => b.diff - a.diff);

  const toTerms = deduplicateTerms(
    diffs.filter((d) => d.diff > 0),
    topN,
  );
  const fromTerms = deduplicateTerms(diffs.filter((d) => d.diff < 0).reverse(), topN);

  return { fromTerms, toTerms };
}

/**
 * Select top N terms, preferring bigrams and removing unigrams that are
 * subsumed by a higher-ranked bigram (e.g., skip "civil" if "civil rights" is already selected).
 */
function deduplicateTerms(ranked: Array<{ term: string; diff: number }>, topN: number): string[] {
  const selected: string[] = [];
  const coveredUnigrams = new Set<string>();

  for (const { term } of ranked) {
    if (selected.length >= topN) break;

    const isBigram = term.includes(' ');
    if (isBigram) {
      const parts = term.split(' ');
      for (const p of parts) coveredUnigrams.add(p);
      selected.push(term);
    } else if (!coveredUnigrams.has(term)) {
      selected.push(term);
    }
  }
  return selected;
}
