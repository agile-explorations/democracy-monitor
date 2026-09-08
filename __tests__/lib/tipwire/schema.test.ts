import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/** The beat pass (#868) loosens tip_candidates.article_id; the CHECK restores the
 *  invariant: every candidate is anchored to an article OR is a beat row with a
 *  reporter. Guarded here because a regenerated migration could silently drop it. */
describe('tip_candidates anchor invariant (#868)', () => {
  it('migration 0069 makes article_id nullable, adds reporter_id, and enforces the anchor CHECK', () => {
    const dir = path.join(process.cwd(), 'drizzle');
    const file = readdirSync(dir).find((f) => f.startsWith('0069_') && f.endsWith('.sql'));
    expect(file).toBeDefined();
    const sql = readFileSync(path.join(dir, file as string), 'utf8');
    expect(sql).toMatch(/ALTER COLUMN "article_id" DROP NOT NULL/);
    expect(sql).toMatch(/ADD COLUMN "reporter_id" varchar\(40\)/);
    expect(sql).toMatch(
      /CHECK \("tip_candidates"\."article_id" IS NOT NULL OR \("tip_candidates"\."watch_kind" = 'beat' AND "tip_candidates"\."reporter_id" IS NOT NULL\)\)/,
    );
  });
});
