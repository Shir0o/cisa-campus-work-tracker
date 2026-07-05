import crypto from "crypto";

// Minimal shape of an Express request needed to verify a Twilio webhook —
// kept structural (rather than importing `express`) so this stays a small,
// dependency-free module usable from server.ts without pulling the Express
// app into unit tests.
export interface TwilioVerifiableRequest {
  headers: Record<string, string | string[] | undefined>;
  body: Record<string, string>;
  protocol: string;
  originalUrl: string;
  get(name: string): string | undefined;
}

// Verifies an inbound Twilio webhook request per Twilio's request-validation
// algorithm: HMAC-SHA1 of the webhook URL + sorted POST params, keyed by the
// account's auth token, base64-encoded, compared to X-Twilio-Signature.
export function verifyTwilioRequest(req: TwilioVerifiableRequest, authToken: string): boolean {
  const signature = req.headers["x-twilio-signature"] as string | undefined;
  if (!signature) return false;

  const url = `${process.env.APP_URL || `${req.protocol}://${req.get("host")}`}${req.originalUrl}`;
  const params = req.body || {};
  const data = Object.keys(params)
    .sort()
    .reduce((acc, key) => acc + key + params[key], url);

  const expected = crypto.createHmac("sha1", authToken).update(Buffer.from(data, "utf-8")).digest("base64");

  try {
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
  } catch {
    return false;
  }
}
