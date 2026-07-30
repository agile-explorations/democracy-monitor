/** 10-minute TTL for feed and API proxy caches. */
export const FEED_CACHE_TTL_S = 600;

/** 30-minute TTL for intent assessment endpoint cache. */
export const INTENT_ASSESS_CACHE_TTL_S = 1800;

/** 1-hour TTL for scraper and intent data caches. */
export const SCRAPE_CACHE_TTL_S = 3600;

/** 6-hour TTL for AI-powered assessment caches. */
export const AI_CACHE_TTL_S = 6 * 60 * 60;

/** Maximum rows returned by export endpoints. */
export const MAX_EXPORT_ROWS = 10_000;
