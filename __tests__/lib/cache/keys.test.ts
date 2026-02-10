import { describe, it, expect } from 'vitest';
import { CacheKeys } from '@/lib/cache/keys';

describe('CacheKeys', () => {
  it('generates proxy key with URL', () => {
    expect(CacheKeys.proxy('https://example.com/feed')).toBe('proxy:https://example.com/feed');
  });

  it('generates federal register key', () => {
    expect(CacheKeys.federalRegister('executive_orders')).toBe('fr:executive_orders');
  });

  it('generates scrape tracker key', () => {
    expect(CacheKeys.scrapeTracker('gao')).toBe('scrape:gao');
  });

  it('generates assessment key', () => {
    expect(CacheKeys.assessment('civilService')).toBe('assess:civilService');
  });

  it('generates digest key with date', () => {
    expect(CacheKeys.digest('2026-01-15')).toBe('digest:2026-01-15');
  });

  it('generates uptime key with hostname', () => {
    expect(CacheKeys.uptime('api.example.com')).toBe('uptime:api.example.com');
  });

  it('generates uptime status key', () => {
    expect(CacheKeys.uptimeStatus()).toBe('uptime:status');
  });

  it('generates fallback key', () => {
    expect(CacheKeys.fallback('courts')).toBe('fallback:courts');
  });

  it('generates embedding key with numeric ID', () => {
    expect(CacheKeys.embedding(42)).toBe('emb:42');
  });

  it('generates retrieval key with category and hash', () => {
    expect(CacheKeys.retrieval('fiscal', 'abc123')).toBe('rag:fiscal:abc123');
  });
});
