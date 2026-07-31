/**
 * Origin↔Cloudflare shared-secret gate (#620, #622).
 *
 * With production behind Cloudflare, the Render origin is still directly
 * reachable by IP + Host header, bypassing Cloudflare's WAF/rate-limiting.
 * Cloudflare injects a secret request header (`x-dm-origin`); this rejects any
 * request that lacks it — but ONLY once enforcement is explicitly enabled.
 *
 * Two-stage rollout (see lib/utils/origin-guard.ts): with the secret set but
 * `ORIGIN_ENFORCE !== 'true'`, a missing/mismatched header is logged (sampled)
 * but ALLOWED. Deploy → confirm the logs are quiet (header matches) → set
 * `ORIGIN_ENFORCE=true`. This makes it impossible for a secret mismatch to take
 * the site down as a side effect of deploying (it did, 2026-07-31).
 */

import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { ORIGIN_HEADER, evaluateOrigin } from '@/lib/utils/origin-guard';

const LOG_SAMPLE_RATE = 0.02;

export function middleware(req: NextRequest): NextResponse {
  const decision = evaluateOrigin({
    isProduction: process.env.NODE_ENV === 'production',
    secret: process.env.ORIGIN_SHARED_SECRET,
    enforce: process.env.ORIGIN_ENFORCE === 'true',
    pathname: req.nextUrl.pathname,
    header: req.headers.get(ORIGIN_HEADER),
  });

  if (decision.action === 'block') {
    return new NextResponse('Forbidden', { status: 403 });
  }
  if (decision.action === 'log' && Math.random() < LOG_SAMPLE_RATE) {
    console.warn(
      `[origin-guard] log-only: x-dm-origin ${decision.reason} on ${req.nextUrl.pathname} ` +
        '— fix the secret match before setting ORIGIN_ENFORCE=true',
    );
  }
  return NextResponse.next();
}

export const config = {
  // Everything except Next internal assets and common static files.
  matcher: ['/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml).*)'],
};
