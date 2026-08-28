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
   *  week; refreshed by the Monday pre-warm (&refresh=true bypass).
   *  Mode-derived version (#758): analytical (and flag-off) requests keep
   *  the v1.10.1 v2 namespace so a flag-off deploy hits the existing warm
   *  caches — no deploy-day rebuild stampede; enumeration doc sets differ
   *  and get their own v3 namespace. */
  // v4/v5 (#744): matched-passage snippets skip mastheads; earlier
  // generations carried header text.
  searchResearchDocs: (keyHash: string, enumeration = false) =>
    `search:rdocs:${keyHash}:${enumeration ? 'v5' : 'v4'}`,
  /** Search-query embeddings (#722), keyed by normalized-text hash — saves a
   *  provider round-trip per cold search. Query text only, never documents. */
  queryEmbedding: (textHash: string) => `search:qemb:${textHash}:v1`,
  /** LLM alias proposals for hybrid retrieval (#702), keyed by query hash. */
  queryExpansion: (queryHash: string) => `search:qexp:${queryHash}:v1`,
  /** Corpus-validated aliases, keyed by (query, window) hash. */
  queryExpansionValidated: (keyHash: string) => `search:qexpv:${keyHash}:v2`,
  /** Shortlist-judge picks for enumeration questions (#758), keyed per
   *  (question, data week). */
  searchEntityJudge: (keyHash: string) => `search:qjudge:${keyHash}:v1`,
  /** Complete alias-arm results (#729), keyed by (kind, data week, filter
   *  params, phrase) — aliases recur across differently-worded queries. */
  searchArm: (kind: string, week: string, paramsHash: string, phraseHash: string) =>
    `search:arm:${kind}:${week}:${paramsHash}:${phraseHash}:v1`,
  /** Per-alias validation corpus-count (#729 follow-up): validation pays the
   *  same phrase-recheck cost the arms do, per NOVEL WORDING — this key is
   *  per alias, so recurring topics stop re-paying it. */
  searchAliasCount: (week: string, windowHash: string, phraseHash: string) =>
    `search:vcount:${week}:${windowHash}:${phraseHash}:v1`,
  /** Validation window-size count, keyed per (window, data week). */
  searchWindowTotal: (week: string, windowHash: string) => `search:vtotal:${week}:${windowHash}:v1`,
  /** In-flight docsOnly build marker (#729) — coalesces retries/concurrent
   *  identical searches into one build via 202 wait-poll. */
  searchInflight: (docsHash: string) => `search:inflight:${docsHash}:v1`,
  /** Global uncached-build slots (#729 DOS hardening): caps CONCURRENT
   *  distinct builds server-wide; excess wait-polls via 202. */
  searchBuildSlot: (slot: number) => `search:buildslot:${slot}:v1`,
  /** Per-source concurrent build/stream slots (#793): one pass or machine
   *  token cannot monopolize the global build slots. */
  searchSourceSlot: (kind: 'build' | 'stream', sourceId: string) =>
    `search:srcslot:${kind}:${sourceId}:v1`,
  /** Daily spend counters (#794): units are admitted builds and streams,
   *  per source and global, fixed UTC-day windows. */
  searchSpend: (unit: 'build' | 'stream', scopeId: string, day: string) =>
    `search:spend:${unit}:${scopeId}:${day}:v1`,
  /** Novel builds admitted this UTC hour (#794 alerting). */
  opsBuildsHour: (hour: string) => `ops:search:builds:${hour}:v1`,
  /** Alert cooldowns (#794): one alert per (unit, threshold, day) and one
   *  per hourly spike. */
  opsSpendAlert: (unit: 'build' | 'stream', level: string, day: string) =>
    `ops:spend-alert:${unit}:${level}:${day}:v1`,
  opsBuildSpikeAlert: () => 'ops:build-spike-alert-cooldown:v1',
  /** Existing ops cooldowns, registered here (#794) instead of inline. */
  opsSearchTimingAlert: () => 'ops:search-timing-alert-cooldown:v1',
  opsPrewarmMopup: () => 'ops:prewarm-mopup-cooldown:v1',
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
