export const CacheKeys = {
  proxy: (url: string) => `proxy:${url}`,
  federalRegister: (queryKey: string) => `fr:${queryKey}`,
  scrapeTracker: (source: string) => `scrape:${source}`,
  assessment: (category: string) => `assess:${category}`,
  digest: (date: string) => `digest:${date}`,
  uptime: (hostname: string) => `uptime:${hostname}`,
  uptimeStatus: () => 'uptime:status',
  fallback: (category: string) => `fallback:${category}`,
  embedding: (docId: number) => `emb:${docId}`,
  retrieval: (category: string, queryHash: string) => `rag:${category}:${queryHash}`,
  courtlistener: (queryKey: string) => `cl:${queryKey}`,
  doj: (queryKey: string) => `doj:${queryKey}`,
  govinfo: (queryKey: string) => `gi:${queryKey}`,
  fec: (queryKey: string) => `fec:${queryKey}`,
  searchResearch: (queryHash: string) => `search:research:${queryHash}:v2`,
  /** docsOnly research responses (#705): doc lists are stable within a data
   *  week; refreshed by the Monday pre-warm (&refresh=true bypass). */
  searchResearchDocs: (keyHash: string) => `search:rdocs:${keyHash}:v2`,
  /** Search-query embeddings (#722), keyed by normalized-text hash — saves a
   *  provider round-trip per cold search. Query text only, never documents. */
  queryEmbedding: (textHash: string) => `search:qemb:${textHash}:v1`,
  /** LLM alias proposals for hybrid retrieval (#702), keyed by query hash. */
  queryExpansion: (queryHash: string) => `search:qexp:${queryHash}:v1`,
  /** Corpus-validated aliases, keyed by (query, window) hash. */
  queryExpansionValidated: (keyHash: string) => `search:qexpv:${keyHash}:v2`,
  /** Complete alias-arm results (#729), keyed by (kind, data week, filter
   *  params, phrase) — aliases recur across differently-worded queries. */
  searchArm: (kind: string, week: string, paramsHash: string, phraseHash: string) =>
    `search:arm:${kind}:${week}:${paramsHash}:${phraseHash}:v1`,
  /** In-flight docsOnly build marker (#729) — coalesces retries/concurrent
   *  identical searches into one build via 202 wait-poll. */
  searchInflight: (docsHash: string) => `search:inflight:${docsHash}:v1`,
  /** Global uncached-build slots (#729 DOS hardening): caps CONCURRENT
   *  distinct builds server-wide; excess wait-polls via 202. */
  searchBuildSlot: (slot: number) => `search:buildslot:${slot}:v1`,
  documentCount: () => 'stats:doc-count:v4',
  validateGraph: () => 'health:validate-graph:v1',
  validateGraphLive: () => 'health:validate-graph:live:v1',
  validateData: () => 'health:validate-data:v1',
  reportRefresh: () => 'health:report-refresh:status',
  /** CourtListener docket-timeline proxy payloads (namespace case:, distinct from cl:). */
  caseTimeline: (docketId: string | number) => `case:timeline:${docketId}:v1`,
  /** tracked_cases category listing pages. */
  categoryCases: (category: string, status: string, page: number) =>
    `case:list:${category}:${status}:${page}:v2`,
  themeLabel: (category: string, week: string) => `theme-label:${category}:${week}`,
} as const;
