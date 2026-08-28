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
const TOKEN_TIMEOUT_MS = 30_000;

let scriptPromise: Promise<void> | null = null;
let widgetId: string | null = null;
let container: HTMLDivElement | null = null;
let pending: { resolve: (t: string) => void; reject: (e: Error) => void } | null = null;

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
 *  single-use — call again for each exchange. */
export async function getTurnstileToken(): Promise<string> {
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
    if (widgetId) {
      api.reset(widgetId); // re-executes; the render callbacks below fire again
      return;
    }
    container = document.createElement('div');
    container.setAttribute('aria-live', 'polite');
    container.style.cssText = 'position:fixed;bottom:1rem;right:1rem;z-index:50;';
    document.body.appendChild(container);
    widgetId = api.render(container, {
      sitekey: TURNSTILE_SITE_KEY,
      appearance: 'interaction-only',
      callback: (token) => done((p) => p.resolve(token)),
      'error-callback': () =>
        done((p) => p.reject(new Error('Verification failed — please retry.'))),
      'expired-callback': () =>
        done((p) => p.reject(new Error('Verification expired — please retry.'))),
    });
  });
}
