import { describe, expect, it } from 'vitest';
import { CATEGORIES } from '@/lib/data/categories';
import {
  ROSTER,
  beatReporters,
  categoryLabels,
  feedReporters,
  getReporter,
  reportersForCategory,
} from '@/lib/tipwire/roster';

describe('tipwire roster (#853)', () => {
  it('maps every reporter only to real category keys', () => {
    const keys = new Set(CATEGORIES.map((c) => c.key));
    for (const r of ROSTER) {
      for (const k of r.categories) expect(keys.has(k), `${r.id} → ${k}`).toBe(true);
    }
  });

  it('acquires bylines for exactly three feed reporters, each with a sanctioned feed', () => {
    const feed = feedReporters();
    expect(feed.map((r) => r.id).sort()).toEqual(['katz', 'rosenberg', 'wagner']);
    for (const r of feed) expect(r.feed).not.toBeNull();
  });

  it('beat pass takes every active reporter, feed or not, and never an inactive one (#872)', () => {
    const beat = beatReporters();
    for (const r of feedReporters()) expect(beat).toContain(r);
    for (const r of beat) expect(r.active, r.id).toBe(true);
    expect(beat.map((r) => r.id)).not.toContain('beavers');
    expect(reportersForCategory(ROSTER, 'immigrationEnforcement').map((r) => r.id)).toEqual([
      'rosenberg',
      'beavers',
      'hesson',
      'aleaziz',
      'ainsley',
      'cooke',
    ]);
    expect(reportersForCategory(beat, 'judicialIndependence').every((r) => r.active)).toBe(true);
  });

  it('keeps reporter ids unique so cadence and sent-log rows cannot collide', () => {
    const ids = ROSTER.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('gives walled outlets no acquisition path rather than a workaround', () => {
    for (const id of ['parloff', 'schwellenbach', 'natanson', 'aleaziz', 'ainsley', 'cooke']) {
      expect(getReporter(id)?.feed, id).toBeNull();
    }
    const urls = ROSTER.flatMap((r) => (r.feed?.kind === 'rss' ? r.feed.urls : []));
    for (const u of [
      ...urls,
      ...ROSTER.map((r) => (r.feed?.kind === 'author-page' ? r.feed.url : '')),
    ]) {
      expect(u).not.toContain('news.google.com');
    }
  });

  it('renders category labels for lede-less query context', () => {
    const labels = categoryLabels(['judicialIndependence', 'executiveActions']);
    expect(labels).toHaveLength(2);
    for (const l of labels) expect(l.length).toBeGreaterThan(3);
  });
});
