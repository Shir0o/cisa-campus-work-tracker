import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  TranslationEngine,
  InMemoryTranslationAIPort,
  InMemoryTranslationCachePort,
  extractTranslatableItems,
  COLLECTION_ORDER,
  type TranslatableItem,
} from "../../packages/core/src/translationEngine";
import { computeTranslationHash } from "../../packages/core/src/translation";

describe("TranslationEngine — on-demand translation (HTTP endpoint)", () => {
  let aiPort: InMemoryTranslationAIPort;
  let cachePort: InMemoryTranslationCachePort;
  let engine: TranslationEngine;

  beforeEach(() => {
    aiPort = new InMemoryTranslationAIPort();
    cachePort = new InMemoryTranslationCachePort();
    engine = new TranslationEngine({ aiPort, cachePort, dailyLimit: 2000 });
  });

  it("returns cached translations directly without calling AI port on cache hit", async () => {
    const text = "Welcome to Campus Hub";
    const hash = computeTranslationHash("es", text);
    await cachePort.saveTranslations([
      {
        hash,
        sourceText: text,
        translatedText: "Bienvenido a Campus Hub",
        targetLang: "es",
      },
    ]);

    const result = await engine.translateTexts({
      texts: [text],
      targetLang: "es",
    });

    expect(result.success).toBe(true);
    expect(result.targetLang).toBe("es");
    expect(result.translations).toHaveLength(1);
    expect(result.translations[0]).toEqual({
      original: text,
      translated: "Bienvenido a Campus Hub",
      hash,
      cached: true,
    });
    expect(aiPort.calls).toHaveLength(0);
  });

  it("translates uncached items via AI port and writes through to cache", async () => {
    aiPort.setMockTranslation("es", "Hello", "Hola");
    aiPort.setMockTranslation("es", "World", "Mundo");

    const result = await engine.translateTexts({
      texts: ["Hello", "World"],
      targetLang: "es",
    });

    expect(result.success).toBe(true);
    expect(result.translations).toHaveLength(2);
    expect(result.translations[0].translated).toBe("Hola");
    expect(result.translations[0].cached).toBe(false);
    expect(result.translations[1].translated).toBe("Mundo");
    expect(result.translations[1].cached).toBe(false);

    expect(aiPort.calls).toHaveLength(1);
    expect(aiPort.calls[0].chunk).toEqual([
      { id: 0, text: "Hello" },
      { id: 1, text: "World" },
    ]);

    // Verify written through to cache port
    const cached = await cachePort.getCachedTranslations([
      computeTranslationHash("es", "Hello"),
      computeTranslationHash("es", "World"),
    ]);
    expect(cached.get(computeTranslationHash("es", "Hello"))).toBe("Hola");
    expect(cached.get(computeTranslationHash("es", "World"))).toBe("Mundo");
  });

  it("chunks requests into batches of 15 items", async () => {
    const texts = Array.from({ length: 20 }, (_, i) => `Uncached text ${i}`);
    for (let i = 0; i < 20; i++) {
      aiPort.setMockTranslation("es", `Uncached text ${i}`, `Traducido ${i}`);
    }

    const result = await engine.translateTexts({
      texts,
      targetLang: "es",
    });

    expect(result.success).toBe(true);
    expect(result.translations).toHaveLength(20);
    expect(result.translations[0].translated).toBe("Traducido 0");
    expect(result.translations[19].translated).toBe("Traducido 19");

    // 20 items chunked into 15 and 5
    expect(aiPort.calls).toHaveLength(2);
    expect(aiPort.calls[0].chunk).toHaveLength(15);
    expect(aiPort.calls[1].chunk).toHaveLength(5);
  });

  it("enforces atomic daily quota rejection when threshold is exhausted", async () => {
    cachePort.dailyLimit = 1;

    aiPort.setMockTranslation("es", "Pray for students", "Orad por los estudiantes");
    aiPort.setMockTranslation("es", "Exam stress", "Estrés de exámenes");

    const result = await engine.translateTexts({
      texts: ["Pray for students", "Exam stress"],
      targetLang: "es",
    });

    expect(result.success).toBe(true);
    // First item fits within quota of 1
    expect(result.translations[0].translated).toBe("Orad por los estudiantes");
    // Second item rejected by daily quota — returned as original text and NOT cached
    expect(result.translations[1].translated).toBe("Exam stress");
    expect(result.translations[1].cached).toBe(false);

    // AI was only called with the 1 allowed item
    expect(aiPort.calls).toHaveLength(1);
    expect(aiPort.calls[0].chunk).toHaveLength(1);
    expect(aiPort.calls[0].chunk[0].text).toBe("Pray for students");

    // Second item is not in cache
    const secondHash = computeTranslationHash("es", "Exam stress");
    const cached = await cachePort.getCachedTranslations([secondHash]);
    expect(cached.has(secondHash)).toBe(false);
  });

  it("falls back gracefully to original text when AI port throws an error without crashing", async () => {
    aiPort.failureError = new Error("Gemini quota exceeded");

    const result = await engine.translateTexts({
      texts: ["Some new text"],
      targetLang: "es",
    });

    expect(result.success).toBe(true);
    expect(result.translations[0].translated).toBe("Some new text");
  });

  it("supports two-way reading translation (English -> Spanish and Spanish -> English)", async () => {
    aiPort.setMockTranslation("en", "Oración por mi familia", "Prayer for my family");

    const result = await engine.translateTexts({
      texts: ["Oración por mi familia"],
      targetLang: "en",
    });

    expect(result.success).toBe(true);
    expect(result.targetLang).toBe("en");
    expect(result.translations[0].translated).toBe("Prayer for my family");
    expect(aiPort.calls[0].targetLang).toBe("en");
  });

  it("handles empty or whitespace strings without calling AI port", async () => {
    const result = await engine.translateTexts({
      texts: ["", "   ", "Valid text"],
      targetLang: "es",
    });

    expect(result.success).toBe(true);
    expect(result.translations[0]).toEqual({
      original: "",
      translated: "",
      hash: "",
      cached: true,
    });
    expect(result.translations[1]).toEqual({
      original: "   ",
      translated: "   ",
      hash: "",
      cached: true,
    });
    expect(aiPort.calls).toHaveLength(1);
    expect(aiPort.calls[0].chunk).toHaveLength(1);
    expect(aiPort.calls[0].chunk[0].text).toBe("Valid text");
  });
});

