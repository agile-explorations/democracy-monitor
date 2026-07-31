/**
 * POST /api/csp-report — sink for Content-Security-Policy violation reports
 * (#619 R10). Accepts both the legacy `report-uri` body (`application/csp-report`
 * → `{ "csp-report": {...} }`) and the modern Reporting API body
 * (`application/reports+json` → `[{ type: 'csp-violation', body: {...} }]`),
 * logs the key fields, and returns 204. Rate-limited so a spammer/extension
 * can't flood logs. The bodyParser is disabled so any content-type is read.
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { requireMethod } from '@/lib/utils/api-helpers';
import { RATE_LIMITS, enforceRateLimit } from '@/lib/utils/rate-limit';

export const config = { api: { bodyParser: false } };

const MAX_BODY_BYTES = 50_000;

interface CspFields {
  documentUri: string;
  violatedDirective: string;
  blockedUri: string;
}

async function readBody(req: NextApiRequest): Promise<string> {
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of req) {
    const buf = typeof chunk === 'string' ? Buffer.from(chunk) : (chunk as Buffer);
    total += buf.length;
    if (total > MAX_BODY_BYTES) break;
    chunks.push(buf);
  }
  return Buffer.concat(chunks).toString('utf8');
}

function asRecord(v: unknown): Record<string, unknown> | null {
  return v && typeof v === 'object' ? (v as Record<string, unknown>) : null;
}

function extractReports(parsed: unknown): CspFields[] {
  const top = asRecord(parsed);
  const legacy = top && asRecord(top['csp-report']);
  if (legacy) {
    return [
      {
        documentUri: String(legacy['document-uri'] ?? ''),
        violatedDirective: String(legacy['violated-directive'] ?? ''),
        blockedUri: String(legacy['blocked-uri'] ?? ''),
      },
    ];
  }
  if (Array.isArray(parsed)) {
    return parsed
      .map(asRecord)
      .filter((r): r is Record<string, unknown> => r?.type === 'csp-violation')
      .map((r) => {
        const b = asRecord(r.body) ?? {};
        return {
          documentUri: String(b['documentURL'] ?? ''),
          violatedDirective: String(b['effectiveDirective'] ?? b['violatedDirective'] ?? ''),
          blockedUri: String(b['blockedURL'] ?? ''),
        };
      });
  }
  return [];
}

export default async function handler(req: NextApiRequest, res: NextApiResponse): Promise<void> {
  if (!requireMethod(req, res, 'POST')) return;
  if (!(await enforceRateLimit(req, res, RATE_LIMITS.cspReport))) return;

  let parsed: unknown;
  try {
    parsed = JSON.parse(await readBody(req));
  } catch {
    res.status(204).end();
    return;
  }

  for (const r of extractReports(parsed)) {
    console.warn(
      `[csp-report] blocked=${r.blockedUri || '?'} directive=${r.violatedDirective || '?'} doc=${r.documentUri || '?'}`,
    );
  }
  res.status(204).end();
}
