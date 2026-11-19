import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { t, getDictionary } from "../lib/i18n";
import en from "../locales/en.json";

describe("i18n dictionary and helper", () => {
  it("returns English translation when language is en", () => {
    expect(t("nav.my_day", "en")).toBe("My Day");
    expect(t("actions.add_someone", "en")).toBe("Add someone");
    expect(t("actions.save", "en")).toBe("Save");
  });

  it("resolves only English: a stored Spanish preference falls back to English", () => {
    expect(t("nav.my_day", "es" as never)).toBe("My Day");
    expect(t("actions.save", "es" as never)).toBe("Save");
    expect(getDictionary("es" as never)).toEqual(en);
  });

  it("falls back to explicit fallback if key does not exist anywhere", () => {
    expect(t("non.existent.key", "en", "Custom Fallback")).toBe("Custom Fallback");
  });

  it("falls back to key if key does not exist and no fallback provided", () => {
    expect(t("non.existent.key", "en")).toBe("non.existent.key");
  });

  it("asks a grammatical discard question for every popup noun in use (#1444)", () => {
    // New nouns must be added here, so a new popup can't ship a capitalised
    // noun mid-sentence.
    const expected: Record<string, string> = {
      "attendance.rhythm_noun": "Discard this rhythm?",
      "modals.contact_noun": "Discard this contact?",
      "modals.gathering_noun": "Discard this gathering?",
      "modals.interaction_noun": "Discard this interaction?",
      "modals.quickAdd.noun": "Discard this note?",
      "modals.rhythm_noun": "Discard this rhythm?",
      "modals.smartImport.import_noun": "Discard this import?",
      "todoComposer.noun": "Discard this task?",
    };
    const root = join(process.cwd(), "src/components");
    const inUse = new Set<string>();
    for (const file of readdirSync(root, { recursive: true }) as string[]) {
      if (!file.endsWith(".tsx")) continue;
      const src = readFileSync(join(root, file), "utf8");
      for (const m of src.matchAll(/noun=\{t\(\s*["']([\w.]+)["']/g)) inUse.add(m[1]);
    }
    expect([...inUse].sort()).toEqual(Object.keys(expected).sort());

    for (const key of inUse) {
      expect(t("popup.discard_question", "en").replace("{noun}", t(key, "en"))).toMatch(/^Discard this [\w-]+\?$/);
    }
  });

  it("resolves every contactDetails key the page actually renders", () => {
    // #780 replaced `deleting` with `delete_contact_help` rather than adding
    // it, so the delete button's busy state rendered its raw key. Key parity
    // between en and es cannot catch that — both files lost it together — and
    // t() falls back to the key string rather than throwing.
    const contactFiles = [
      "src/components/modals/ContactDetailsModal.tsx",
      "src/components/contact/ContactAboutContent.tsx",
      "src/components/contact/ContactEditFooter.tsx",
      "src/lib/contactViewModel.ts",
      "src/hooks/useContactStory.ts",
    ];
    const src = contactFiles
      .map((f) => readFileSync(join(process.cwd(), f), "utf8"))
      .join("\n");
    const used = [
      ...new Set(
        [...src.matchAll(/t\(\s*['"](modals\.contactDetails\.[a-z0-9_]+)['"]/gi)].map(
          (m) => m[1],
        ),
      ),
    ].sort();
    expect(used.length).toBeGreaterThan(20);

    const unresolved = used.filter((key) => t(key, "en") === key);
    expect(unresolved, "contactDetails keys rendered with no translation").toEqual([]);
  });

  it("resolves every modals key LogInteractionModal actually renders", () => {
    const src = readFileSync(
      join(process.cwd(), "src/components/modals/LogInteractionModal.tsx"),
      "utf8",
    );
    const used = [
      ...new Set(
        [...src.matchAll(/t\(\s*['"](modals\.[a-z0-9_]+)['"]/gi)].map(
          (m) => m[1],
        ),
      ),
    ].sort();
    expect(used.length).toBeGreaterThan(12);

    const unresolved = used.filter((key) => t(key, "en") === key);
    expect(unresolved, "LogInteractionModal keys rendered with no translation").toEqual([]);
  });

  it("returns the dictionary object for a given language", () => {
    expect(getDictionary("en")).toEqual(en);
  });
});
