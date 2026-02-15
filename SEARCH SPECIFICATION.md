# Democracy Monitor — Document Search Specification

## Document Purpose

This specification describes search capabilities built on top of the existing document corpus with embeddings (pgvector, 1536-dimensional). It is designed as an addendum to the UI Design Specification V3 and follows the same conventions (reading level toggle, four-layer depth model, ASCII wireframes).

Route: `/search`

Added to the top navigation bar between "P2025" and "Health."

---

## 1. Two Audiences, Two Modes

The search page serves two distinct workflows through a single interface that adapts based on how the user interacts with it.

### 1.1 Research Mode (Default)

**Audience**: Journalists, democracy academics, engaged citizens.

**Core question**: "What has the government actually done about X?"

The user types a natural language question. The system retrieves the most relevant government documents via semantic search, then synthesizes an answer grounded in the documentary record. Every claim in the answer links to the specific document(s) that support it.

**Why this matters**: Journalists can ask "Has the administration taken steps to reduce inspector general independence?" and get an answer citing specific Federal Register documents, executive orders, and policy actions — grounded in the actual government record. News coverage from the GDELT media corpus is shown alongside as context, but the synthesized answer is built from government documents only. This separation is the system's core value proposition: what the government _did_ vs. what was _reported about it_.

### 1.2 Explore Mode

**Audience**: Developers, methodology contributors, analysts.

**Core question**: "Show me the raw data — what did the system see and how did it score it?"

The user enters keywords, filters by category/date/score/document class, and browses the scored document corpus directly. Results show scoring details: which keywords matched, which were suppressed, the severity score, the document class multiplier, and the AI reviewer's assessment.

**Why this matters**: Contributors can find edge cases ("show me all documents in `civilService` that scored above 8 but the AI downgraded"), verify scoring decisions, and identify systematic false positives.

---

## 2. Page Structure

The page has a single search input at the top. Below it, a mode toggle determines how results are displayed. The mode toggle persists via localStorage.

```
┌─────────────────────────────────────────────────────────────┐
│  Search the Documentary Record                              │
│                                                             │
│  ┌───────────────────────────────────────────────────┐  🔍  │
│  │  What has the government done about...            │      │
│  └───────────────────────────────────────────────────┘      │
│                                                             │
│  Mode: [● Research | ○ Explore]                             │
│                                                             │
│  ─────────────────────────────────────────────────────────  │
│                                                             │
│  (results area — varies by mode)                            │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

**Search input behavior**:

- In Research mode: placeholder is "Ask a question about the government record..." Submit triggers semantic search + RAG synthesis.
- In Explore mode: placeholder is "Search documents by keyword, title, or content..." Submit triggers combined keyword + semantic search with filters visible.

---

## 3. Research Mode — "Ask the Record"

### 3.1 How It Works (Backend)

1. User submits a natural language question
2. System embeds the question using the same model as document embeddings (text-embedding-3-small or equivalent)
3. pgvector cosine similarity search against `documents.embedding`, returning top 20 candidates **filtered to government sources only** (`source_type NOT IN ('gdelt', 'news')`)
4. Candidates are re-ranked by relevance (cosine similarity × recency boost for time-sensitive queries)
5. Top 8–12 government documents are sent to the LLM with the user's question and a grounding prompt
6. LLM generates an answer where every factual claim cites specific documents by title and URL
7. The full list of retrieved government documents is shown below the answer
8. **Separately**, a second vector search runs against news/GDELT documents for the same query, returning top 5–8 news articles. These are displayed in a "News Coverage" panel below the government document list — they are _not_ sent to the LLM for synthesis

**Grounding prompt** (for the LLM synthesis step):

```
You are answering a question about U.S. government actions based solely
on the documents provided below. These are real government documents from
the Federal Register and other official sources.

Rules:
1. Only make claims supported by the provided documents
2. Cite each claim with [Doc N] where N matches the document number below
3. If the documents don't contain enough information to answer, say so
4. Note the date range of available documents — the user should know
   what time period the answer covers
5. If documents suggest conflicting actions, present both
6. Do not editorialize or assess democratic health — present what the
   documents show
