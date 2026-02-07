import { createHash } from 'crypto';
import { eq } from 'drizzle-orm';
import { isDbAvailable, getDb } from '@/lib/db';
import { contentSnapshots } from '@/lib/db/schema';
import type { SuppressionAlert, ContentSnapshot } from '@/lib/types/resilience';

function hashContent(content: string): string {
  return createHash('sha256').update(content).digest('hex');
}

export async function checkForSuppression(
  url: string,
  currentContent: string,
): Promise<SuppressionAlert | null> {
  if (!isDbAvailable()) return null;

  const db = getDb();
  const currentHash = hashContent(currentContent);

  // Get previous snapshot
  const previous = await db
    .select()
    .from(contentSnapshots)
    .where(eq(contentSnapshots.url, url))
    .limit(1);

  if (previous.length === 0) {
    // First snapshot — save and return no alert
    await db.insert(contentSnapshots).values({
      url,
      contentHash: currentHash,
      reportCount: countReports(currentContent),
    });
    return null;
  }

  const prev = previous[0];

  // Content completely removed (empty or error page)
  if (currentContent.length < 100 && prev.contentHash !== currentHash) {
    await updateSnapshot(db, url, currentHash, 0);
    return {
      url,
      type: 'content_removed',
      severity: 'capture',
      message: `Content at ${url} appears to have been removed or replaced with an error page`,
      detectedAt: new Date().toISOString(),
      previousHash: prev.contentHash,
      currentHash,
    };
  }

  // Significant content change
  if (prev.contentHash !== currentHash) {
    const prevReportCount = prev.reportCount ?? 0;
    const currentReportCount = countReports(currentContent);

    // Report count dropped significantly (>30% decrease)
    if (prevReportCount > 0 && currentReportCount < prevReportCount * 0.7) {
      await updateSnapshot(db, url, currentHash, currentReportCount);
      return {
        url,
        type: 'content_changed',
        severity: 'drift',
        message: `Report count at ${url} dropped from ${prevReportCount} to ${currentReportCount} (${Math.round((1 - currentReportCount / prevReportCount) * 100)}% decrease)`,
        detectedAt: new Date().toISOString(),
        previousHash: prev.contentHash,
        currentHash,
      };
    }

    // Normal content update, refresh snapshot
    await updateSnapshot(db, url, currentHash, currentReportCount);
  }

  return null;
}

function countReports(content: string): number {
  // Count common report indicators in HTML/text content
  const reportPatterns = [/<article/gi, /class="report/gi, /<h[23][^>]*>.*?report/gi, /\.pdf/gi];

  let count = 0;
  for (const pattern of reportPatterns) {
    const matches = content.match(pattern);
    if (matches) count += matches.length;
  }
  return count;
}

async function updateSnapshot(
  db: ReturnType<typeof getDb>,
  url: string,
  contentHash: string,
  reportCount: number,
): Promise<void> {
  await db
    .update(contentSnapshots)
    .set({
      contentHash,
      reportCount,
      snapshotAt: new Date(),
    })
    .where(eq(contentSnapshots.url, url));
}

export async function checkSiteDown(
  hostname: string,
  downSinceDays: number,
): Promise<SuppressionAlert | null> {
  if (downSinceDays >= 7) {
    return {
      url: `https://${hostname}`,
      type: 'site_down',
      severity: downSinceDays >= 30 ? 'capture' : 'drift',
      message: `${hostname} has been down for ${downSinceDays} days`,
      detectedAt: new Date().toISOString(),
    };
  }

  if (downSinceDays >= 1) {
    return {
      url: `https://${hostname}`,
      type: 'site_down',
      severity: 'warning',
      message: `${hostname} has been down for ${downSinceDays} day${downSinceDays !== 1 ? 's' : ''}`,
      detectedAt: new Date().toISOString(),
    };
  }

  return null;
}
