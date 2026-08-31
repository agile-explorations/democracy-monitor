/**
 * Cloudflare Turnstile client glue, shared by the feedback form (managed,
 * visible widget) and the search pass gate (#792, invisible
 * `interaction-only` widget that only shows a challenge when Cloudflare
 * wants one). Not a React hook despite the directory: a module singleton,
 * because the search page needs a token from inside an async flow, not on
 * render.
 */

export interface TurnstileRenderOptions {
  sitekey: string;
  callback: (token: string) => void;
  'expired-callback'?: () => void;
  'error-callback'?: () => void;
  appearance?: 'always' | 'execute' | 'interaction-only';
}

export interface TurnstileApi {
  render: (el: HTMLElement, opts: TurnstileRenderOptions) => string;
  reset: (id?: string) => void;
  remove?: (id: string) => void;
}

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

export const TURNSTILE_SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
const SCRIPT_SRC = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
/** Long enough for a person to notice and complete an interactive challenge. */
const TOKEN_TIMEOUT_MS = 120_000;

let scriptPromise: Promise<void> | null = null;
let widgetId: string | null = null;
let container: HTMLElement | null = null;
/** True when we created the fallback fixed-corner host ourselves. */
let ownHost = false;
let pending: { resolve: (t: string) => void; reject: (e: Error) => void } | null = null;

/** Tear the widget down after a token is consumed (tokens are single-use):
 *  the visible checkbox otherwise lingers and resets to "unchecked" when
 *  its token expires, reading as "verify again" to a person who already
 *  holds a valid pass (VPN report, 2026-08-31). Removing the iframe
 *  empties the mount, whose `empty:hidden` styling hides it. */
function destroyWidget(): void {
  const api = window.turnstile;
  if (widgetId && api?.remove) api.remove(widgetId);
  // Empty the mount ourselves too — `empty:hidden` must not depend on the
  // vendor API's DOM hygiene.
  container?.replaceChildren();
  if (ownHost && container?.parentElement) container.parentElement.removeChild(container);
  widgetId = null;
  container = null;
  ownHost = false;
}

/** Load api.js once (also resolves when the feedback form already did). */
export function loadTurnstileScript(): Promise<void> {
  if (typeof window === 'undefined') return Promise.reject(new Error('no window'));
  if (window.turnstile) return Promise.resolve();
  if (!scriptPromise) {
    scriptPromise = new Promise<void>((resolve, reject) => {
      const el = document.createElement('script');
      el.src = SCRIPT_SRC;
      el.async = true;
      el.onload = () => resolve();
      el.onerror = () => {
        scriptPromise = null;
        reject(new Error('Turnstile script failed to load'));
      };
      document.head.appendChild(el);
    });
  }
  return scriptPromise;
}

function settle(fn: (p: NonNullable<typeof pending>) => void): void {
  const p = pending;
  pending = null;
  if (p) fn(p);
}

/** A fresh Turnstile token from an invisible widget; '' when no site key is
 *  configured (enforcement is then off server-side too). Tokens are
 *  single-use — call again for each exchange. `mount` is where a challenge
 *  appears if Cloudflare wants one: pass the element under the search box
 *  so a person sees it in context (a fixed corner is the fallback). */
export async function getTurnstileToken(mount?: HTMLElement | null): Promise<string> {
  if (!TURNSTILE_SITE_KEY) return '';
  await loadTurnstileScript();
  const api = window.turnstile;
  if (!api) throw new Error('Turnstile unavailable');
  if (pending) throw new Error('Turnstile token request already in flight');
  return new Promise<string>((resolve, reject) => {
    pending = { resolve, reject };
    const timer = setTimeout(
      () => settle((p) => p.reject(new Error('Verification timed out'))),
      TOKEN_TIMEOUT_MS,
    );
    const done = (fn: (p: NonNullable<typeof pending>) => void) => {
      clearTimeout(timer);
      settle(fn);
    };
    if (widgetId && container?.isConnected) {
      api.reset(widgetId); // re-executes; the render callbacks below fire again
      return;
    }
    if (widgetId) destroyWidget(); // stale widget on a detached node — start over
    const host: HTMLElement = mount ?? document.createElement('div');
    host.setAttribute('aria-live', 'polite');
    if (!mount) {
      host.style.cssText = 'position:fixed;bottom:1rem;right:1rem;z-index:50;';
      document.body.appendChild(host);
      ownHost = true;
    }
    container = host;
    widgetId = api.render(host, {
      sitekey: TURNSTILE_SITE_KEY,
      appearance: 'interaction-only',
      callback: (token) =>
        done((p) => {
          destroyWidget();
          p.resolve(token);
        }),
      'error-callback': () =>
        done((p) => p.reject(new Error('Verification failed — please retry.'))),
      'expired-callback': () =>
        done((p) => p.reject(new Error('Verification expired — please retry.'))),
    });
  });
}