```

**API endpoint**: `GET /api/search?q={query}&mode=research`

Response includes:

- `answer`: The synthesized text with document citations (government sources only)
- `documents`: Array of retrieved government documents with scores, metadata, and relevance ranking
- `relatedNews`: Array of news/GDELT articles matching the same query (not used in synthesis)
- `dateRange`: { earliest, latest } of retrieved government documents
- `confidence`: How well the retrieved documents match the query (average cosine similarity of top results)

### 3.2 Research Mode Results

```
┌─────────────────────────────────────────────────────────────┐
│  Search the Documentary Record                              │
│                                                             │
│  ┌───────────────────────────────────────────────────┐  🔍  │
│  │  Has the administration reduced IG independence?  │      │
│  └───────────────────────────────────────────────────┘      │
│                                                             │
│  Mode: [● Research | ○ Explore]                             │
│                                                             │
│  ─────────────────────────────────────────────────────────  │
│                                                             │
│  ANSWER  ·  Based on 9 government documents                 │
│          ·  Jan 2025 – Feb 2026                             │
│                                                             │
│  Several documents indicate changes to inspector general    │
│  authority and independence. An executive order issued on    │
│  January 24, 2025 [1] removed inspectors general from      │
│  multiple federal agencies simultaneously. A subsequent     │
│  Federal Register notice [3] restructured reporting         │
│  requirements for remaining IGs, directing reports through  │
│  agency heads rather than directly to Congress.             │
│                                                             │
│  No documents were found reversing or moderating these      │
│  changes. A GAO report [7] noted the removals but did not  │
│  assess their legality.                                     │
│                                                             │
│  ─────────────────────────────────────────────────────────  │
│                                                             │
│  GOVERNMENT RECORD (9 results, ranked by relevance)         │
│  These are official government documents — the basis for    │
│  the answer above.                                          │
│                                                             │
│  [1] ██ 0.94  Executive Order: Accountability for IGs      │
│      Jan 24, 2025 · executiveActions · Score: 14.2          │
│      📄 Federal Register                                    │
│      "...removal of inspectors general who have failed..."  │
│      → federalregister.gov/documents/2025/01/24/...         │
│                                                             │
│  [2] ██ 0.91  Personnel Actions: Office of Inspector Gen.  │
│      Feb 3, 2025 · civilService · Score: 11.7               │
│      📄 Federal Register                                    │
│      "...positions reclassified under Schedule F..."        │
│      → federalregister.gov/documents/2025/02/03/...         │
│                                                             │
│  [3] ██ 0.87  IG Reporting Requirements Amendment          │
│      Feb 18, 2025 · igs · Score: 9.3                        │
│      📄 Federal Register                                    │
│      "...quarterly reports submitted to agency head..."     │
│      → federalregister.gov/documents/2025/02/18/...         │
│                                                             │
│  ... (6 more)                                               │
│  [Show all 9 documents]                                     │
│                                                             │
│  ─────────────────────────────────────────────────────────  │
│                                                             │
│  NEWS COVERAGE (5 articles)                                 │
│  Media reporting on the same topic — not used in the        │
│  answer above. Provides public narrative context.           │
│                                                             │
│  ██ 0.91  "Mass IG Firing Raises Alarm Among Oversight      │
│           Experts"                                          │
│      Jan 25, 2025 · 📰 Washington Post                      │
│      "...unprecedented removal of multiple inspectors..."   │
│      → washingtonpost.com/politics/2025/01/25/...           │
│                                                             │
│  ██ 0.88  "What the IG Removals Mean for Government         │
│           Accountability"                                   │
│      Jan 27, 2025 · 📰 ProPublica                           │
│      "...the offices that investigate waste, fraud..."      │
│      → propublica.org/article/inspector-general-...         │
│                                                             │
│  ██ 0.83  "Administration Defends IG Restructuring as       │
│           'Long Overdue Reform'"                            │
│      Feb 5, 2025 · 📰 Fox News                              │
│      "...officials argue the changes improve efficiency..." │
│      → foxnews.com/politics/ig-reform-...                   │
│                                                             │
│  ... (2 more)                                               │
│  [Show all 5 articles]                                      │
│                                                             │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  RELATED QUESTIONS                                          │
│  · What oversight mechanisms remain for removed IGs?        │
│  · Has Congress responded to IG restructuring?              │
│  · How does this compare to prior IG changes?               │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### 3.3 Research Mode Design Notes

**Relevance bar**: The `██` bar next to each document number is a visual indicator of cosine similarity (0.0–1.0 scale). Higher similarity = longer/darker bar. This helps users see how closely each document matched their query without needing to understand the number.

