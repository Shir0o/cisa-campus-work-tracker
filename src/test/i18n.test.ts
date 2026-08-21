import { describe, it, expect } from "vitest";
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

  it("returns the dictionary object for a given language", () => {
    expect(getDictionary("en")).toEqual(en);
    expect(getDictionary("es")).toEqual(es);
  });
});
