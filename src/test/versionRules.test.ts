import { describe, it, expect } from "vitest";
import {
  applyVersion,
  deriveVersion,
  evaluateVersionConsistency,
  resolveVersion,
} from "../../scripts/version-rules";

describe("deriveVersion", () => {
  it("encodes a v-prefixed release tag", () => {
    expect(deriveVersion("v1.4.0")).toEqual({ version: "1.4.0", buildNumber: 10400 });
  });
});

describe("deriveVersion bounds and forms", () => {
  it("accepts a bare version and a prerelease tag", () => {
    expect(deriveVersion("1.4.0")).toEqual({ version: "1.4.0", buildNumber: 10400 });
    expect(deriveVersion("v1.4.0-rc.1")).toEqual({ version: "1.4.0", buildNumber: 10400 });
  });

  it("rejects a minor or patch component of 100 or more", () => {
    expect(() => deriveVersion("v1.100.0")).toThrow(/minor/);
    expect(() => deriveVersion("v1.4.100")).toThrow(/patch/);
  });

  it("rejects a build number above Android's ceiling", () => {
    expect(deriveVersion("v210000.0.0").buildNumber).toBe(2_100_000_000);
    expect(() => deriveVersion("v210001.0.0")).toThrow(/exceeds/);
  });

  it("rejects a malformed tag", () => {
    expect(() => deriveVersion("1.4")).toThrow(/Cannot parse/);
    expect(() => deriveVersion("not-a-tag")).toThrow(/Cannot parse/);
  });
});

describe("resolveVersion", () => {
  it("prefers an explicit tag over the nearest tag and the package version", () => {
    expect(
      resolveVersion({ explicitTag: "v2.0.0", nearestTag: "v1.9.0", packageVersion: "1.8.0" }),
    ).toBe("v2.0.0");
  });

  it("falls back to the nearest tag, then the package version", () => {
    expect(resolveVersion({ nearestTag: "v1.9.0", packageVersion: "1.8.0" })).toBe("v1.9.0");
    expect(resolveVersion({ packageVersion: "1.8.0" })).toBe("1.8.0");
  });

  it("ignores blank values", () => {
    expect(resolveVersion({ explicitTag: "   ", nearestTag: "v1.9.0", packageVersion: "1.8.0" })).toBe(
      "v1.9.0",
    );
  });

  it("throws when nothing can be resolved", () => {
    expect(() => resolveVersion({})).toThrow(/No version/);
  });
});

describe("applyVersion", () => {
  const base = {
    expo: {
      name: "CISA Campus Work Tracker",
      version: "1.0.1",
      ios: { bundleIdentifier: "com.cisa.campus", buildNumber: "1" },
      android: { package: "com.cisa.campus", versionCode: 1 },
    },
    extra: { eas: { projectId: "abc" } },
  };

  it("fills in the derived version and build numbers", () => {
    const out = applyVersion(base, { version: "1.5.0", buildNumber: 10500 });
    expect(out.expo.version).toBe("1.5.0");
    expect(out.expo.ios.buildNumber).toBe("10500");
    expect(out.expo.android.versionCode).toBe(10500);
  });

  it("preserves siblings and creates missing platform blocks", () => {
    const out = applyVersion(base, { version: "1.5.0", buildNumber: 10500 });
    expect(out.expo.name).toBe("CISA Campus Work Tracker");
    expect(out.expo.ios.bundleIdentifier).toBe("com.cisa.campus");
    expect(out.expo.android.package).toBe("com.cisa.campus");
    expect(out.extra).toEqual({ eas: { projectId: "abc" } });

    const bare = applyVersion({ expo: {} }, { version: "2.0.0", buildNumber: 20000 });
    expect(bare.expo.ios.buildNumber).toBe("20000");
    expect(bare.expo.android.versionCode).toBe(20000);
  });

  it("does not mutate its input", () => {
    const input = JSON.parse(JSON.stringify(base));
    applyVersion(input, { version: "9.9.9", buildNumber: 90900 });
    expect(input).toEqual(base);
  });
});

describe("evaluateVersionConsistency", () => {
  const clean = { expo: { name: "App", ios: { bundleIdentifier: "com.x" } } };

  it("fails when a version literal is committed back into the app config", () => {
    const withVersion = evaluateVersionConsistency({
      staticConfig: { expo: { version: "1.0.1" } },
      manifestVersions: [],
      latestTag: "v1.5.0",
    });
    expect(withVersion.failures).toHaveLength(1);
    expect(withVersion.failures[0]).toMatch(/expo\.version/);

    expect(
      evaluateVersionConsistency({
        staticConfig: { expo: { ios: { buildNumber: "1" } } },
        manifestVersions: [],
      }).failures[0],
    ).toMatch(/ios\.buildNumber/);

    expect(
      evaluateVersionConsistency({
        staticConfig: { expo: { android: { versionCode: 1 } } },
        manifestVersions: [],
      }).failures[0],
    ).toMatch(/android\.versionCode/);
  });

  it("passes a clean static config", () => {
    expect(
      evaluateVersionConsistency({ staticConfig: clean, manifestVersions: [], latestTag: "v1.5.0" }),
    ).toEqual({ failures: [], warnings: [] });
  });

  it("warns, without failing, when the newest notes lag the tag", () => {
    const result = evaluateVersionConsistency({
      staticConfig: clean,
      manifestVersions: ["1.4.0"],
      latestTag: "v1.5.0",
    });
    expect(result.failures).toEqual([]);
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]).toMatch(/1\.4\.0/);
  });

  it("is clean when notes are equal, ahead, absent, or the tag is unknown", () => {
    const cases = [
      { manifestVersions: ["1.5.0"], latestTag: "v1.5.0" },
      { manifestVersions: ["1.6.0"], latestTag: "v1.5.0" },
      { manifestVersions: [], latestTag: "v1.5.0" },
      { manifestVersions: ["1.6.0"], latestTag: undefined },
    ];
    for (const c of cases) {
      expect(evaluateVersionConsistency({ staticConfig: clean, ...c })).toEqual({
        failures: [],
        warnings: [],
      });
    }
  });
});
