/**
 * Destructive-migration gate (#618).
 *
 * `pnpm db:migrate` runs unconditionally on every Render deploy, so a
 * migration containing DROP TABLE / DROP COLUMN / TRUNCATE merged to the
 * deploy branch would execute against production with no human in the loop
 * (migration 0035 already dropped a table this way). This module detects
 * destructive DDL in the *pending* migrations and lets migrate.ts hard-stop
 * in production unless an operator sets CONFIRM_DESTRUCTIVE_MIGRATION=1.
 *
 * Pure helpers here are unit-tested; migrate.ts supplies the DB applied-count,
 * the journal, and the SQL reader.
 */

/** DDL that irreversibly discards data (as opposed to DROP INDEX/CONSTRAINT). */
const DESTRUCTIVE_DDL = /\bDROP\s+TABLE\b|\bDROP\s+COLUMN\b|\bTRUNCATE\b|\bDROP\s+SCHEMA\b/gi;

export interface JournalEntry {
  tag: string; // migration base name, e.g. "0035_nostalgic_gargoyle"
}

export interface DestructiveMigration {
  tag: string;
  statements: string[];
}

/** Return the distinct destructive DDL keywords found in a migration's SQL. */
export function findDestructiveStatements(sql: string): string[] {
  const matches = sql.match(DESTRUCTIVE_DDL) ?? [];
  return [...new Set(matches.map((m) => m.replace(/\s+/g, ' ').toUpperCase()))];
}

/**
 * Given the ordered journal and how many migrations the DB has already
 * applied, scan only the not-yet-applied ones for destructive DDL. Drizzle
 * applies migrations in journal order and records one row per migration, so
 * `entries.slice(appliedCount)` is exactly the pending set.
 */
export function pendingDestructiveMigrations(
  entries: JournalEntry[],
  appliedCount: number,
  readSql: (tag: string) => string,
): DestructiveMigration[] {
  const pending = entries.slice(appliedCount);
  const destructive: DestructiveMigration[] = [];
  for (const entry of pending) {
    const statements = findDestructiveStatements(readSql(entry.tag));
    if (statements.length > 0) destructive.push({ tag: entry.tag, statements });
  }
  return destructive;
}

/**
 * The gate decision. Blocks only when destructive migrations are pending AND
 * we're in production AND the operator has not acknowledged. Non-prod and
 * acknowledged runs proceed (but callers should still log the warning).
 */
export function shouldBlockMigration(opts: {
  destructive: DestructiveMigration[];
  isProduction: boolean;
  confirmed: boolean;
}): boolean {
  return opts.destructive.length > 0 && opts.isProduction && !opts.confirmed;
}
