import { describe, it, expect, afterEach } from "vitest";
import crypto from "crypto";
import { verifyTwilioRequest, type TwilioVerifiableRequest } from "../lib/twilioVerify";

function fakeRequest(opts: { path: string; body: Record<string, string>; signature?: string }): TwilioVerifiableRequest {
  return {
    headers: opts.signature ? { "x-twilio-signature": opts.signature } : {},
    body: opts.body,
    protocol: "https",
    originalUrl: opts.path,
    get: () => "example.com",
  };
}

function signFor(url: string, body: Record<string, string>, authToken: string): string {
  const data = Object.keys(body)
    .sort()
    .reduce((acc, key) => acc + key + body[key], url);
  return crypto.createHmac("sha1", authToken).update(Buffer.from(data, "utf-8")).digest("base64");
}

describe("verifyTwilioRequest", () => {
  const authToken = "test-auth-token";
  const path = "/api/webhook/sms";
  const url = "https://example.com" + path;
  const body = { Body: "Met John at the library", From: "+15551234567" };

  afterEach(() => {
    delete process.env.APP_URL;
  });

  it("accepts a request with a valid signature", () => {
    process.env.APP_URL = "https://example.com";
    const signature = signFor(url, body, authToken);
    const req = fakeRequest({ path, body, signature });
    expect(verifyTwilioRequest(req, authToken)).toBe(true);
  });

  it("rejects a request with an invalid signature", () => {
    process.env.APP_URL = "https://example.com";
    const req = fakeRequest({ path, body, signature: "bogus-signature==" });
    expect(verifyTwilioRequest(req, authToken)).toBe(false);
  });

  it("rejects a request with no signature header", () => {
    const req = fakeRequest({ path, body });
    expect(verifyTwilioRequest(req, authToken)).toBe(false);
  });

  it("rejects when the body has been tampered with after signing", () => {
    process.env.APP_URL = "https://example.com";
    const signature = signFor(url, body, authToken);
    const tamperedReq = fakeRequest({ path, body: { ...body, From: "+19998887777" }, signature });
    expect(verifyTwilioRequest(tamperedReq, authToken)).toBe(false);
  });

  it("falls back to req.protocol + host when APP_URL is unset", () => {
    const signature = signFor(url, body, authToken);
    const req = fakeRequest({ path, body, signature });
    expect(verifyTwilioRequest(req, authToken)).toBe(true);
  });

  it("treats a missing body as an empty object", () => {
    process.env.APP_URL = "https://example.com";
    const signature = signFor(url, {}, authToken);
    const req = fakeRequest({ path, body: undefined as any, signature });
    expect(verifyTwilioRequest(req, authToken)).toBe(true);
  });
});
