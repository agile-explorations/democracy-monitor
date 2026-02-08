/** Supreme Court term starts each October. TYear = 2-digit year the term began. */
export function scotusTermYear(): string {
  const now = new Date();
  const year = now.getMonth() >= 9 ? now.getFullYear() : now.getFullYear() - 1;
  return String(year % 100);
}
