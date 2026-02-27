import { getIncompleteWeeks } from '@/lib/services/fetch-log-store';

interface GapOptions {
  source?: string;
  category?: string;
  json?: boolean;
}

function parseArgs(args: string[]): GapOptions {
  const options: GapOptions = {};
  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--source':
        options.source = args[++i];
        break;
      case '--category':
        options.category = args[++i];
        break;
      case '--json':
        options.json = true;
        break;
    }
  }
  return options;
}

async function showGaps(options: GapOptions): Promise<void> {
  const gaps = await getIncompleteWeeks(options.source, options.category);

  if (gaps.length === 0) {
    console.log('No incomplete fetches found.');
    return;
  }

  if (options.json) {
    console.log(JSON.stringify(gaps, null, 2));
    return;
  }

  // Group by category
  const byCategory: Record<string, typeof gaps> = {};
  for (const gap of gaps) {
    if (!byCategory[gap.category]) byCategory[gap.category] = [];
    byCategory[gap.category].push(gap);
  }

  console.log(`Found ${gaps.length} incomplete fetch(es):\n`);

  for (const [cat, catGaps] of Object.entries(byCategory)) {
    console.log(`[${cat}]`);
    for (const gap of catGaps) {
      const errorCount = gap.errors?.length ?? 0;
      console.log(
        `  ${gap.weekStart}  ${gap.sourceOrigin.padEnd(18)} ${gap.status.padEnd(8)} ${gap.itemsFetched} items  ${errorCount} error(s)`,
      );
    }
    console.log();
  }
}

if (require.main === module) {
  const { loadEnvConfig } = require('@next/env');
  loadEnvConfig(process.cwd());

  const options = parseArgs(process.argv.slice(2));

  showGaps(options)
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('[backfill:gaps] Fatal error:', err);
      process.exit(1);
    });
}
