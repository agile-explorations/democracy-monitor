export const CacheKeys = {
  proxy: (url: string) => `proxy:${url}`,
  federalRegister: (queryKey: string) => `fr:${queryKey}`,
  scrapeTracker: (source: string) => `scrape:${source}`,
  assessment: (category: string) => `assess:${category}`,
  digest: (date: string) => `digest:${date}`,
} as const;
