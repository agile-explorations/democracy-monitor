import { describe, expect, it } from 'vitest';
import {
  DISPOSITION_HEADLINE_OPTS,
  QUERY_HEADLINE_OPTS,
} from '@/lib/services/synthesis-context-enrichment';

/** Postgres deflist syntax: every entry is Key=Value where an empty value
 *  MUST be quoted (""). Unquoted-empty StartSel/StopSel threw on every
 *  enrichment call from v1.9.9 to v1.9.26 — silently, because enrichment
 *  is failure-tolerant (#707, caught 2026-08-14). */
const VALID_DEFLIST_ENTRY = /^\w+=("[^"]*"|[^,\s"]+)$/;

describe('ts_headline options are valid deflists', () => {
  for (const [name, opts] of [
    ['QUERY_HEADLINE_OPTS', QUERY_HEADLINE_OPTS],
    ['DISPOSITION_HEADLINE_OPTS', DISPOSITION_HEADLINE_OPTS],
  ] as const) {
    it(`${name} has no unquoted-empty values`, () => {
      for (const entry of opts.split(',').map((e) => e.trim())) {
        expect(entry, `invalid deflist entry in ${name}: "${entry}"`).toMatch(VALID_DEFLIST_ENTRY);
      }
    });
  }
});