**Cross-category results**: Research mode searches across ALL categories by default. The category badge on each result (e.g., `executiveActions`, `civilService`, `igs`) shows which category scored the document. This is a feature, not a bug — a question about IG independence should surface documents from `igs`, `civilService`, and `executiveActions` if they're all relevant.

**Date range caveat**: Always displayed. Users must know what time period the answer covers. If the corpus only goes back to January 2025, an answer about "historical IG changes" would be misleading without this context.

**Source limitation caveat**: The synthesized answer is grounded exclusively in government documents. The News Coverage panel provides media context but is explicitly separated. If the system lacks court filings, congressional testimony, or other non-news external sources (Phase 11 alternative sources), a note appears: "Court filings and congressional records are not yet included in this search."

**Record vs. Coverage — the core design principle**: The government record and news coverage are two different lenses on the same events. A Federal Register document says "we are doing X." A news article says "the administration is doing X, and here's the context, the reaction, and what critics say." Showing them together gives the user something neither source provides alone. But they must be visually and structurally separated:

- The synthesized answer is built from government documents only — this is the system's unique value
- Government documents are labeled with 📄 and listed first under "GOVERNMENT RECORD"
- News articles are labeled with 📰 and listed separately under "NEWS COVERAGE"
- The News Coverage panel explicitly states: "not used in the answer above"
- The LLM never sees news articles during synthesis — they cannot influence the answer

This separation preserves the system's core credibility claim ("we analyze the documentary record itself") while giving users the richer context they need.

**Related questions**: Generated by the LLM as part of the synthesis step. These are follow-up queries the user might want to explore. Clicking one submits it as a new search. Limit to 3.

**No answer is a valid answer**: If the retrieved documents don't contain enough information to answer the question, the system should say so explicitly: "The documentary record in our corpus does not contain enough information to answer this question. This may mean the topic is not reflected in Federal Register publications, or that relevant documents fall outside our current date range."

### 3.4 Research Mode — Detailed View Additions

In Detailed mode (reading level toggle), each source document in the results list expands to show:

```
┌─────────────────────────────────────────────────────────────┐
│  [1] ██ 0.94  Executive Order: Accountability for IGs      │
│      Jan 24, 2025 · executiveActions · Score: 14.2          │
│                                                             │
│      Matched keywords: IG removal (capture), inspector      │
│        general independence (drift), accountability (warn)  │
│      Suppressed: oversight (routine governance context)     │
│      Document class: executive_order × 1.5                  │
│      AI reviewer: Confirmed Drift (confidence 0.88)         │
│                                                             │
│      "...removal of inspectors general who have failed      │
│      to meet performance standards established by the       │
│      administration..."                                     │
│      → federalregister.gov/documents/2025/01/24/...         │
└─────────────────────────────────────────────────────────────┘
```

This lets developers verify: "Did the system score this document correctly? Were the right keywords matched? Was the AI reviewer's assessment reasonable?"

---

## 4. Explore Mode — "Show Me the Data"

### 4.1 How It Works (Backend)

Explore mode combines traditional keyword/filter search with semantic similarity. The user can:

1. **Text search**: Full-text search against document titles and content (PostgreSQL `tsvector` or `ILIKE`)
2. **Semantic search**: If the query is more than 3 words, also run embedding similarity search and merge results
3. **Filter**: Category, date range, document class, score range, keyword tier, AI agreement/disagreement
4. **Sort**: By date, by score, by relevance (cosine similarity), by AI confidence

**API endpoint**: `GET /api/search?q={query}&mode=explore&category=...&source=...&dateFrom=...&dateTo=...&scoreMin=...&scoreMax=...&class=...&sort=...`

### 4.2 Explore Mode Results

