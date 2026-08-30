import { describe, it, expect } from "vitest";
import {
  findViolations,
  isCommentLine,
  isTargetFile,
  parseUnifiedDiff,
} from "../../scripts/check-hardcoded-colors";

describe("check-hardcoded-colors — findViolations", () => {
  it("flags 6-digit hex colours", () => {
    const v = findViolations(`const dot = '#FF0000';`);
    expect(v).toHaveLength(1);
    expect(v[0]).toMatchObject({ match: "#FF0000", kind: "hex" });
  });

  it("flags 3-digit hex colours", () => {
    const v = findViolations(`const dot = '#fff';`);
    expect(v).toHaveLength(1);
    expect(v[0]).toMatchObject({ match: "#fff", kind: "hex" });
  });

  it("flags 8-digit hex (with alpha)", () => {
    const v = findViolations(`const a = '#abcdef12';`);
    expect(v).toHaveLength(1);
    expect(v[0]).toMatchObject({ match: "#abcdef12", kind: "hex" });
  });

  it("flags 4-digit hex (shorthand with alpha)", () => {
    const v = findViolations(`const a = '#abcd';`);
    expect(v).toHaveLength(1);
    expect(v[0]).toMatchObject({ kind: "hex" });
  });

  it("flags multiple hex values on one line", () => {
    const v = findViolations(`from-[#ff0000] to-[#00ff00]`);
    expect(v).toHaveLength(2);
    expect(v.map((x) => x.match).sort()).toEqual(["#00ff00", "#ff0000"]);
  });

  it("flags Tailwind palette utilities", () => {
    expect(findViolations(`className="bg-red-500"`)[0]).toMatchObject({
      match: "bg-red-500",
      kind: "palette",
    });
    expect(findViolations(`className="text-blue-600"`)[0]).toMatchObject({
      match: "text-blue-600",
      kind: "palette",
    });
    expect(findViolations(`className="border-slate-200"`)[0]).toMatchObject({
      match: "border-slate-200",
      kind: "palette",
    });
  });

  it("flags the full prefix list — ring, outline, fill, stroke, shadow, divide, etc.", () => {
    const prefixes = [
      "bg-red-500", "text-red-500", "border-red-500",
      "ring-red-500", "outline-red-500", "fill-red-500",
      "stroke-red-500", "shadow-red-500", "divide-red-500",
      "placeholder-red-500", "caret-red-500", "accent-red-500",
      "decoration-red-500", "from-red-500", "to-red-500",
      "via-red-500",
    ];
    for (const cls of prefixes) {
      const v = findViolations(`className="${cls}"`);
      expect(v, cls).toHaveLength(1);
      expect(v[0].kind, cls).toBe("palette");
    }
  });

  it("flags every built-in palette colour", () => {
    const colours = [
      "slate", "gray", "zinc", "neutral", "stone",
      "red", "orange", "amber", "yellow", "lime",
      "green", "emerald", "teal", "cyan", "sky",
      "blue", "indigo", "violet", "purple", "fuchsia",
      "pink", "rose",
    ];
    for (const colour of colours) {
      const v = findViolations(`className="bg-${colour}-500"`);
      expect(v, colour).toHaveLength(1);
    }
  });

  it("does NOT flag token utilities (bg-surface, text-on-surface, etc.)", () => {
    const tokens = [
      `className="bg-surface"`,
      `className="text-on-surface"`,
      `className="border-outline-variant"`,
      `className="bg-primary"`,
      `className="text-on-primary"`,
      `className="ring-color-stage-accent"`,
    ];
    for (const line of tokens) {
      expect(findViolations(line), line).toHaveLength(0);
    }
  });

  it("does NOT flag classes that merely contain a palette colour name", () => {
    expect(findViolations(`className="bg-blueprint"`)).toHaveLength(0);
    expect(findViolations(`className="text-readable"`)).toHaveLength(0);
  });

  it("does NOT flag arbitrary value classes like bg-[#var]", () => {
    // `bg-[var(--accent)]` is a token reference, not a raw hex.
    expect(findViolations(`className="bg-[var(--accent)]"`)).toHaveLength(0);
  });

  it("returns empty for a line with no colour values", () => {
    expect(findViolations(`const name = "Hello";`)).toHaveLength(0);
    expect(findViolations(``)).toHaveLength(0);
    expect(findViolations(`  `)).toHaveLength(0);
  });
});

