import crypto from "crypto";
import { ipKeyGenerator } from "express-rate-limit";

// Small, shared checks for the routes that strangers can reach: who is
// calling (for rate limits) and whether a shared secret matches.

/** Production fails closed: a webhook or automation route whose secret is not
 *  configured refuses every request instead of trusting all of them. Local dev
 *  and the test suite keep the old, unverified behaviour. */
export function failsClosed(): boolean {
  return process.env.NODE_ENV === "production";
}

/** Constant-time comparison through fixed-length digests, so a wrong value
 *  cannot be probed by length or timing. Empty or non-string values never
 *  match. */
export function secretMatches(provided: unknown, expected: unknown): boolean {
  if (typeof provided !== "string" || typeof expected !== "string") return false;
  if (!provided || !expected) return false;
  const a = crypto.createHash("sha256").update(provided).digest();
  const b = crypto.createHash("sha256").update(expected).digest();
  return crypto.timingSafeEqual(a, b);
}

type HeaderReader = {
  ip?: string;
  get(name: string): string | undefined;
};

/**
 * The address a rate limit should count against.
 *
 * Cloud Run's front end appends the connecting address to X-Forwarded-For, so
 * with `trust proxy` set to one hop `req.ip` is the real caller for a direct
 * request. A request through the Cloudflare proxy arrives from Cloudflare,
 * though, so the proxy passes the visitor's address in X-Client-IP. That
 * header is only believed when the proxy also proves itself with the shared
 * PROXY_SHARED_SECRET; anyone else could set it to dodge the limit.
 */
export function clientAddress(req: HeaderReader): string {
  const secret = process.env.PROXY_SHARED_SECRET;
  if (secret && secretMatches(req.get("x-proxy-secret"), secret)) {
    const forwarded = (req.get("x-client-ip") || "").trim();
    if (forwarded) return forwarded;
  }
  return req.ip || "unknown";
}

/** keyGenerator for express-rate-limit: one bucket per caller, with IPv6
 *  callers grouped by subnet as the library recommends. */
export function rateLimitKey(req: HeaderReader): string {
  return ipKeyGenerator(clientAddress(req));
}
