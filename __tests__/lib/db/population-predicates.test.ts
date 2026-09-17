/**
 * Tripwire (#893, R-SEARCH-ORTHOGONAL): the corpus has three populations and
 * each surface may use exactly one of them (lib/db/document-filters.ts).
 *
 *   Searchable         search, research retrieval, hero, embedder
 *   Counting           structural stats, silence, drift, baselines
 *   Analysis evidence  scoring, AI review, narratives, validation, tipwire
 *
 * A search surface that filters on the analysis predicate silently hides
 * off-topic and unrouted documents from readers; an analysis surface that
 * uses the searchable predicate lets corpus rows into statistics. Both are
 * invisible at runtime, so this test scans source text. It fails until the
 * offending file is moved to its population's predicate.
 */
import { readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';
import { describe, expect, it } from 'vitest';

const REPO_ROOT = join(__dirname, '..', '..', '..');

function read(rel: string): string {
  return readFileSync(join(REPO_ROOT, rel), 'utf8');
}

/** The analysis-evidence predicate in every spelling the codebase uses. */
const ANALYSIS_PREDICATES = [
  'retrievalRelevantOnly(',
  'retrievalRelevantOnlySql(',
  'countingEligible(',
  'retrieval_relevant IS NOT FALSE',
];

/** The searchable predicate: the helper, or the inlined spelling raw-SQL
 *  builders use. */
const SEARCHABLE_MARKERS = ['searchable', 'superseded IS NOT TRUE'];

/**
 * Search surfaces that build their own documents predicate. They may read
 * `retrieval_relevant` as a COLUMN (the `routed` badge, the category facet
 * via categoryFacetD) but never as a row filter.
 */
const SEARCH_FILES_WITH_PREDICATE = [
  'lib/services/search-queries.ts',
  'lib/services/search-service.ts',
  'lib/services/search-research-queries.ts',
  'lib/services/research-retrieval.ts',
  'lib/services/alias-count-cache.ts',
  'pages/api/stats/document-count.ts',
  'lib/services/document-embedder.ts',
  'scripts/eval-retrieval-combo.ts',
];

/** Search surfaces that receive their WHERE clause from a caller above and
 *  add no population predicate of their own. */
const SEARCH_FILES_CONSUMING_PREDICATE = [
  'lib/services/hybrid-arms.ts',
  'lib/services/explore-document-paging.ts',
];

/** Analysis and counting surfaces, with the predicate spelling each uses. */
const ANALYSIS_FILES = [
  'lib/services/baseline-distributions.ts',
  'lib/services/baseline-service.ts',
  'lib/services/semantic-drift-service.ts',
  'lib/services/thematic-theme-labels.ts',
  'lib/services/silence-detection-service.ts',
  'lib/services/narrative-queries.ts',
  'lib/services/verdict-rates.ts',
  'lib/services/data-validation-queries.ts',
  'lib/cron/recompute-scores.ts',
  'lib/cron/backfill-document-review.ts',
  'lib/cron/validate-graph.ts',
  'lib/services/document-store.ts',
  'lib/services/explanation-service.ts',
  'lib/tipwire/beat-docs.ts',
  'lib/services/document-retriever.ts',
];

/** The only files allowed to spell the corpus pseudo-category as a literal:
 *  the declaration (client-safe, re-exported by document-filters), the graph
 *  invariants, and this test. Everyone else imports CORPUS_CATEGORY. */
const CORPUS_LITERAL_ALLOWED = new Set([
  'lib/data/document-populations.ts',
  'lib/cron/validate-graph.ts',
  '__tests__/lib/db/population-predicates.test.ts',
]);

/** CORPUS_CATEGORY imported from its declaration or the predicate module's re-export. */
const CORPUS_IMPORT =
  /import \{[^}]*\bCORPUS_CATEGORY\b[^}]*\} from '@\/lib\/(db\/document-filters|data\/document-populations)'/;

/** Purge scripts whose predicates could otherwise match unrouted corpus rows. */
const PURGE_SCRIPTS_GUARDING_CORPUS = [
  'lib/cron/purge-crec-noise.ts',
  'lib/cron/purge-legiscan-noise.ts',
];