describe("TranslationEngine — background sweep (scheduled cloud function)", () => {
  let aiPort: InMemoryTranslationAIPort;
  let cachePort: InMemoryTranslationCachePort;
  let engine: TranslationEngine;

  beforeEach(() => {
    aiPort = new InMemoryTranslationAIPort();
    cachePort = new InMemoryTranslationCachePort();
    engine = new TranslationEngine({ aiPort, cachePort, dailyLimit: 2000 });
  });

  it("processes a batch, checks cache, translates uncached strings, and advances cursor", async () => {
    cachePort.setCollectionDocs("prayers", [
      { id: "p1", data: { burden: "Pray for finals", answer: "Exam week" } },
      { id: "p2", data: { burden: "Pray for fellowship", answer: "Friday dinner" } },
    ]);

    aiPort.setMockTranslation("es", "Pray for finals", "Oración por finales");
    aiPort.setMockTranslation("es", "Exam week", "Semana de exámenes");
    aiPort.setMockTranslation("es", "Pray for fellowship", "Oración por compañerismo");
    aiPort.setMockTranslation("es", "Friday dinner", "Cena de viernes");

    const result = await engine.advanceSweep({ maxItemsPerRun: 10 });

    expect(result.translatedCount).toBe(4);
    expect(result.cursor.currentCollection).toBe("interactions"); // cycled because collection was exhausted
    expect(result.cursor.lastDocId).toBeNull();

    // Verify all translations are saved in cache
    const hash = computeTranslationHash("es", "Pray for finals");
    const cached = await cachePort.getCachedTranslations([hash]);
    expect(cached.get(hash)).toBe("Oración por finales");
  });

  it("enforces uniform atomic daily quota during background sweep", async () => {
    cachePort.dailyLimit = 2; // Only 2 translations allowed today
    cachePort.setCollectionDocs("prayers", [
      { id: "p1", data: { burden: "Pray for finals", answer: "Exam week" } },
      { id: "p2", data: { burden: "Pray for fellowship", answer: "Friday dinner" } },
    ]);

    aiPort.setMockTranslation("es", "Pray for finals", "Oración por finales");
    aiPort.setMockTranslation("es", "Exam week", "Semana de exámenes");

    const result = await engine.advanceSweep({ maxItemsPerRun: 10 });

    // Only 2 strings translated due to daily quota
    expect(result.translatedCount).toBe(2);
    // Cursor stops after p1 because p2 could not be completed under quota
    expect(result.cursor.currentCollection).toBe("prayers");
    expect(result.cursor.lastDocId).toBe("p1");
  });

  it("skips calling AI port when all items in batch are already cached", async () => {
    const text = "Pray for finals";
    const hash = computeTranslationHash("es", text);
    await cachePort.saveTranslations([
      { hash, sourceText: text, translatedText: "Oración por finales", targetLang: "es" },
    ]);

    cachePort.setCollectionDocs("prayers", [
      { id: "p1", data: { burden: text } },
    ]);

    const result = await engine.advanceSweep({ maxItemsPerRun: 10 });

    expect(result.translatedCount).toBe(0);
    expect(result.cachedCount).toBe(1);
    expect(aiPort.calls).toHaveLength(0);
  });

  it("groups mixed target languages into separate AI chunks", async () => {
    cachePort.setCollectionDocs("prayers", [
      { id: "p1", data: { burden: "Pray for finals" } }, // English -> queued for es
      { id: "p2", data: { burden: "Oración por la familia y la iglesia" } }, // Spanish -> queued for en
    ]);

    aiPort.setMockTranslation("es", "Pray for finals", "Oración por finales");
    aiPort.setMockTranslation("en", "Oración por la familia y la iglesia", "Prayer for family and church");

    const result = await engine.advanceSweep({ maxItemsPerRun: 10 });

    expect(result.translatedCount).toBe(2);
    // aiPort should be called for both target languages
    const targetLangs = aiPort.calls.map((c) => c.targetLang);
    expect(targetLangs).toContain("es");
    expect(targetLangs).toContain("en");
  });
});

describe("extractTranslatableItems", () => {
  it("extracts translatable fields according to ADR 0032/0037 rules", () => {
    const prayerItems = extractTranslatableItems("prayers", {
      burden: "Health for brother",
      answer: "Dios es bueno",
      archiveReason: "Answered and closed",
    });

    expect(prayerItems).toContainEqual({ text: "Health for brother", targetLang: "es" });
    expect(prayerItems).toContainEqual({ text: "Dios es bueno", targetLang: "en" });
    expect(prayerItems).toContainEqual({ text: "Answered and closed", targetLang: "es" });
  });

  it("cycles collections in round-robin order", () => {
    expect(COLLECTION_ORDER).toEqual([
      "prayers",
      "interactions",
      "contacts",
      "todos",
      "coordinationNotes",
    ]);
  });
});
