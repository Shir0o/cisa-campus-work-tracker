import { describe, it, expect, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  collectUsedMobileKeys,
  resolvesKey,
  findMissingMobileKeys,
  checkMobileI18n,
} from "../../scripts/check-hardcoded-ui-strings";

const tempDirs: string[] = [];

function makeSourceDir(files: Record<string, string>): string {
  const dir = mkdtempSync(join(tmpdir(), "mobile-i18n-"));
  tempDirs.push(dir);
  for (const [name, content] of Object.entries(files)) {
    const full = join(dir, name);
    mkdirSync(join(full, ".."), { recursive: true });
    writeFileSync(full, content);
  }
  return dir;
}

afterEach(() => {
  while (tempDirs.length > 0) rmSync(tempDirs.pop()!, { recursive: true, force: true });
});

describe("check-hardcoded-ui-strings — collectUsedMobileKeys", () => {
  it("collects static t('mobile.…') keys across the source tree", () => {
    const dir = makeSourceDir({
      "components/A.tsx": `const a = t('mobile.nav.today');`,
      "lib/b.ts": `const b = t(\`mobile.settings.title\`);`,
    });
    expect(collectUsedMobileKeys(dir).sort()).toEqual([
      "mobile.nav.today",
      "mobile.settings.title",
    ]);
  });

  it("ignores non-mobile keys, interpolated template keys, other calls and test files", () => {
    const dir = makeSourceDir({
      "a.tsx": [
        "const a = t(`mobile.board.audience_${audience}`);",
        "const b = t('actions.cancel');",
        "const c = translate('mobile.nav.today');",
        "const d = t(variable);",
      ].join("\n"),
      "b.test.tsx": `const x = t('mobile.missing.in.a.test');`,
    });
    expect(collectUsedMobileKeys(dir)).toEqual([]);
  });
});

describe("check-hardcoded-ui-strings — resolvesKey", () => {
  const dict = { mobile: { nav: { today: "Today" } }, actions: { cancel: "Cancel" } };

  it("resolves a nested string key", () => {
    expect(resolvesKey(dict, "mobile.nav.today")).toBe(true);
    expect(resolvesKey(dict, "actions.cancel")).toBe(true);
  });

  it("rejects a missing key or a key that lands on an object", () => {
    expect(resolvesKey(dict, "mobile.contact.how_we_met")).toBe(false);
    expect(resolvesKey(dict, "mobile.nav")).toBe(false);
  });
});

describe("check-hardcoded-ui-strings — findMissingMobileKeys", () => {
  it("reports a key missing from the phone locale (#1471)", () => {
    const usedKeys = ["mobile.contact.how_we_met"];
    const en = { mobile: { contact: {} } };
    const es = { mobile: { contact: { how_we_met: "Cómo nos conocimos" } } };

    expect(findMissingMobileKeys(usedKeys, { en, es })).toEqual([
      { lang: "en", key: "mobile.contact.how_we_met" },
    ]);
  });

  it("passes when every used key resolves in every locale", () => {
    const usedKeys = ["actions.cancel"];
    const en = { actions: { cancel: "Cancel" } };
    const es = { actions: { cancel: "Cancelar" } };
    expect(findMissingMobileKeys(usedKeys, { en, es })).toEqual([]);
  });
});

describe("check-hardcoded-ui-strings — checkMobileI18n", () => {
  it("every t('…') key in apps/mobile/src exists in the mobile locales", () => {
    expect(checkMobileI18n()).toEqual([]);
  });
});