```
┌─────────────────────────────────────────────────────────────┐
│  Search the Documentary Record                              │
│                                                             │
│  ┌───────────────────────────────────────────────────┐  🔍  │
│  │  schedule F reclassification                      │      │
│  └───────────────────────────────────────────────────┘      │
│                                                             │
│  Mode: [○ Research | ● Explore]                             │
│                                                             │
│  ─────────────────────────────────────────────────────────  │
│                                                             │
│  FILTERS                                                    │
│  Category: [All ▾]   Date: [2025-01-20] to [2026-02-12]    │
│  Score: [0] to [any]   Class: [All ▾]                       │
│  Source: [All ▾ | 📄 Government | 📰 News]                  │
│  Show only: □ AI disagreements  □ Capture-tier matches      │
│             □ Suppressed matches  □ Unembedded docs         │
│                                                             │
│  ─────────────────────────────────────────────────────────  │
│                                                             │
│  243 results · sorted by [Relevance ▾]                      │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐    │
│  │  Personnel Actions: Schedule F Implementation       │    │
│  │  Feb 10, 2025 · civilService · executive_order      │    │
│  │  📄 Federal Register                                │    │
│  │                                                     │    │
│  │  Score: 16.8  ·  Matches: 3C · 4D · 2W             │    │
│  │  Suppressed: 1 (routine governance)                 │    │
│  │  AI: Confirmed Capture (0.91)                       │    │
│  │  Keywords: ✚schedule F ✚reclassification            │    │
│  │            ✚political appointment  ◆merit system    │    │
│  │            ◆career protection  ○oversight            │    │
│  │                                                     │    │
│  │  "...reclassification of positions of a confidential│    │
│  │  policy-determining, policy-making, or policy-      │    │
│  │  advocating character..."                           │    │
│  │  → federalregister.gov/documents/2025/02/10/...     │    │
│  └─────────────────────────────────────────────────────┘    │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐    │
│  │  Civil Service Reform: Excepted Service Expansion   │    │
│  │  Mar 1, 2025 · civilService · final_rule            │    │
│  │  📄 Federal Register                                │    │
│  │                                                     │    │
│  │  Score: 12.4  ·  Matches: 2C · 3D · 1W             │    │
│  │  Suppressed: 0                                      │    │
│  │  AI: Downgraded to Drift (0.74) ⚠                   │    │
│  │  Keywords: ✚schedule F  ◆excepted service           │    │
│  │            ◆merit system  ○civil service reform      │    │
│  │                                                     │    │
│  │  "...expansion of excepted service categories to    │    │
│  │  include positions previously under competitive..."  │    │
│  │  → federalregister.gov/documents/2025/03/01/...     │    │
│  └─────────────────────────────────────────────────────┘    │
│                                                             │
│  ... (241 more results)                                     │
│                                                             │
├─────────────────────────────────────────────────────────────┤
│  Export: [CSV ↓]  [JSON ↓]                                  │
└─────────────────────────────────────────────────────────────┘
```

### 4.3 Explore Mode Design Notes

**Keyword tier indicators**: `✚` = capture (most severe), `◆` = drift, `○` = warning. Suppressed keywords shown with strikethrough in Detailed mode. These are compact enough to scan quickly but informative enough that a developer can immediately see the scoring breakdown.

**Source type filter**: The corpus includes both government documents (Federal Register, GAO, White House) and news articles (GDELT media coverage). The source filter lets users focus on one or the other, or see both interleaved. Each result card shows a source badge: 📄 for government documents, 📰 for news articles. News articles go through the same keyword scoring pipeline as government documents — the source filter is purely about provenance, not methodology. For methodology investigators, comparing how the system scores a government announcement vs. news coverage of the same event is a useful diagnostic.

**AI disagreement filter**: The most valuable filter for methodology investigation. "Show me only documents where the AI reviewer disagreed with the keyword engine." This surfaces the exact edge cases where the methodology might need adjustment. Documents where the AI downgraded are marked with `⚠`.

**"Suppressed matches" filter**: Shows documents where keywords matched but suppression rules fired. Useful for verifying that suppression rules aren't hiding genuine signals.

**"Unembedded docs" filter**: A developer/admin tool — shows documents that failed embedding (API error, content too long, etc.) so the corpus can be repaired.

**Score range filter**: Lets developers investigate threshold effects. "Show me everything in `courts` that scored between 5 and 8" — the ambiguous middle range where the difference between Stable and Drift is most uncertain.

**Export**: Both CSV and JSON. Includes all scoring metadata (matched keywords, suppressed keywords, AI assessment, document class, multiplier). Follows the export conventions from UI spec §12.

### 4.4 Explore Mode — Find Similar Documents

Each document result card has a "Find similar →" link. Clicking it runs a vector similarity search using that document's embedding as the query, returning the most semantically similar documents across the entire corpus.

