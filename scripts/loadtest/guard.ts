/**
 * Hard prod guard (#781): the load harness must NEVER run against
 * production. Fail closed on anything resembling the prod stack.
 */

const PROD_MARKERS = [
  'democracymonitor.us',
  'srv-d6mli9fgi27c73bvinhg', // prod web service
  'dpg-d6mlhofgi27c73bvih90', // prod postgres
  'red-d6mlhofgi27c73bvih7g', // prod keyvalue
];

export function assertNotProd(targets: Record<string, string | undefined>): void {
  for (const [name, value] of Object.entries(targets)) {
    if (!value) continue;
    for (const marker of PROD_MARKERS) {
      if (value.includes(marker)) {
        console.error(
          `REFUSING TO RUN: ${name} matches production marker "${marker}". ` +
            'The load harness only ever targets the dev environment.',
        );
        process.exit(1);
      }
    }
  }
}
