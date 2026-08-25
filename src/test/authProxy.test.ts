import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { onRequest } from '../../functions/__/auth/[[path]]';

// Issue #557 — the same-origin auth helper proxy. The web app is on Cloudflare
// Pages (not Firebase Hosting), so storage-partitioned Chrome/Safari can't read
// the cross-origin auth helper's initial state and sign-in fails with
// "Unable to process request due to missing initial state". This function
// reverse-proxies every `__/auth/*` request to the real Firebase helper so the
// handler and the app share an origin. It must be TRANSPARENT (no redirects,
// no rewritten bodies) or the browser notices the trick.
describe('Cloudflare Auth Proxy (functions/__/auth/[[path]].ts)', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('proxies a GET to the Firebase auth helper on the same path', async () => {
    const mockResponse = new Response('handler-html', {
      status: 200,
      headers: new Headers({ 'content-type': 'text/html' }),
    });
    const fetchMock = vi.fn().mockResolvedValue(mockResponse);
    globalThis.fetch = fetchMock;

    const request = new Request('https://cisa-campus-work-traker.pages.dev/__/auth/handler?apiKey=x', {
      method: 'GET',
      headers: new Headers({ 'cf-connecting-ip': '1.2.3.4' }),
    });
    const context: any = { request, env: {} };

    const response = await onRequest(context);

    expect(response.status).toBe(200);
    const calledUrl = fetchMock.mock.calls[0][0];
    expect(String(calledUrl)).toBe('https://sac-campus-hub.firebaseapp.com/__/auth/handler?apiKey=x');
    await expect(response.text()).resolves.toBe('handler-html');
  });

  it('returns 404 for non-auth paths so a stray path is never mistaken for content', async () => {
    const fetchSpy = vi.fn();
    globalThis.fetch = fetchSpy;
    const request = new Request('https://cisa-campus-work-traker.pages.dev/__/something-else', {
      method: 'GET',
    });
    const response = await onRequest({ request, env: {} } as any);
    expect(response.status).toBe(404);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('keeps the response transparent (no transport headers a browser can choke on)', async () => {
    const backendHeaders = new Headers({
      'content-length': '100',
      'content-encoding': 'gzip',
      'transfer-encoding': 'chunked',
      'connection': 'keep-alive',
      'content-type': 'application/json',
    });
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), { status: 200, headers: backendHeaders }),
    );

    const request = new Request('https://cisa-campus-work-traker.pages.dev/__/auth/iframe.js', {
      method: 'GET',
    });
    const response = await onRequest({ request, env: {} } as any);

    expect(response.status).toBe(200);
    expect(response.headers.get('content-length')).toBeNull();
    expect(response.headers.get('content-encoding')).toBeNull();
    expect(response.headers.get('transfer-encoding')).toBeNull();
    expect(response.headers.get('connection')).toBeNull();
  });

  it('returns 502 with a JSON body when the helper is unreachable', async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('offline'));
    const request = new Request('https://cisa-campus-work-traker.pages.dev/__/auth/handler', {
      method: 'GET',
    });
    const response = await onRequest({ request, env: {} } as any);
    expect(response.status).toBe(502);
    const body = await response.json();
    expect(body.error).toBe('Auth helper unavailable');
  });
});