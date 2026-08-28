/**
 * Cloudflare Turnstile server-side verification (#669).
 *
 * Verifies the token the widget produces on the feedback form. Returns true
 * (skips) when TURNSTILE_SECRET_KEY is unset, so local dev and tests run
 * without keys and unconfigured environments don't block submissions.
 */

const SITEVERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';
/** A hung siteverify must not hang the request; fail closed instead (#792). */
const SITEVERIFY_TIMEOUT_MS = 5_000;

export async function verifyTurnstile(
  token: string | undefined,
  remoteIp?: string,
): Promise<boolean> {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret) return true; // not configured (dev/local) — skip the check
  if (!token) return false; // configured but the client sent no token

  try {
    const body = new URLSearchParams({ secret, response: token });
    if (remoteIp) body.set('remoteip', remoteIp);
    const res = await fetch(SITEVERIFY_URL, {
      method: 'POST',
      body,
      signal: AbortSignal.timeout(SITEVERIFY_TIMEOUT_MS),
    });
    if (!res.ok) return false;
    const data = (await res.json()) as { success?: boolean };
    return data.success === true;
  } catch (err) {
    console.error('[turnstile] verification failed:', err);
    return false;
  }
}
