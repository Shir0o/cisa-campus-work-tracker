// Same-origin Firebase Auth helper proxy (#557) — `__/firebase/init.json`.
//
// The auth helper page (`__/auth/handler`) loads `__/firebase/init.json` from
// the SAME origin to learn the project's config (apiKey, authDomain, ...). On
// Firebase Hosting that file is generated automatically; on Cloudflare Pages it
// has to be served by the app. This route answers it with the web app's own
// config so the same-origin helper (functions/__/auth/[[path]].ts) can
// bootstrap. The values mirror firebase-applet-config.json + the build-time
// apiKey, so a stale bundle can't drift from what the SDK actually signed in
// with.

export const onRequest: PagesFunction = async (context) => {
  const { env } = context;
  const body = {
    appId: '1:914549253362:web:8a1b1aeca702d3ba0f1c6b',
    apiKey: env.VITE_FIREBASE_API_KEY || 'AIzaSyDRfV-CsMsfOzNHz3jM_BqrKEeuw4U4W3k',
    authDomain: env.VITE_FIREBASE_AUTH_DOMAIN || 'cisa-campus-work-traker.pages.dev',
    projectId: env.VITE_FIREBASE_PROJECT_ID || 'sac-campus-hub',
    storageBucket: 'sac-campus-hub.firebasestorage.app',
    messagingSenderId: '914549253362',
    measurementId: '',
  };
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'public, max-age=3600',
    },
  });
};

type PagesFunction = (context: {
  request: Request;
  env: Record<string, string | undefined>;
  params?: Record<string, string | string[]>;
  waitUntil?: (promise: Promise<unknown>) => void;
  next?: (input?: RequestInfo, init?: RequestInit) => Promise<Response>;
  data?: Record<string, unknown>;
}) => Promise<Response> | Response;