import { describe, it, expect } from 'vitest';
import { checkSiteDown } from '@/lib/services/suppression-detection';

describe('checkSiteDown', () => {
  it('returns null for less than 1 day down', async () => {
    await expect(checkSiteDown('example.gov', 0)).resolves.toBeNull();
    await expect(checkSiteDown('example.gov', 0.5)).resolves.toBeNull();
  });

  it('returns warning severity for 1 day down', async () => {
    const result = await checkSiteDown('example.gov', 1);
    expect(result).not.toBeNull();
    expect(result!.severity).toBe('warning');
    expect(result!.type).toBe('site_down');
    expect(result!.url).toBe('https://example.gov');
    expect(result!.message).toBe('example.gov has been down for 1 day');
  });

  it('returns warning severity for 2-6 days down', async () => {
    const result = await checkSiteDown('data.gov', 5);
    expect(result).not.toBeNull();
    expect(result!.severity).toBe('warning');
    expect(result!.message).toBe('data.gov has been down for 5 days');
  });

  it('returns drift severity for 7 days down', async () => {
    const result = await checkSiteDown('oversight.gov', 7);
    expect(result).not.toBeNull();
    expect(result!.severity).toBe('drift');
    expect(result!.message).toBe('oversight.gov has been down for 7 days');
  });

  it('returns drift severity for 29 days down', async () => {
    const result = await checkSiteDown('data.gov', 29);
    expect(result).not.toBeNull();
    expect(result!.severity).toBe('drift');
  });

  it('returns capture severity for 30+ days down', async () => {
    const result = await checkSiteDown('removed.gov', 30);
    expect(result).not.toBeNull();
    expect(result!.severity).toBe('capture');
    expect(result!.message).toBe('removed.gov has been down for 30 days');
  });

  it('returns capture severity for very long downtime', async () => {
    const result = await checkSiteDown('gone.gov', 365);
    expect(result).not.toBeNull();
    expect(result!.severity).toBe('capture');
  });

  it('includes a valid ISO date in detectedAt', async () => {
    const result = await checkSiteDown('example.gov', 10);
    expect(result).not.toBeNull();
    const parsed = new Date(result!.detectedAt);
    expect(parsed.getTime()).not.toBeNaN();
  });

  it('pluralizes "day" correctly for 1 day', async () => {
    const result = await checkSiteDown('example.gov', 1);
    expect(result!.message).toMatch(/1 day$/);
    expect(result!.message).not.toMatch(/1 days/);
  });

  it('pluralizes "days" correctly for multiple days', async () => {
    const result = await checkSiteDown('example.gov', 3);
    expect(result!.message).toMatch(/3 days$/);
  });
});
