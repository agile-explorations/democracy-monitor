/**
 * Test CREC routing volume + quality: fetch one week and audit per-category routing.
 * Usage: source .env.local && tsx scripts/test-crec-routing.ts [dateFrom] [dateTo]
 * Default: 2025-01-20 → 2025-01-24 (inauguration week)
 */

import { TOPIC_ROUTING_TERMS } from '@/lib/data/topic-routing-terms';
import { classifyCrecToCategories } from '@/lib/services/crec-classifier';
import { fetchCrecHistorical } from '@/lib/services/crec-fetcher';
import type { ContentItem } from '@/lib/types';

const SAMPLE_SIZE = 5;

interface RoutedDoc {
  item: ContentItem;
  categories: string[];
  matchedTerms: Record<string, string[]>;
}

/** Find which routing terms matched for each category. */
function findMatchedTerms(searchText: string, categories: string[]): Record<string, string[]> {
  const result: Record<string, string[]> = {};
  for (const cat of categories) {
    const terms = TOPIC_ROUTING_TERMS[cat] || [];
    result[cat] = terms.filter((t) => {
      const tl = t.toLowerCase();
      if (tl.length >= 5) return searchText.includes(tl);
      return new RegExp(`\\b${tl.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(searchText);
    });
  }
  return result;
}

async function main() {
  const dateFrom = process.argv[2] || '2025-01-20';
  const dateTo = process.argv[3] || '2025-01-24';

  console.log(`Fetching CREC ${dateFrom} → ${dateTo}...`);
  const items = await fetchCrecHistorical({
    chambers: ['SENATE', 'HOUSE'],
    dateFrom,
    dateTo,
  });

  console.log(`\nTotal items fetched: ${items.length}`);

  const byCategory: Record<string, RoutedDoc[]> = {};
  let matched = 0;
  let unmatched = 0;

  for (const item of items) {
    const searchText = `${item.title} ${item.content || ''}`.toLowerCase();
    const categories = classifyCrecToCategories(item.title || '', item.content);
    if (categories.length === 0) {
      unmatched++;
    } else {
      matched++;
      const matchedTerms = findMatchedTerms(searchText, categories);
      for (const cat of categories) {
        if (!byCategory[cat]) byCategory[cat] = [];
        byCategory[cat].push({ item, categories, matchedTerms });
      }
    }
  }

  // --- Volume summary ---
  console.log(
    `\nRouted: ${matched}/${items.length} (${((matched / items.length) * 100).toFixed(1)}%)`,
  );
  console.log(`Unmatched: ${unmatched}/${items.length}\n`);

  const sorted = Object.entries(byCategory).sort((a, b) => b[1].length - a[1].length);
  console.log('Per-category routing:');
  for (const [cat, docs] of sorted) {
    console.log(`  ${cat.padEnd(25)} ${docs.length}`);
  }

  // --- Per-category quality audit ---
  console.log('\n' + '='.repeat(80));
  console.log('ROUTING QUALITY AUDIT — sample documents per category');
  console.log('='.repeat(80));

  for (const [cat, docs] of sorted) {
    console.log(`\n--- ${cat} (${docs.length} total) ---`);

    // Deterministic sample: evenly spaced
    const step = Math.max(1, Math.floor(docs.length / SAMPLE_SIZE));
    const sample = docs.filter((_, i) => i % step === 0).slice(0, SAMPLE_SIZE);

    for (let i = 0; i < sample.length; i++) {
      const doc = sample[i];
      const content = doc.item.content || '(no content)';
      const terms = doc.matchedTerms[cat]?.join(', ') || '?';
      console.log(`\n  [${i + 1}] "${doc.item.title}"`);
      console.log(`      Matched terms: ${terms}`);
      console.log(`      Content: ${content.slice(0, 300)}`);
      if (doc.categories.length > 1) {
        console.log(`      Also routed to: ${doc.categories.filter((c) => c !== cat).join(', ')}`);
      }
    }
  }
}

main().catch(console.error);
