/** Clamped integer env override for tuning knobs (#782 WO-3): returns the
 *  env value when it parses to an integer within [min, max], else the
 *  default. Lets DB-concurrency constants be swept on dev (and adjusted in
 *  an incident) without a release; the in-code default remains the derived,
 *  documented value. */
export function envInt(name: string, fallback: number, min: number, max: number): number {
  const raw = process.env[name];
  if (raw == null || raw.trim() === '') return fallback;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < min || n > max) return fallback;
  return n;
}
