/**
 * Origin↔Cloudflare shared-secret gate (#620).
 *
 * With production behind Cloudflare, the Render origin is still directly
 * reachable by IP + Host header, which would bypass Cloudflare's WAF and rate
 * limiting. Cloudflare injects a secret request header (`x-dm-origin`) on every
 * request it proxies; this middleware rejects any request that lacks it.
 *
 * Fail-open safety: enforce ONLY in production AND when ORIGIN_SHARED_SECRET is
 * set. A deploy that forgets the env, or local/dev without Cloudflare, is never
 * blocked — so this can't cause a self-inflicted outage. Rollout order matters:
 * set the Render env + the Cloudflare Transform Rule BEFORE deploying this.
 */

import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

const ORIGIN_HEADER = 'x-dm-origin';

// Paths that legitimately reach the origin without transiting Cloudflare (Render
// health probe) or are independently authenticated (cron endpoints via
// CRON_SECRET), plus the CSP report sink — never block these.
const ALLOWLIST_PREFIXES = ['/api/health/', '/api/cron/', '/api/csp-report'];

/** Constant-time compare — crypto.timingSafeEqual is unavailable in the Edge runtime. */
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export function middleware(req: NextRequest): NextResponse {
  const secret = process.env.ORIGIN_SHARED_SECRET;
  if (process.env.NODE_ENV !== 'production' || !secret) return NextResponse.next();

  const { pathname } = req.nextUrl;
  if (ALLOWLIST_PREFIXES.some((p) => pathname.startsWith(p))) return NextResponse.next();

  const header = req.headers.get(ORIGIN_HEADER);
  if (header && safeEqual(header, secret)) return NextResponse.next();

  return new NextResponse('Forbidden', { status: 403 });
}

export const config = {
  // Everything except Next internal assets and common static files.
  matcher: ['/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml).*)'],
};
