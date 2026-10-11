import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { t, getDictionary } from "../lib/i18n";
import en from "../locales/en.json";
import es from "../locales/es.json";

describe("i18n dictionary and helper", () => {
  it("returns English translation when language is en", () => {
    expect(t("nav.my_day", "en")).toBe("My Day");
    expect(t("actions.add_someone", "en")).toBe("Add someone");
    expect(t("actions.save", "en")).toBe("Save");
  });

  it("returns Spanish translation when language is es", () => {
    expect(t("nav.my_day", "es")).toBe("Mi Día");
    expect(t("actions.add_someone", "es")).toBe("Añadir persona");
    expect(t("actions.save", "es")).toBe("Guardar");
  });

  it("falls back to English if key is missing in Spanish", () => {
    expect(t("nav.my_day", "es")).toBe("Mi Día");
  });

  it("falls back to explicit fallback if key does not exist anywhere", () => {
    expect(t("non.existent.key", "es", "Custom Fallback")).toBe("Custom Fallback");
  });

  it("falls back to key if key does not exist and no fallback provided", () => {
    expect(t("non.existent.key", "es")).toBe("non.existent.key");
  });

  it("asks a grammatical discard question for every popup noun in use (#1444)", () => {
    // Spanish nouns differ in gender ("este chat", "esta visita"), so each
    // noun carries its own demonstrative and the question is "¿Descartar
    // {noun}?". New nouns must be added here, so a new popup can't ship
    // "¿Descartar esta chat?" or a capitalised noun mid-sentence.
    const expected: Record<string, string> = {
      "attendance.rhythm_noun": "¿Descartar este ritmo?",
      "feedback.note_noun": "¿Descartar esta nota?",
      "modals.chat_noun": "¿Descartar este chat?",
      "modals.contact_noun": "¿Descartar este contacto?",
      "modals.gathering_noun": "¿Descartar esta reunión?",
      "modals.interaction_noun": "¿Descartar esta interacción?",
      "modals.rhythm_noun": "¿Descartar este ritmo?",
      "modals.smartImport.import_noun": "¿Descartar esta importación?",
      "modals.visit_noun": "¿Descartar esta visita?",
      "todoComposer.noun": "¿Descartar esta tarea?",
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
      expect(t("popup.discard_question", "es").replace("{noun}", t(key, "es"))).toBe(expected[key]);
      expect(t("popup.discard_question", "en").replace("{noun}", t(key, "en"))).toMatch(/^Discard this [\w-]+\?$/);
    }
  });

  it("ensures key parity between en.json and es.json", () => {
    function getKeys(obj: Record<string, any>, prefix = ""): string[] {
      let keys: string[] = [];
      for (const k of Object.keys(obj)) {
        const path = prefix ? `${prefix}.${k}` : k;
        if (typeof obj[k] === "object" && obj[k] !== null) {
          keys = keys.concat(getKeys(obj[k], path));
        } else {
          keys.push(path);
        }
      }
      return keys;
    }

    const enKeys = getKeys(en).sort();
    const esKeys = getKeys(es).sort();

    expect(esKeys).toEqual(enKeys);
  });

  it("resolves every contactDetails key the page actually renders", () => {
    // #780 replaced `deleting` with `delete_contact_help` rather than adding
    // it, so the delete button's busy state rendered its raw key. Key parity
    // between en and es cannot catch that — both files lost it together — and
    // t() falls back to the key string rather than throwing.
    const src = readFileSync(
      join(process.cwd(), "src/components/modals/ContactDetailsModal.tsx"),
      "utf8",
    );
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

  it("resolves every modals key LogVisitModal actually renders", () => {
    const src = readFileSync(
      join(process.cwd(), "src/components/modals/LogVisitModal.tsx"),
      "utf8",
    );
    const used = [
      ...new Set(
        [...src.matchAll(/t\(\s*['"](modals\.[a-z0-9_]+)['"]/gi)].map(
          (m) => m[1],
        ),
      ),
    ].sort();
    expect(used.length).toBeGreaterThan(15);

    const unresolved = used.filter((key) => t(key, "en") === key);
    expect(unresolved, "LogVisitModal keys rendered with no translation").toEqual([]);
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
    expect(getDictionary("es")).toEqual(es);
  });
});