describe("check-hardcoded-colors — isCommentLine", () => {
  it("skips single-line `//` comments", () => {
    expect(isCommentLine(`// see issue (#563)`)).toBe(true);
    expect(isCommentLine(`   // comment`)).toBe(true);
  });

  it("skips block-comment openers", () => {
    expect(isCommentLine(`/* ref (#547) */`)).toBe(true);
    expect(isCommentLine(`/*`)).toBe(true);
  });

  it("skips block-comment continuation lines (leading `*`)", () => {
    expect(isCommentLine(` * inline (#661) reference`)).toBe(true);
    expect(isCommentLine(`* line`)).toBe(true);
  });

  it("does NOT skip code lines", () => {
    expect(isCommentLine(`const x = 1;`)).toBe(false);
    expect(isCommentLine(`className="bg-red-500"`)).toBe(false);
  });

  it("does NOT skip lines with trailing comments (hex is still a violation)", () => {
    expect(isCommentLine(`const c = '#ff0000'; // red`)).toBe(false);
  });
});

describe("check-hardcoded-colors — isTargetFile", () => {
  it("accepts web component source", () => {
    expect(isTargetFile(`src/components/Foo.tsx`)).toBe(true);
    expect(isTargetFile(`src/lib/bar.ts`)).toBe(true);
  });

  it("accepts mobile component source", () => {
    expect(isTargetFile(`apps/mobile/src/components/Foo.tsx`)).toBe(true);
    expect(isTargetFile(`apps/mobile/src/lib/bar.ts`)).toBe(true);
  });

  it("rejects the stylesheet so CSS custom-property definitions are not flagged", () => {
    expect(isTargetFile(`src/index.css`)).toBe(false);
  });

  it("rejects files outside the scanned trees", () => {
    expect(isTargetFile(`scripts/check-hardcoded-colors.ts`)).toBe(false);
    expect(isTargetFile(`packages/core/src/foo.ts`)).toBe(false);
    expect(isTargetFile(`server.ts`)).toBe(false);
    expect(isTargetFile(`e2e/something.spec.ts`)).toBe(false);
  });

  it("rejects non-source files inside the trees", () => {
    expect(isTargetFile(`src/locales/en.json`)).toBe(false);
    expect(isTargetFile(`src/index.html`)).toBe(false);
  });
});

describe("check-hardcoded-colors — parseUnifiedDiff", () => {
  it("extracts added lines with their post-image line numbers", () => {
    // The hunk `@@ -1,3 +1,4 @@` means the post-image starts at line 1.
    // Added lines within the hunk are numbered 1 and 2 by count of `+` lines
    // seen (not by absolute post-image line), mirroring the i18n guard's
    // counting rule: context lines don't advance the counter.
    const diff = [
      `@@ -1,3 +1,4 @@`,
      ` const a = 1;`,
      `+const b = '#ff0000';`,
      ` const c = 3;`,
      `+`,
    ].join("\n");
    const hits = parseUnifiedDiff(diff);
    expect(hits).toEqual([
      { file: "", line: 1, text: `const b = '#ff0000';` },
      { file: "", line: 2, text: "" },
    ]);
  });

  it("uses the post-image starting line for a single-line hunk", () => {
    // `@@ -1279 +1279 @@` starts the post-image at line 1279, so the single
    // added line is reported as line 1279.
    const diff = [
      `@@ -1279 +1279 @@ export default function MyDay() {`,
      `-                        checked ? "bg-accent-soft" : "hover:bg-surface-variant",`,
      `+                        checked ? "bg-primary text-on-primary" : "hover:bg-surface-variant",`,
    ].join("\n");
    const hits = parseUnifiedDiff(diff);
    expect(hits).toEqual([
      { file: "", line: 1279, text: `                        checked ? "bg-primary text-on-primary" : "hover:bg-surface-variant",` },
    ]);
  });

  it("resets the line counter at each hunk header", () => {
    const diff = [
      `@@ -10,2 +10,2 @@`,
      ` keep`,
      `+added in second hunk`,
    ].join("\n");
    const hits = parseUnifiedDiff(diff);
    expect(hits).toEqual([{ file: "", line: 10, text: `added in second hunk` }]);
  });

  it("ignores removed (`-`) and context lines", () => {
    const diff = [
      `@@ -1,3 +1,2 @@`,
      `-removed line`,
      ` kept`,
      `+added`,
    ].join("\n");
    const hits = parseUnifiedDiff(diff);
    expect(hits).toHaveLength(1);
    expect(hits[0].text).toBe(`added`);
  });

  it("returns no hits for an empty diff", () => {
    expect(parseUnifiedDiff(``)).toEqual([]);
  });

  it("returns no hits for a diff with only context and removals", () => {
    const diff = [`@@ -1,2 +1,2 @@`, ` keep`, `-removed`].join("\n");
    expect(parseUnifiedDiff(diff)).toEqual([]);
  });
});