/** The corpus exclusion as raw-SQL builders spell it. */
const CORPUS_EXCLUSION = 'category <> ${CORPUS_CATEGORY}';

/**
 * Negative-control rate queries (#907): each Pass-1 flag-rate denominator
 * over `documents` excludes the corpus pseudo-category, and nothing more —
 * the NC baselines were computed over a population that keeps
 * `retrieval_relevant = false` rows, so the narrow exclusion is the only
 * one allowed. One entry per denominator query in the file.
 */
const RATE_QUERY_FILES_EXCLUDING_CORPUS: Array<{ file: string; denominators: number }> = [
  { file: 'lib/services/event-validation-queries.ts', denominators: 3 },
];

function countOccurrences(src: string, needle: string): number {
  return src.split(needle).length - 1;
}

// Drop line and block comments so prose that names the pseudo-category
// (JSDoc, rationale) does not count as a code literal.
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
}

/** A single- or double-quoted 'corpus' string token (backticked prose excluded). */
const CORPUS_STRING_LITERAL = /'corpus'|"corpus"/;

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (name === 'node_modules' || name === '.next') continue;
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.(ts|tsx)$/.test(name)) out.push(full);
  }
  return out;
}

describe('search surfaces use the searchable population', () => {
  it.each(SEARCH_FILES_WITH_PREDICATE)('%s filters on searchable()', (file) => {
    const src = read(file);
    expect(
      SEARCHABLE_MARKERS.some((m) => src.includes(m)),
      `${file} lacks searchable`,
    ).toBe(true);
  });

  it.each([...SEARCH_FILES_WITH_PREDICATE, ...SEARCH_FILES_CONSUMING_PREDICATE])(
    '%s never filters on the analysis predicate',
    (file) => {
      const src = read(file);
      for (const predicate of ANALYSIS_PREDICATES) {
        expect(src.includes(predicate), `${file} contains ${predicate}`).toBe(false);
      }
    },
  );
});

describe('analysis surfaces use the counting or evidence population', () => {
  it.each(ANALYSIS_FILES)('%s filters on the analysis predicate', (file) => {
    const src = read(file);
    expect(
      ANALYSIS_PREDICATES.some((p) => src.includes(p)),
      `${file} lacks an analysis predicate`,
    ).toBe(true);
  });

  it.each(ANALYSIS_FILES)('%s never calls searchable()', (file) => {
    const src = read(file);
    expect(src.includes('searchable(')).toBe(false);
    expect(src.includes('searchableD(')).toBe(false);
    expect(src.includes('searchableSql(')).toBe(false);
  });
});

describe('the corpus pseudo-category', () => {
  it("is spelled 'corpus' only where the literal is declared or checked", () => {
    const offenders = ['lib', 'pages', 'scripts', 'components']
      .flatMap((d) => walk(join(REPO_ROOT, d)))
      .map((f) => f.slice(REPO_ROOT.length + 1))
      .filter((rel) => !CORPUS_LITERAL_ALLOWED.has(rel))
      .filter((rel) => CORPUS_STRING_LITERAL.test(stripComments(read(rel))));
    expect(offenders).toEqual([]);
  });

  it.each(PURGE_SCRIPTS_GUARDING_CORPUS)(
    '%s guards every predicate with CORPUS_CATEGORY',
    (file) => {
      const src = read(file);
      expect(src).toMatch(CORPUS_IMPORT);
      expect(src).toContain(CORPUS_EXCLUSION);
    },
  );

  it.each(RATE_QUERY_FILES_EXCLUDING_CORPUS)(
    '$file excludes corpus from every rate denominator, and only corpus',
    ({ file, denominators }) => {
      const src = stripComments(read(file));
      expect(src).toMatch(CORPUS_IMPORT);
      expect(countOccurrences(src, CORPUS_EXCLUSION)).toBe(denominators);
      expect(src.includes('routedOnlyD(')).toBe(false);
      expect(src.includes('retrieval_relevant')).toBe(false);
    },
  );
});
