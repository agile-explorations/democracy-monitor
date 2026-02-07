export const CacheKeys = {
  proxy: (url: string) => `proxy:${url}`,
  federalRegister: (queryKey: string) => `fr:${queryKey}`,
  scrapeTracker: (source: string) => `scrape:${source}`,
  assessment: (category: string) => `assess:${category}`,
  digest: (date: string) => `digest:${date}`,
  uptime: (hostname: string) => `uptime:${hostname}`,
  uptimeStatus: () => 'uptime:status',
  fallback: (category: string) => `fallback:${category}`,
} as const;
