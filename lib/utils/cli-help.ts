/** Check for --help / -h in CLI args and print usage if found. */
export function checkHelp(args: string[], usage: string): void {
  if (args.includes('--help') || args.includes('-h')) {
    console.log(usage);
    process.exit(0);
  }
}
