// Cloudflare Pages Function Proxy for Campus Hub API & Webhooks
// Intercepts all '/api/*' requests and forwards them to the active backend app container.

interface Env {
  // Developer can provide a custom backend server url inside Cloudflare Pages Settings -> Environment Variables.
  // Defaults to the original Cloud Run application hosting the production API and database.
  BACKEND_API_URL?: string;
}

export const onRequest: PagesFunction<Env> = async (context) => {
  const { request, env } = context;
  const url = new URL(request.url);

  // 1. Establish Backend Destination Host
  const backendBaseUrl = env.BACKEND_API_URL || "https://ais-pre-ziirfaj5atjrwm6w4t7gn4-82064505754.us-east1.run.app";

  // Re-build the target destination URL path with query parameters intact
  const targetUrl = new URL(url.pathname + url.search, backendBaseUrl);

  // 2. Handle HTTP OPTIONS preflight request for cross-origin compliance
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

  // 3. Prepare payload and forward custom proxy headers
  const body = ["GET", "HEAD"].includes(request.method) ? null : await request.arrayBuffer();

  const headers = new Headers(request.headers);
  headers.set("X-Forwarded-Host", url.host);
  headers.set("X-Forwarded-Proto", url.protocol.replace(":", ""));
  headers.set("X-Forwarded-For", request.headers.get("cf-connecting-ip") || "");

  try {
    // Forward the request to the live multi-regional backend app container
    const backendResponse = await fetch(targetUrl.toString(), {
      method: request.method,
      headers: headers,
      body: body,
      redirect: "manual",
    });

    const responseHeaders = new Headers(backendResponse.headers);
    responseHeaders.set("X-Proxied-By", "Cloudflare-Pages-Function");
    
    // Support wildcard CORS when requested externally (such as from Siri, Twilio, or webhooks)
    responseHeaders.set("Access-Control-Allow-Origin", "*");

    return new Response(backendResponse.body, {
      status: backendResponse.status,
      statusText: backendResponse.statusText,
      headers: responseHeaders,
    });
  } catch (error: any) {
    console.error("Cloudflare Pages Function Proxy Error: ", error);
    
    return new Response(
      JSON.stringify({
        success: false,
        source: "cloudflare-pages-function-proxy",
        error: "Gateway Proxy Failure",
        message: "Failed to forward request cleanly to the Campus Hub API backend container.",
        details: error.message || String(error),
        timestamp: new Date().toISOString(),
      }),
      {
        status: 502,
        headers: {
          "Content-Type": "application/json",
          "X-Proxied-By": "Cloudflare-Pages-Function",
          "Access-Control-Allow-Origin": "*",
        },
      }
    );
  }
};
