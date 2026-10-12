import { describe, it, expect } from "vitest";
import {
  findDeadEntries,
  findUnguardedSeams,
  formatWarning,
  matchesGlob,
  parseSeamMap,
  type SeamMap,
} from "../../scripts/seam-rules";

describe("matchesGlob", () => {
  it("matches an exact path and nothing else", () => {
    expect(matchesGlob("firestore.rules", "firestore.rules")).toBe(true);
    expect(matchesGlob("firestore.rules.bak", "firestore.rules")).toBe(false);
    expect(matchesGlob("a/firestore.rules", "firestore.rules")).toBe(false);
  });

  it("treats * as one path segment and ** as any depth", () => {
    expect(matchesGlob("src/views/Directory.tsx", "src/views/*.tsx")).toBe(true);
    expect(matchesGlob("src/views/landings/LandingTrainee.tsx", "src/views/*.tsx")).toBe(false);
    expect(matchesGlob("src/views/landings/LandingTrainee.tsx", "src/views/**")).toBe(true);
    expect(matchesGlob("src/views/Directory.tsx", "src/**/Directory.tsx")).toBe(true);
    expect(matchesGlob("src/Directory.tsx", "src/**/Directory.tsx")).toBe(true);
  });

  it("escapes regex metacharacters in the glob", () => {
    expect(matchesGlob("src/views/[id].tsx", "src/views/[id].tsx")).toBe(true);
    expect(matchesGlob("firestore-rules", "firestore.rules")).toBe(false);
  });
});

const map: SeamMap = {
  seams: [
    {
      name: "rules",
      paths: ["firestore.rules"],
      guards: ["src/test/queryContract.test.ts"],
    },
    {
      name: "nav",
      paths: ["src/components/layout/*.tsx"],
      guards: ["e2e/journeys/student-community.spec.ts", "e2e/journeys/trainee.spec.ts"],
    },
  ],
};

describe("findDeadEntries", () => {
  const files = [
    "firestore.rules",
    "src/test/queryContract.test.ts",
    "src/components/layout/NavRail.tsx",
    "e2e/journeys/student-community.spec.ts",
    "e2e/journeys/trainee.spec.ts",
  ];

  it("returns nothing when every path and guard matches a file", () => {
    expect(findDeadEntries(map, files)).toEqual([]);
  });

  it("names a path that matches no file", () => {
    const dead = findDeadEntries(map, files.filter((f) => f !== "firestore.rules"));
    expect(dead).toEqual([{ seam: "rules", kind: "path", pattern: "firestore.rules" }]);
  });

  it("names a guard that matches no file", () => {
    const dead = findDeadEntries(map, files.filter((f) => !f.endsWith("trainee.spec.ts")));
    expect(dead).toEqual([
      { seam: "nav", kind: "guard", pattern: "e2e/journeys/trainee.spec.ts" },
    ]);
  });

  it("flags a glob that matches nothing", () => {
    const dead = findDeadEntries(map, files.filter((f) => !f.includes("layout")));
    expect(dead).toEqual([{ seam: "nav", kind: "path", pattern: "src/components/layout/*.tsx" }]);
  });
});

describe("findUnguardedSeams", () => {
  it("is empty when the PR touches no seam", () => {
    expect(findUnguardedSeams(map, ["README.md", "src/lib/utils.ts"])).toEqual([]);
  });

  it("reports a seam whose path changed with no guard changed", () => {
    expect(findUnguardedSeams(map, ["firestore.rules", "README.md"])).toEqual([
      {
        seam: "rules",
        touched: ["firestore.rules"],
        guards: ["src/test/queryContract.test.ts"],
      },
    ]);
  });

  it("stays quiet when any one of the guards changed too", () => {
    expect(
      findUnguardedSeams(map, ["src/components/layout/NavRail.tsx", "e2e/journeys/trainee.spec.ts"]),
    ).toEqual([]);
  });

  it("reports each unguarded seam once, listing every touched file", () => {
    const out = findUnguardedSeams(map, [
      "src/components/layout/NavRail.tsx",
      "src/components/layout/TopNav.tsx",
      "firestore.rules",
    ]);
    expect(out.map((o) => o.seam)).toEqual(["rules", "nav"]);
    expect(out[1].touched).toEqual([
      "src/components/layout/NavRail.tsx",
      "src/components/layout/TopNav.tsx",
    ]);
  });
});

describe("formatWarning", () => {
  it("renders a GitHub ::warning:: annotation naming the seam, files and guards", () => {
    const line = formatWarning({
      seam: "rules",
      touched: ["firestore.rules"],
      guards: ["src/test/queryContract.test.ts", "e2e/journeys/trainee.spec.ts"],
    });
    expect(line.startsWith("::warning title=Seam changed without its guard::")).toBe(true);
    expect(line).toContain("rules");
    expect(line).toContain("firestore.rules");
    expect(line).toContain("src/test/queryContract.test.ts");
    expect(line).toContain("e2e/journeys/trainee.spec.ts");
    expect(line).not.toContain("\n");
  });
});

describe("parseSeamMap", () => {
  it("accepts a well-formed map", () => {
    expect(parseSeamMap(JSON.stringify(map))).toEqual(map);
  });

  it.each([
    ["not json", "{"],
    ["no seams array", JSON.stringify({})],
    ["a seam without a name", JSON.stringify({ seams: [{ paths: ["a"], guards: ["b"] }] })],
    ["a seam without paths", JSON.stringify({ seams: [{ name: "x", paths: [], guards: ["b"] }] })],
    ["a seam without guards", JSON.stringify({ seams: [{ name: "x", paths: ["a"], guards: [] }] })],
    [
      "a duplicate seam name",
      JSON.stringify({
        seams: [
          { name: "x", paths: ["a"], guards: ["b"] },
          { name: "x", paths: ["a"], guards: ["b"] },
        ],
      }),
    ],
  ])("rejects %s", (_label, text) => {
    expect(() => parseSeamMap(text)).toThrow();
  });
});
