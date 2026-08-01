import type { KnipConfig } from 'knip';

const config: KnipConfig = {
  // Cron scripts and diagnostic scripts are entry points, not imported by app code
  entry: [
    'pages/**/*.{ts,tsx}',
    'lib/cron/uptime-check.ts',
    'lib/cron/weekly-clustering.ts',
    // Invoked from the dump shell script (pages/api/cron/dump.ts), not imported.
    'lib/cron/upload-backup.ts',
    'lib/cron/upload-download.ts',
    'scripts/**/*.ts',
  ],

  // @next/env is bundled with next but imported directly by cron scripts
  ignoreDependencies: ['@next/env'],

  // opengrep is installed globally / via CI binary, not as a node_module
  ignoreBinaries: ['opengrep'],

  // Types re-exported from barrel files are used at runtime via those barrels
  ignoreExportsUsedInFile: true,
};

export default config;