```
┌─────────────────────────────────────────────────────────────┐
│  Documents similar to:                                      │
│  "Personnel Actions: Schedule F Implementation"             │
│  (Feb 10, 2025 · civilService)                              │
│                                                             │
│  ─────────────────────────────────────────────────────────  │
│                                                             │
│  Same category (civilService):                              │
│  ██ 0.93  Civil Service Reform: Excepted Service Expansion  │
│  ██ 0.89  OPM Guidance: Position Reclassification Criteria  │
│  ██ 0.84  Merit Systems Protection Board: Reduced Scope     │
│                                                             │
│  Other categories:                                          │
│  ██ 0.81  Executive Order: Accountability for IGs           │
│           (igs)                                             │
│  ██ 0.78  Agency Reorganization: HHS Workforce Reduction    │
│           (executiveActions)                                 │
│  ██ 0.72  DOJ Personnel Reassignment Directive              │
│           (courts)                                          │
│                                                             │
│  [← Back to search results]                                 │
└─────────────────────────────────────────────────────────────┘
```

**Why this matters**: Cross-category similarity reveals when related actions are happening across multiple institutional domains simultaneously. A Schedule F reclassification in `civilService` that's semantically similar to an IG removal order in `igs` and a DOJ reassignment in `courts` is a convergence signal — the kind of pattern the infrastructure convergence analysis is designed to catch, but surfaced here through direct exploration.

The results split into "Same category" and "Other categories" to make cross-category patterns immediately visible.

---

## 5. Shared Features (Both Modes)

### 5.1 P2025 Proximity Indicator

When a document has matches in the `p2025_matches` table (cosine similarity ≥ 0.75 to any P2025 proposal), show a small badge on the result card:

```
  │  Score: 16.8  ·  Matches: 3C · 4D · 2W                │
  │  P2025: Similar to "Reclassify federal employees" (0.89)│
```

This links the document to the specific P2025 proposal it resembles. Clicking the P2025 badge navigates to the P2025 comparison page filtered to that proposal.

Available in both Research and Explore modes. In Research mode, the synthesized answer can note: "Several of the retrieved documents align with Project 2025 proposals on civil service reform [1, 2, 5]."

### 5.2 Rhetoric-Action Link

When a document matches keywords from a policy area tracked in the `intent_statements` table, and rhetoric on that topic preceded the document by 1–8 weeks, show:

```
  │  Rhetoric trail: Administration discussed "Schedule F"   │
  │  in 3 briefings starting Jan 28, 2025 (13 days prior)   │
```

This connects the documentary record to the rhetoric→action pipeline. Available in both modes, Detailed view only.

### 5.3 Temporal Context Bar

Above the results in both modes, a small timeline visualization shows the density of results over time:

```
  Results over time:
  Jan ▁▂▅▇██▅▃▂▁ Feb ▁▁▂▃▅▃▂▁▁▁ Mar ▁▁▁▂▂▁▁▁▁▁ Apr
         ↑ spike week of Feb 3
```

This immediately shows whether results are concentrated in a specific period (suggesting a policy event) or spread evenly (suggesting ongoing activity). The spike annotation is auto-generated when any week has 2× the average result count.

### 5.4 Search History (localStorage)

Recent searches are stored locally (not server-side) and shown as suggestions when the search field is focused. Maximum 20 entries. Cleared via a "Clear history" link.

```
  Recent searches:
  · Has the administration reduced IG independence?
  · schedule F reclassification
  · FOIA denial rates 2025
  · documents similar to "Executive Order 14201"
```

### 5.5 Shareable URLs

Every search state is encoded in the URL:

- `/search?q=IG+independence&mode=research`
- `/search?q=schedule+F&mode=explore&category=civilService&dateFrom=2025-01-20&sort=score`
- `/search?q=IG+removals&mode=explore&source=news` (news articles only)

Journalists can share specific searches. Developers can link to specific filter combinations in bug reports or methodology discussions.

---

## 6. Mobile Behavior

- Search input is full-width
- Mode toggle is full-width below the input
- Filters in Explore mode collapse into a "Filters" button that opens a bottom sheet
- Document result cards stack vertically, full-width
- "Find similar" is available via a "⋯" overflow menu on each card
- Export buttons move to the overflow menu
- Temporal context bar is hidden on mobile (not enough horizontal space for meaningful visualization)

---

## 7. API Endpoints

| Endpoint                           | Method | Description                                        |
| ---------------------------------- | ------ | -------------------------------------------------- |
| `/api/search`                      | GET    | Unified search — `mode=research` or `mode=explore` |
| `/api/search/similar/[documentId]` | GET    | Find documents similar to a specific document      |
| `/api/search/embed`                | POST   | Embed a query string (internal, used by search)    |

