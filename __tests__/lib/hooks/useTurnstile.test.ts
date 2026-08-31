import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { TurnstileRenderOptions } from '@/lib/hooks/useTurnstile';

/** Records every widget-API interaction as output state (no mock-call
 *  assertions): render/reset/remove are appended to `ops`, and the last
 *  render's options are kept so the test can fire Turnstile's callbacks. */
function installTurnstileMock(ops: string[]) {
  let lastOpts: TurnstileRenderOptions | null = null;
  let n = 0;
  window.turnstile = {
    render: (el, opts) => {
      lastOpts = opts;
      n++;
      el.appendChild(document.createElement('iframe'));
      ops.push(`render:w${n}`);
      return `w${n}`;
    },
    reset: (id) => {
      ops.push(`reset:${id}`);
      lastOpts?.callback('reset-token');
    },
    remove: (id) => {
      ops.push(`remove:${id}`);
    },
  };
  return {
    resolveToken: (t: string) => lastOpts?.callback(t),
    failToken: () => lastOpts?.['error-callback']?.(),
  };
}

/** getTurnstileToken awaits the (already-resolved) script promise before
 *  rendering; flush the task queue so the widget exists before we drive its
 *  callbacks. */
const flush = () => new Promise<void>((r) => setTimeout(r, 0));

async function loadModule() {
  vi.resetModules();
  process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY = 'test-site-key';
  return import('@/lib/hooks/useTurnstile');
}

beforeEach(() => {
  document.body.innerHTML = '';
  delete window.turnstile;
});

describe('getTurnstileToken — widget lifecycle (VPN checkbox report, 2026-08-31)', () => {
  it('destroys the widget after a token resolves, emptying the mount', async () => {
    const ops: string[] = [];
    const mock = installTurnstileMock(ops);
    const { getTurnstileToken } = await loadModule();
    const mount = document.createElement('div');
    document.body.appendChild(mount);

    const p = getTurnstileToken(mount);
    await flush();
    mock.resolveToken('tok-1');
    await expect(p).resolves.toBe('tok-1');
    expect(ops).toEqual(['render:w1', 'remove:w1']);
    expect(mount.childElementCount).toBe(0); // empty:hidden styling now hides it
    expect(mount.isConnected).toBe(true); // caller-provided mount is never removed
  });

  it('renders a fresh widget for the next exchange instead of resetting a consumed one', async () => {
    const ops: string[] = [];
    const mock = installTurnstileMock(ops);
    const { getTurnstileToken } = await loadModule();
    const mount = document.createElement('div');
    document.body.appendChild(mount);

    const first = getTurnstileToken(mount);
    await flush();
    mock.resolveToken('tok-1');
    await first;
    const second = getTurnstileToken(mount);
    await flush();
    mock.resolveToken('tok-2');
    await expect(second).resolves.toBe('tok-2');
    expect(ops).toEqual(['render:w1', 'remove:w1', 'render:w2', 'remove:w2']);
  });

  it('reuses a live widget via reset after a failure, but re-renders when its mount left the DOM', async () => {
    const ops: string[] = [];
    const mock = installTurnstileMock(ops);
    const { getTurnstileToken } = await loadModule();
    const mount = document.createElement('div');
    document.body.appendChild(mount);

    const first = getTurnstileToken(mount);
    await flush();
    mock.failToken();
    await expect(first).rejects.toThrow('Verification failed');

    // Same mount still connected: retry re-executes the existing widget.
    const second = getTurnstileToken(mount);
    await flush();
    await expect(second).resolves.toBe('reset-token');
    expect(ops).toEqual(['render:w1', 'reset:w1', 'remove:w1']);

    // A later exchange from a new mount (old one gone) renders fresh.
    const mount2 = document.createElement('div');
    document.body.appendChild(mount2);
    const third = getTurnstileToken(mount2);
    await flush();
    mock.resolveToken('tok-3');
    await expect(third).resolves.toBe('tok-3');
    expect(ops).toEqual(['render:w1', 'reset:w1', 'remove:w1', 'render:w2', 'remove:w2']);
  });
});
