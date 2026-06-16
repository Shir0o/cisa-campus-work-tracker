interface Env {
  BACKEND_API_URL?: string;
}

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
