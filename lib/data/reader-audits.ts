/**
 * Outside-reader audits (#816): each quarter, fifty Pass-2 readings go to
 * two people who are not the owner (`pnpm audit:readers`). The scored
 * result is committed here and rendered on the methodology page beside the
 * era rates — the one place a reader can see whether someone other than
 * the builder and the model has checked the reviewer's readings, and how
 * often they agreed. Rules: readers are never the owner; the sample is
 * deterministic from its seed and published with the result; a new entry
 * per quarter, older entries never edited.
 */

import type { ReaderAuditResult } from '@/lib/services/reader-audit';

export interface ReaderAuditRecord {
  /** Quarter id, also the sampling seed. */
  id: string;
  status: 'in_progress' | 'scored';
  /** ISO date the packet was issued to the readers. */
  packetIssued: string;
  sample: number;
  result?: ReaderAuditResult;
}

export const READER_AUDITS: ReaderAuditRecord[] = [
  { id: '2026-Q3', status: 'in_progress', packetIssued: '2026-08-29', sample: 50 },
];