### 7.1 Research Mode Response

```typescript
interface ResearchSearchResponse {
  answer: string; // LLM-synthesized answer with [N] citations
  // (grounded in government documents only)
  documents: Array<{
    id: number;
    citationIndex: number; // [1], [2], etc. as used in answer
    title: string;
    url: string;
    publishedAt: string;
    sourceType: string; // 'federal_register', 'gao', 'whitehouse', etc.
    category: string;
    documentClass: string;
    finalScore: number;
    cosineSimilarity: number;
    snippet: string; // ~200 char excerpt most relevant to query
    p2025Match?: {
      proposalId: string;
      proposalSummary: string;
      similarity: number;
    };
    rhetoricTrail?: {
      policyArea: string;
      statementCount: number;
      earliestStatement: string;
      lagDays: number;
    };
  }>;
  relatedNews: Array<{
    id: number;
    title: string;
    url: string;
    publishedAt: string;
    sourceType: string; // 'gdelt', 'news'
    sourceName: string; // 'Washington Post', 'ProPublica', etc.
    cosineSimilarity: number;
    snippet: string;
  }>;
  dateRange: { earliest: string; latest: string };
  queryConfidence: number; // avg cosine similarity of top results
  relatedQuestions: string[]; // max 3
}
```

### 7.2 Explore Mode Response

```typescript
interface ExploreSearchResponse {
  totalResults: number;
  page: number;
  pageSize: number; // default 20
  documents: Array<{
    id: number;
    title: string;
    url: string;
    publishedAt: string;
    sourceType: string; // 'federal_register', 'gao', 'gdelt', etc.
    sourceName?: string; // for news: 'Washington Post', etc.
    category: string;
    documentClass: string;

    // Scoring details
    severityScore: number;
    finalScore: number;
    classMultiplier: number;
    captureCount: number;
    driftCount: number;
    warningCount: number;
    suppressedCount: number;
    matchedKeywords: Array<{
      keyword: string;
      tier: 'capture' | 'drift' | 'warning';
    }>;
    suppressedKeywords: Array<{
      keyword: string;
      rule: string;
      reason: string;
    }>;

    // AI assessment
    aiRecommendedStatus: string;
    aiConfidence: number;
    aiAgreesWithKeywords: boolean;

    // Similarity (if semantic search was used)
    cosineSimilarity?: number;

    // Cross-references
    p2025Match?: { proposalId: string; similarity: number };
    rhetoricTrail?: { policyArea: string; lagDays: number };

    snippet: string;
  }>;
}
```

---

## 8. Implementation Notes

### 8.1 pgvector Query Performance

The `documents` table with 1536-dimensional embeddings needs an IVFFlat or HNSW index for acceptable query performance at scale:

```sql
-- HNSW index (preferred — better recall, slightly more memory)
CREATE INDEX idx_documents_embedding_hnsw
  ON documents USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);
```

At the current corpus size (thousands of documents), brute-force cosine similarity may be fast enough. The HNSW index becomes necessary above ~50K documents. Add it proactively — the index build is a one-time cost.

### 8.2 Rate Limiting

Research mode involves an LLM call per query, which has cost implications:

- Research mode: 5 queries per minute per IP, 50 per hour
- Explore mode: 20 queries per minute per IP (no LLM cost)
- Similar document search: 10 per minute per IP

Display a clear message when rate-limited: "To keep this service free, we limit searches to N per hour. Your limit resets at HH:MM."

### 8.3 Cost Management

Research mode LLM synthesis is the primary cost driver. Mitigation strategies:

1. **Cache common queries**: Hash the query + date range, cache the synthesized answer for 24 hours. Many users will ask similar questions.
2. **Limit context window**: Send top 8 documents to the LLM, not all 20 retrieved. The remaining 12 are shown in the source list but not synthesized over.
3. **Use Haiku for synthesis**: The synthesis task (summarize these documents to answer a question) doesn't require Opus-level reasoning. Sonnet or Haiku with good grounding prompts will produce comparable results at lower cost.
4. **Degrade gracefully**: If the LLM budget is exhausted, fall back to Explore mode with a message: "AI-assisted answers are temporarily unavailable. Showing document results only."

### 8.4 Embedding Compatibility

