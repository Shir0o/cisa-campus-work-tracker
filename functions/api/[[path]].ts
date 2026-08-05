interface Env {
  BACKEND_API_URL?: string;
}

type PagesFunction<Env = any> = (context: {
  request: Request;
  env: Env;
  params?: Record<string, string | string[]>;
  waitUntil?: (promise: Promise<any>) => void;
  next?: (input?: RequestInfo, init?: RequestInit) => Promise<Response>;
  data?: Record<string, any>;
}) => Promise<Response> | Response;

export const onRequest: PagesFunction<Env> = async (context) => {
  const { request, env } = context;
  const url = new URL(request.url);

  console.log(`[CF Proxy] Intercepted request: ${request.method} "${url.pathname}${url.search}"`);

  // Establish Backend Destination Host on GCP Cloud Run
  const backendBaseUrl = env.BACKEND_API_URL || "https://campus-hub-backend-d2h5m26nrq-wl.a.run.app";
  const targetUrl = new URL(url.pathname + url.search, backendBaseUrl);

  console.log(`[CF Proxy] Forwarding to: "${targetUrl.toString()}"`);

  // Handle HTTP OPTIONS preflight request for cross-origin compliance
  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Requested-With, X-Twilio-Signature, X-Signature-Ed25519",
        "Access-Control-Max-Age": "86400",
      },
    });
  }

  // Clone headers and include CF client IP
  const headers = new Headers(request.headers);
  headers.set("X-Forwarded-Host", url.host);
  headers.set("X-Forwarded-Proto", url.protocol.replace(":", ""));
  headers.set("X-Forwarded-For", request.headers.get("cf-connecting-ip") || "");

  // Request Body Forwarding for POST/PUT requests
  let body: ArrayBuffer | null = null;
  if (!["GET", "HEAD"].includes(request.method)) {
    body = await request.arrayBuffer();
  }

  try {
    const backendResponse = await fetch(targetUrl.toString(), {
      method: request.method,
      headers: headers,
      body: body,
      redirect: "manual",
    });

    const responseHeaders = new Headers(backendResponse.headers);
    responseHeaders.set("X-Proxied-By", "Cloudflare-Pages-Function-Proxy");
    responseHeaders.set("Access-Control-Allow-Origin", "*");

    // Strip transport and content transformation headers to prevent Safari EOF error
    // when streaming decompressed response bodies back to the browser.
    responseHeaders.delete("content-length");
    responseHeaders.delete("content-encoding");
    responseHeaders.delete("transfer-encoding");
    responseHeaders.delete("connection");

    return new Response(backendResponse.body, {
      status: backendResponse.status,
      statusText: backendResponse.statusText,
      headers: responseHeaders,
    });
  } catch (err: any) {
    console.error("[CF Proxy] Failed to fetch: ", err);
    return new Response(
      JSON.stringify({
        success: false,
        source: "cloudflare-pages-proxy",
        error: "Gateway Request failure",
        message: "The proxy was unable to route request to the backend server.",
        details: err.message || String(err),
      }),
      {
        status: 502,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
      }
    );
  }
};
