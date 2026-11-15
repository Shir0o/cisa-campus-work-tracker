import { afterEach, describe, expect, it, vi } from "vitest";
import { clientAddress, failsClosed, secretMatches } from "../server/requestGuards";

const req = (ip: string, headers: Record<string, string> = {}) => ({
  ip,
  get: (name: string) => headers[name.toLowerCase()],
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("clientAddress", () => {
  it("uses the connecting address when the proxy has not proved itself", () => {
    vi.stubEnv("PROXY_SHARED_SECRET", "proxy-secret");
    // A direct caller cannot pick its own rate-limit bucket by setting the header.
    expect(clientAddress(req("203.0.113.9", { "x-client-ip": "198.51.100.1" }))).toBe("203.0.113.9");
    expect(
      clientAddress(req("203.0.113.9", { "x-client-ip": "198.51.100.1", "x-proxy-secret": "wrong" })),
    ).toBe("203.0.113.9");
  });

  it("uses the visitor address the proxy vouches for", () => {
    vi.stubEnv("PROXY_SHARED_SECRET", "proxy-secret");
    expect(
      clientAddress(req("104.16.0.1", { "x-client-ip": "198.51.100.1", "x-proxy-secret": "proxy-secret" })),
    ).toBe("198.51.100.1");
  });

  it("ignores the forwarded address when no proxy secret is configured", () => {
    vi.stubEnv("PROXY_SHARED_SECRET", "");
    expect(clientAddress(req("104.16.0.1", { "x-client-ip": "198.51.100.1", "x-proxy-secret": "" }))).toBe(
      "104.16.0.1",
    );
  });
});

describe("secretMatches", () => {
  it("matches only the exact, non-empty secret", () => {
    expect(secretMatches("abc", "abc")).toBe(true);
    expect(secretMatches("abd", "abc")).toBe(false);
    expect(secretMatches("abcd", "abc")).toBe(false);
    expect(secretMatches("", "")).toBe(false);
    expect(secretMatches(undefined, "abc")).toBe(false);
    expect(secretMatches("abc", undefined)).toBe(false);
  });
});

describe("failsClosed", () => {
  it("is on in production only", () => {
    vi.stubEnv("NODE_ENV", "production");
    expect(failsClosed()).toBe(true);
    vi.stubEnv("NODE_ENV", "test");
    expect(failsClosed()).toBe(false);
  });
});