The search query must be embedded with the same model used for document embeddings. If the model changes (e.g., migrating from `text-embedding-3-small` to a future model), all document embeddings must be recomputed. Store the embedding model identifier in a config constant and validate it matches at query time.

### 8.5 Content Snippets

Snippets for search results should be generated at query time, not stored. For semantic search, extract the ~200 character window of the document content that has the highest token overlap with the query. For keyword search, highlight the matched keyword in context. If the document has no `content` field (only title + metadata), use the title as the snippet.

---

## 9. Backend Dependencies

| Feature                  | Requires                                     | Status                                           |
| ------------------------ | -------------------------------------------- | ------------------------------------------------ |
| Semantic search          | `documents.embedding` column populated       | Exists (migration 0005)                          |
| Document scoring details | `document_scores` table                      | Exists (migration 0007)                          |
| P2025 proximity          | `p2025_matches` table                        | Exists (migration 0010)                          |
| Rhetoric trail           | `intent_statements` + `intent_weekly` tables | Exists (migrations 0002, 0009)                   |
| Baseline centroids       | `baselines.embedding_centroid` column        | Exists (migration 0008)                          |
| Full-text search index   | `tsvector` on documents.title + content      | **New — needs migration**                        |
| HNSW vector index        | Index on documents.embedding                 | **New — needs migration**                        |
| Search query cache       | Cache table or Redis                         | **New** (can use existing `cache_entries` table) |

### 9.1 New Migration: Full-Text Search + Vector Index

```sql
-- Full-text search support
ALTER TABLE documents ADD COLUMN IF NOT EXISTS search_vector tsvector
  GENERATED ALWAYS AS (
    setweight(to_tsvector('english', coalesce(title, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(content, '')), 'B')
  ) STORED;

CREATE INDEX idx_documents_search_vector ON documents USING gin (search_vector);

-- HNSW vector index for semantic search
CREATE INDEX idx_documents_embedding_hnsw
  ON documents USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);
```

---

## 10. Sprint Estimate

This feature spans two sprints, targeting 250–350 lines each:

### Sprint L (Search Infrastructure + Explore Mode)

1. Full-text search migration (tsvector + HNSW index)
2. Search service — `lib/services/search-service.ts` (embedding, similarity search, keyword search, filter/sort)
3. Explore mode API endpoint — `/api/search?mode=explore`
4. "Find similar" endpoint — `/api/search/similar/[documentId]`
5. Search page UI — input, mode toggle, Explore mode results with filters

**Deliverable**: Developers can search the document corpus with full scoring details, filter by category/date/score/class, find similar documents across categories, and export results.

### Sprint M (Research Mode + Cross-References)

1. RAG synthesis service — `lib/services/research-service.ts` (query embedding, retrieval, re-ranking, LLM grounding prompt, answer generation)
2. Research mode API endpoint — `/api/search?mode=research`
3. Research mode UI — synthesized answer with citations, source document list, related questions
4. P2025 proximity badges and rhetoric trail indicators (both modes)
5. Temporal context bar
6. Query caching (use existing `cache_entries` table)
7. Rate limiting middleware

**Deliverable**: Journalists and academics can ask natural language questions and get grounded answers citing specific government documents. Cross-references to P2025 proposals and rhetoric trail are visible on all search results.

---

## 11. What This Does NOT Include

- **Real-time document ingestion**: Search operates on the existing weekly-ingested corpus. Documents are not added to the search index in real-time.
- **User accounts or saved searches**: No server-side search history. Local storage only.
- **Collaborative annotations**: No ability to tag, bookmark, or comment on documents within the search interface. This could be a future feature for academic research teams.
- **News in synthesized answers**: News articles from the GDELT corpus appear in the News Coverage panel but are never used in the LLM-synthesized answer. The answer is grounded exclusively in government documents. This is a deliberate design choice, not a limitation.
- **Court filings and congressional record**: These are not in the corpus unless Phase 11 alternative sources have been implemented. The source limitation caveat makes this explicit when relevant.
- **Conversational follow-ups**: Each Research mode query is independent. There is no multi-turn conversation with the LLM. The "related questions" feature provides a lightweight alternative.
- **News source filtering by outlet**: The News Coverage panel shows all matching news articles ranked by relevance. There is no filter to show only articles from specific outlets (e.g., "only AP and Reuters"). This could be added if users request it, but the initial implementation keeps it simple.
