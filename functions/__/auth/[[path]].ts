// Same-origin Firebase Auth helper proxy (#557).
//
// The web app is hosted on Cloudflare Pages (cisa-campus-work-tracker.pages.dev),
// NOT Firebase Hosting. Firefox/Safari/Chrome with storage partitioning block
// the cross-origin auth handler at `sac-campus-hub.firebaseapp.com` from reading
// the initial-state it needs — the well-known "Unable to process request due to
// missing initial state" popup error (firebase-js-sdk #4256 / #8467).
//
// Firebase's documented fix for non-Firebase hosting (redirect-best-practices,
// Option 3) is to serve the auth helper FROM the app's own domain, so the
// handler and the app share storage: set `authDomain` to the app domain and
// reverse-proxy every `__/auth/*` request here to the real Firebase helper.
// This function is the "here". It must be a TRANSPARENT proxy (no 302s, no
// rewrites of the response body) so the browser believes it talked to its own
// origin the whole way through.
//
// The handler page itself loads `__/firebase/init.json` from the same domain to
// learn the project config, so that request is served here too (see the sibling
// `functions/__/firebase/init.json.ts`).

const FIREBASE_AUTH_DOMAIN = 'sac-campus-hub.firebaseapp.com';

export const onRequest: PagesFunction = async (context) => {
  const { request } = context;
  const url = new URL(request.url);

  // Only the auth helper paths are proxied; anything else here is a 404 so a
  // stale browser never mistakes a stray path for real content.
  if (!url.pathname.startsWith('/__/auth/')) {
    return new Response('Not Found', { status: 404 });
  }

  const targetUrl = new URL(url.pathname + url.search, `https://${FIREBASE_AUTH_DOMAIN}`);
  console.log(`[CF Auth Proxy] ${request.method} ${url.pathname} -> ${targetUrl.host}${targetUrl.pathname}`);

  const headers = new Headers(request.headers);
  headers.set('X-Forwarded-Host', url.host);
  headers.set('X-Forwarded-Proto', url.protocol.replace(':', ''));
  headers.set('X-Forwarded-For', request.headers.get('cf-connecting-ip') || '');

  let body: ArrayBuffer | null = null;
  if (!['GET', 'HEAD'].includes(request.method)) {
    body = await request.arrayBuffer();
  }

  try {
    const backendResponse = await fetch(targetUrl.toString(), {
      method: request.method,
      headers,
      body,
      redirect: 'manual',
    });

    const responseHeaders = new Headers(backendResponse.headers);
    // Same transport-header hygiene as the API proxy: strip anything that lets
    // a streaming body fool a browser into an EOF error.
    responseHeaders.delete('content-length');
    responseHeaders.delete('content-encoding');
    responseHeaders.delete('transfer-encoding');
    responseHeaders.delete('connection');

    return new Response(backendResponse.body, {
      status: backendResponse.status,
      statusText: backendResponse.statusText,
      headers: responseHeaders,
    });
  } catch (err: any) {
    console.error('[CF Auth Proxy] Failed to fetch:', err);
    return new Response(
      JSON.stringify({
        success: false,
        source: 'cloudflare-auth-proxy',
        error: 'Auth helper unavailable',
        message: 'The proxy was unable to reach the Firebase auth helper.',
      }),
      {
        status: 502,
        headers: { 'Content-Type': 'application/json' },
      },
    );
  }
};

type PagesFunction = (context: {
  request: Request;
  env: Record<string, string | undefined>;
  params?: Record<string, string | string[]>;
  waitUntil?: (promise: Promise<unknown>) => void;
  next?: (input?: RequestInfo, init?: RequestInit) => Promise<Response>;
  data?: Record<string, unknown>;
}) => Promise<Response> | Response;