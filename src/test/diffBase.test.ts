import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { execSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { getBaseRef, getChangedFiles, getFileDiff } from "../../scripts/_diff-base";

const git = (cmd: string) => execSync(`git ${cmd}`, { encoding: "utf8", stdio: ["pipe", "pipe", "ignore"] }).trim();

function commitFile(file: string, body: string, msg: string) {
  mkdirSync(join(process.cwd(), file, ".."), { recursive: true });
  writeFileSync(join(process.cwd(), file), body);
  git(`add ${file}`);
  git(`commit -q -m "${msg}"`);
}

describe("_diff-base — base resolution", () => {
  let dir: string;
  let prevCwd: string;

  beforeEach(() => {
    prevCwd = process.cwd();
    dir = mkdtempSync(join(tmpdir(), "diff-base-"));
    process.chdir(dir);
    git("init -q -b main");
    git("config user.email t@example.com");
    git("config user.name t");
    git("config commit.gpgsign false");
    commitFile("README.md", "x\n", "root");
    // A PR branch adds one file while main moves on, then GitHub's merge ref
    // joins them: HEAD^1 = main tip, HEAD^2 = PR head.
    git("checkout -q -b feature");
    commitFile("src/a.ts", "export const a = 1;\n", "feature");
    git("checkout -q main");
    commitFile("src/main-only.ts", "export const m = 1;\n", "main moved");
    git("merge -q --no-ff --no-edit feature");
  });

  afterEach(() => {
    process.chdir(prevCwd);
    rmSync(dir, { recursive: true, force: true });
  });

  it("uses an explicit CLI base when given", () => {
    expect(getBaseRef(["node", "script", "abc123"], { GITHUB_EVENT_NAME: "pull_request" })).toEqual({
      ref: "abc123",
      branch: "main",
    });
  });

  it("uses the merge commit's base parent on a pull_request merge checkout", () => {
    const { ref } = getBaseRef(["node", "script"], { GITHUB_EVENT_NAME: "pull_request", GITHUB_BASE_REF: "main" });
    expect(ref).toBe("HEAD^1");
    expect(getChangedFiles(ref)).toEqual(["src/a.ts"]);
    expect(getFileDiff(ref, "src/a.ts")).toContain("+export const a = 1;");
  });

  it("falls back to origin/<base> outside a pull_request merge checkout", () => {
    expect(getBaseRef(["node", "script"], { GITHUB_BASE_REF: "dev" })).toEqual({ ref: "origin/dev", branch: "dev" });
    git("checkout -q feature");
    expect(getBaseRef(["node", "script"], { GITHUB_EVENT_NAME: "pull_request" }).ref).toBe("origin/main");
  });

  it("never throws when the base shares no merge base with HEAD", () => {
    // Mimics a re-fetched main tip that is outside a shallow checkout's history.
    git("checkout -q --orphan unrelated");
    commitFile("other.txt", "y\n", "unrelated");
    git("update-ref refs/remotes/origin/main HEAD");
    git("checkout -q main");

    expect(() => getChangedFiles("origin/main")).not.toThrow();
    expect(() => getFileDiff("origin/main", "src/a.ts")).not.toThrow();
    // Falls back to the previous commit, like getChangedFiles does.
    expect(getFileDiff("origin/main", "src/a.ts")).toContain("+export const a = 1;");
  });
});
