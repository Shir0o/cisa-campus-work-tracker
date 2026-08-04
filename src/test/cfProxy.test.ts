import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { onRequest } from '../../functions/api/[[path]]';

describe('Cloudflare Pages Proxy Function (functions/api/[[path]].ts)', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('strips transport/encoding headers (content-length, content-encoding, transfer-encoding, connection) that cause Safari EOF error', async () => {
    const mockBackendHeaders = new Headers({
      'content-length': '1234',
      'content-encoding': 'gzip',
      'transfer-encoding': 'chunked',
      'connection': 'keep-alive',
      'x-backend-header': 'test-value',
      'content-type': 'application/json',
    });

    const mockBackendResponse = new Response(JSON.stringify({ ok: true }), {
      status: 200,
      statusText: 'OK',
      headers: mockBackendHeaders,
    });

    globalThis.fetch = vi.fn().mockResolvedValue(mockBackendResponse);

    const mockRequest = new Request('https://cisa-campus.pages.dev/api/test?foo=bar', {
      method: 'GET',
      headers: new Headers({
        'cf-connecting-ip': '1.2.3.4',
        'user-agent': 'Safari/605.1.15',
      }),
    });

    const context: any = {
      request: mockRequest,
      env: {
        BACKEND_API_URL: 'https://test-backend.a.run.app',
      },
    };

    const response = await onRequest(context);

    expect(response.status).toBe(200);
    expect(response.headers.get('x-backend-header')).toBe('test-value');
    expect(response.headers.get('x-proxied-by')).toBe('Cloudflare-Pages-Function-Proxy');
    expect(response.headers.get('access-control-allow-origin')).toBe('*');

    // Transport/encoding headers must be deleted so Safari does not fail with EOF error
    expect(response.headers.get('content-length')).toBeNull();
    expect(response.headers.get('content-encoding')).toBeNull();
    expect(response.headers.get('transfer-encoding')).toBeNull();
    expect(response.headers.get('connection')).toBeNull();
  });

  it('handles OPTIONS preflight request with correct CORS headers', async () => {
    const mockRequest = new Request('https://cisa-campus.pages.dev/api/test', {
      method: 'OPTIONS',
    });

    const context: any = {
      request: mockRequest,
      env: {},
    };

    const response = await onRequest(context);

    expect(response.status).toBe(204);
    expect(response.headers.get('access-control-allow-origin')).toBe('*');
    expect(response.headers.get('access-control-allow-methods')).toContain('POST');
  });
});
