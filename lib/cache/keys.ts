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
  searchResearch: (queryHash: string) => `search:research:${queryHash}`,
  documentCount: () => 'stats:doc-count:v4',
  validateGraph: () => 'health:validate-graph:v1',
  validateGraphLive: () => 'health:validate-graph:live:v1',
  validateData: () => 'health:validate-data:v1',
  reportRefresh: () => 'health:report-refresh:status',
  /** CourtListener docket-timeline proxy payloads (namespace case:, distinct from cl:). */
  caseTimeline: (docketId: string | number) => `case:timeline:${docketId}:v1`,
  /** tracked_cases category listing pages. */
  categoryCases: (category: string, status: string, page: number) =>
    `case:list:${category}:${status}:${page}:v1`,
  themeLabel: (category: string, week: string) => `theme-label:${category}:${week}`,
} as const;
