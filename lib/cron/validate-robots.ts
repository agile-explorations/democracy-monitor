/**
 * CLI: pnpm validate:robots
 *
 * On-demand robots.txt compliance audit over the full robots registry (every
 * consumed and planned host). The same audit runs automatically at the start
 * of every weekly snapshot. Exit 1 on any crawl-host violation so CI/chains
 * can gate on it.
 */

import { auditRobotsCompliance, reportRobotsAudit } from '@/lib/services/robots-compliance';
import { checkHelp } from '@/lib/utils/cli-help';

async function main(): Promise<void> {
  const result = await auditRobotsCompliance();
  reportRobotsAudit(result, 'validate-robots');
  for (const v of result.verdicts) {
    const flag = v.allowed ? '✓' : '✗';
    console.log(
      `  ${flag} ${v.host}${v.path} [${v.kind}/${v.status}]${v.matchedRule ? ` — ${v.matchedRule}` : ''}`,
    );
  }
  if (result.violations.length > 0) process.exit(1);
}

if (require.main === module) {
  checkHelp(
    process.argv.slice(2),
    `Usage: pnpm validate:robots

Audits robots.txt for every host in lib/data/robots-registry.ts against the
paths this pipeline requests. Crawl-host violations exit 1.`,
  );
  main()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('[validate-robots] failed:', err);
      process.exit(1);
    });
}
