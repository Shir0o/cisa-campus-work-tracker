import { describe, it, expect, vi } from "vitest";
import {
  isAlreadySpanish,
  translationHash,
  extractTranslatableItems,
  advanceTranslationCron,
  type TranslatableItem,
  type TranslationCronDeps,
} from "../src/translate";

const textsOf = (items: TranslatableItem[]) => items.map((i) => i.text);
const find = (items: TranslatableItem[], text: string) =>
  items.filter((i) => i.text === text);

describe("isAlreadySpanish", () => {
  it("detects clearly Spanish text", () => {
    expect(isAlreadySpanish("Dios les bendiga hermanos y hermanas")).toBe(true);
    expect(isAlreadySpanish("Oración por la familia y la iglesia")).toBe(true);
  });

  it("detects Spanish with punctuation or accents", () => {
    expect(isAlreadySpanish("¿Cómo estás?")).toBe(true);
    expect(isAlreadySpanish("muchas gracias a dios")).toBe(true);
  });

  it("does not flag English text as Spanish", () => {
    expect(isAlreadySpanish("Please pray for John who was hospitalized")).toBe(false);
    expect(isAlreadySpanish("Meeting with students on campus")).toBe(false);
  });

  it("returns false for empty or whitespace strings", () => {
    expect(isAlreadySpanish("")).toBe(false);
    expect(isAlreadySpanish("   ")).toBe(false);
  });
});

describe("translationHash", () => {
  it("generates expected sha256 hash matching format normalizedTargetLang:trimmedText", () => {
    const hash = translationHash("Hello world", "es");
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
    expect(translationHash("  Hello world  ", "es")).toBe(hash);
    expect(translationHash("Hello world", "en")).not.toBe(hash);
  });
});

describe("extractTranslatableItems", () => {
  it("queues the real stored prayer fields for Spanish, and Spanish text for English", () => {
    const prayerDoc = {
      burden: "Health for brother",
      status: "answered",
      answer: "Dios es bueno",
      archiveReason: "Answered and closed",
    };
    const items = extractTranslatableItems("prayers", prayerDoc);
    expect(find(items, "Health for brother")).toEqual([
      { text: "Health for brother", targetLang: "es" },
    ]);
    expect(find(items, "Answered and closed")).toEqual([
      { text: "Answered and closed", targetLang: "es" },
    ]);
    // Spanish-authored content is now queued for English readers (ADR 0037).
    expect(find(items, "Dios es bueno")).toEqual([
      { text: "Dios es bueno", targetLang: "en" },
    ]);
  });

  it("ignores the retired prayer fields that are not stored", () => {
    const prayerDoc = {
      title: "Health for brother",
      description: "Needs strength this week",
      updateNotes: "Feeling better",
      answeredNotes: "Fully healed",
    };
    expect(extractTranslatableItems("prayers", prayerDoc)).toEqual([]);
  });

  it("extracts the real stored contact fields (notes, spiritualBackground, prayerRequest)", () => {
    const contactDoc = {
      name: "John Doe",
      notes: "Met at outreach table",
      spiritualBackground: "Grew up Catholic",
      prayerRequest: "Please pray for my family",
    };
    const texts = textsOf(extractTranslatableItems("contacts", contactDoc));
    expect(texts).toContain("Met at outreach table");
    expect(texts).toContain("Grew up Catholic");
    expect(texts).toContain("Please pray for my family");
  });

  it("ignores the retired contact fields that are not stored", () => {
    const contactDoc = {
      nextSteps: "Follow up next Tuesday",
      spiritualCondition: "Curious",
    };
    expect(extractTranslatableItems("contacts", contactDoc)).toEqual([]);
  });

  it("extracts the real stored interaction field (content)", () => {
    const interactionDoc = {
      content: "Shared the gospel at student union",
      location: "Student Union",
    };
    const texts = textsOf(extractTranslatableItems("interactions", interactionDoc));
    expect(texts).toContain("Shared the gospel at student union");
    expect(texts).not.toContain("Student Union");
  });

  it("ignores the retired interaction summary field", () => {
    expect(extractTranslatableItems("interactions", { summary: "Short recap" })).toEqual([]);
  });

  it("extracts the real stored todo field (title)", () => {
    const todoDoc = {
      title: "Bring bibles to campus",
      description: "Box of 20 English New Testaments",
    };
    const texts = textsOf(extractTranslatableItems("todos", todoDoc));
    expect(texts).toContain("Bring bibles to campus");
    expect(texts).not.toContain("Box of 20 English New Testaments");
  });

  it("extracts translatable fields from coordinationNotes doc", () => {
    const noteDoc = {
      title: "Welcome Week Logistics",
      content: "Schedule for tabling and flyer distribution",
    };
    const texts = textsOf(extractTranslatableItems("coordinationNotes", noteDoc));
    expect(texts).toContain("Welcome Week Logistics");
    expect(texts).toContain("Schedule for tabling and flyer distribution");
  });

  it("queues mixed text for both directions and no-signal text for Spanish only", () => {
    const items = extractTranslatableItems("prayers", {
      burden: "Please pray for mi familia",
      answer: "Juan",
    });
    expect(find(items, "Please pray for mi familia")).toEqual([
      { text: "Please pray for mi familia", targetLang: "es" },
      { text: "Please pray for mi familia", targetLang: "en" },
    ]);
    expect(find(items, "Juan")).toEqual([{ text: "Juan", targetLang: "es" }]);
  });

  it("does not queue English text with a lone Spanish-looking marker for English", () => {
    const items = extractTranslatableItems("prayers", {
      burden: "No worries, please pray for my family this week",
    });
    expect(find(items, "No worries, please pray for my family this week")).toEqual([
      { text: "No worries, please pray for my family this week", targetLang: "es" },
    ]);
  });
});

describe("advanceTranslationCron", () => {
  function makeDeps(overrides: Partial<TranslationCronDeps> = {}): TranslationCronDeps {
    return {
      getCursor: vi.fn(async () => ({
        currentCollection: "prayers",
        lastDocId: null,
        updatedAt: "2026-09-01T00:00:00.000Z",
      })),
      saveCursor: vi.fn(async () => {}),
      fetchBatch: vi.fn(async () => ({
        docs: [
          { id: "p1", data: { burden: "Pray for finals", answer: "Exam week" } },
          { id: "p2", data: { burden: "Pray for fellowship", answer: "Friday dinner" } },
        ],
        hasMore: false,
      })),
      getCachedHashes: vi.fn(async () => new Set<string>()),
      translateTexts: vi.fn(async (items: TranslatableItem[]) =>
        items.map((i) => `[${i.targetLang}] ${i.text}`),
      ),
      saveTranslations: vi.fn(async () => {}),
      ...overrides,
    };
  }

  it("processes a batch, checks cache, translates uncached strings, and advances cursor", async () => {
    const deps = makeDeps();
    const result = await advanceTranslationCron(deps, { maxItemsPerRun: 10 });

    expect(deps.getCursor).toHaveBeenCalled();
    expect(deps.fetchBatch).toHaveBeenCalledWith("prayers", null, expect.any(Number));
    expect(deps.getCachedHashes).toHaveBeenCalled();
    expect(deps.translateTexts).toHaveBeenCalled();
    expect(deps.saveTranslations).toHaveBeenCalled();
    expect(deps.saveCursor).toHaveBeenCalledWith({
      currentCollection: "interactions", // cycled since hasMore was false
      lastDocId: null,
      updatedAt: expect.any(String),
    });
    expect(result.translatedCount).toBe(4); // 2 docs * 2 texts each
    expect(result.cursor.currentCollection).toBe("interactions");
  });

  it("skips calling translateTexts when all items are already cached", async () => {
    const deps = makeDeps({
      getCachedHashes: vi.fn(async (hashes: string[]) => new Set(hashes)),
    });
    const result = await advanceTranslationCron(deps, { maxItemsPerRun: 10 });

    expect(deps.translateTexts).not.toHaveBeenCalled();
    expect(deps.saveTranslations).not.toHaveBeenCalled();
    expect(result.translatedCount).toBe(0);
    expect(result.cachedCount).toBe(4);
  });

  it("writes es entries for English strings and en entries for Spanish strings", async () => {
    const deps = makeDeps({
      fetchBatch: vi.fn(async () => ({
        docs: [
          { id: "p1", data: { burden: "Pray for finals" } },
          { id: "p2", data: { burden: "Oración por la familia" } },
        ],
        hasMore: false,
      })),
    });
    await advanceTranslationCron(deps, { maxItemsPerRun: 10 });

    expect(deps.translateTexts).toHaveBeenCalledWith([
      { text: "Pray for finals", targetLang: "es" },
      { text: "Oración por la familia", targetLang: "en" },
    ]);

    const saved = (deps.saveTranslations as any).mock.calls[0][0] as Array<{
      originalText: string;
      targetLang: string;
      hash: string;
    }>;
    const english = saved.find((s) => s.originalText === "Pray for finals")!;
    const spanish = saved.find((s) => s.originalText === "Oración por la familia")!;
    expect(english.targetLang).toBe("es");
    expect(english.hash).toBe(translationHash("Pray for finals", "es"));
    expect(spanish.targetLang).toBe("en");
    expect(spanish.hash).toBe(translationHash("Oración por la familia", "en"));
  });

  it("shares one nightly limit across both directions", async () => {
    const deps = makeDeps({
      fetchBatch: vi.fn(async () => ({
        docs: [
          { id: "p1", data: { burden: "Pray for finals" } },
          { id: "p2", data: { burden: "Oración por la familia" } },
          { id: "p3", data: { burden: "Pray for the campus" } },
        ],
        hasMore: false,
      })),
    });
    await advanceTranslationCron(deps, { maxItemsPerRun: 2 });

    const requests = (deps.translateTexts as any).mock.calls[0][0] as TranslatableItem[];
    expect(requests).toHaveLength(2);
    expect(requests).toEqual([
      { text: "Pray for finals", targetLang: "es" },
      { text: "Oración por la familia", targetLang: "en" },
    ]);
  });

  it("saves successful chunks, skips failed strings, and still advances the cursor", async () => {
    const deps = makeDeps({
      translateTexts: vi.fn(async () => ["[es] a", null, "[es] c", null]),
    });
    const result = await advanceTranslationCron(deps, { maxItemsPerRun: 10 });

    // 2 docs * 2 texts each = 4 strings; the nulls are failures.
    expect(deps.saveTranslations).toHaveBeenCalledWith([
      {
        hash: expect.any(String),
        originalText: "Pray for finals",
        translatedText: "[es] a",
        targetLang: "es",
      },
      {
        hash: expect.any(String),
        originalText: "Pray for fellowship",
        translatedText: "[es] c",
        targetLang: "es",
      },
    ]);
    expect(result.translatedCount).toBe(2);
    expect(result.failedCount).toBe(2);
    // The cursor advances even though some strings failed.
    expect(deps.saveCursor).toHaveBeenCalledWith({
      currentCollection: "interactions",
      lastDocId: null,
      updatedAt: expect.any(String),
    });
  });

  it("resolves, caches nothing, and advances the cursor when every string fails", async () => {
    const deps = makeDeps({
      translateTexts: vi.fn(async () => [null, null, null, null]),
    });
    const result = await advanceTranslationCron(deps, { maxItemsPerRun: 10 });

    expect(result.translatedCount).toBe(0);
    expect(result.failedCount).toBe(4);
    expect(deps.saveTranslations).toHaveBeenCalledWith([]);
    expect(deps.saveCursor).toHaveBeenCalledWith({
      currentCollection: "interactions",
      lastDocId: null,
      updatedAt: expect.any(String),
    });
  });

  it("counts a short translation result as failed rather than writing the original text", async () => {
    const deps = makeDeps({
      translateTexts: vi.fn(async () => ["[es] a"]),
    });
    const result = await advanceTranslationCron(deps, { maxItemsPerRun: 10 });

    expect(result.translatedCount).toBe(1);
    expect(result.failedCount).toBe(3);
    const saved = (deps.saveTranslations as any).mock.calls[0][0];
    expect(saved).toHaveLength(1);
    expect(saved[0].translatedText).toBe("[es] a");
  });

  it("updates lastDocId without cycling collection when hasMore is true", async () => {
    const deps = makeDeps({
      fetchBatch: vi.fn(async () => ({
        docs: [
          { id: "p1", data: { title: "Title 1" } },
          { id: "p2", data: { title: "Title 2" } },
        ],
        hasMore: true,
      })),
    });
    const result = await advanceTranslationCron(deps, { maxItemsPerRun: 10 });

    expect(deps.saveCursor).toHaveBeenCalledWith({
      currentCollection: "prayers",
      lastDocId: "p2",
      updatedAt: expect.any(String),
    });
    expect(result.cursor.currentCollection).toBe("prayers");
    expect(result.cursor.lastDocId).toBe("p2");
  });

  describe("when the run is cut off by maxItemsPerRun", () => {
    // Each doc contributes `n` distinct English strings (one es entry each).
    const docWith = (id: string, n: number) => ({
      id,
      data: {
        burden: n > 0 ? `${id} burden` : undefined,
        answer: n > 1 ? `${id} answer` : undefined,
        archiveReason: n > 2 ? `${id} reason` : undefined,
      },
    });
    const threeDocs = [docWith("p1", 2), docWith("p2", 2), docWith("p3", 2)];

    it("stops the cursor at the last fully queued doc and resumes with the cut-off doc", async () => {
      const cache = new Set<string>();
      const deps = makeDeps({
        fetchBatch: vi.fn(async (_c: string, after: string | null) => {
          const idx = after ? threeDocs.findIndex((d) => d.id === after) + 1 : 0;
          return { docs: threeDocs.slice(idx), hasMore: true };
        }),
        getCachedHashes: vi.fn(async (hashes: string[]) => new Set(hashes.filter((h) => cache.has(h)))),
        saveTranslations: vi.fn(async (items: Array<{ hash: string }>) => {
          items.forEach((i) => cache.add(i.hash));
        }),
      });

      const first = await advanceTranslationCron(deps, { maxItemsPerRun: 3 });
      // p1 (2 strings) fits; p2 only partly fits, so p3 and the rest of p2 wait.
      expect(first.translatedCount).toBe(3);
      expect(first.cursor.currentCollection).toBe("prayers");
      expect(first.cursor.lastDocId).toBe("p1");

      // The next run starts at p2; its already-cached string is skipped.
      (deps.getCursor as any).mockResolvedValueOnce(first.cursor);
      const second = await advanceTranslationCron(deps, { maxItemsPerRun: 3 });
      expect(deps.fetchBatch).toHaveBeenLastCalledWith("prayers", "p1", expect.any(Number));
      const requested = (deps.translateTexts as any).mock.calls[1][0] as TranslatableItem[];
      expect(textsOf(requested)).toEqual(["p2 answer", "p3 burden", "p3 answer"]);
      expect(second.cursor.lastDocId).toBe("p3");
    });

    it("stays in the same collection when cut off on the last batch (hasMore false)", async () => {
      const deps = makeDeps({
        fetchBatch: vi.fn(async () => ({ docs: threeDocs, hasMore: false })),
      });
      const result = await advanceTranslationCron(deps, { maxItemsPerRun: 3 });

      expect(result.cursor.currentCollection).toBe("prayers");
      expect(result.cursor.lastDocId).toBe("p1");
    });

    it("rolls to the next collection when the cap is hit exactly with nothing left over", async () => {
      const deps = makeDeps({
        fetchBatch: vi.fn(async () => ({ docs: threeDocs, hasMore: false })),
      });
      const result = await advanceTranslationCron(deps, { maxItemsPerRun: 6 });

      expect(result.cursor.currentCollection).toBe("interactions");
      expect(result.cursor.lastDocId).toBeNull();
    });

    it("still advances past a single doc with more strings than the cap", async () => {
      const deps = makeDeps({
        fetchBatch: vi.fn(async () => ({
          docs: [docWith("big", 3), docWith("p2", 1)],
          hasMore: true,
        })),
      });
      const result = await advanceTranslationCron(deps, { maxItemsPerRun: 2 });

      expect(result.translatedCount).toBe(2);
      expect(result.cursor.currentCollection).toBe("prayers");
      expect(result.cursor.lastDocId).toBe("big");
    });

    it("still advances when an earlier doc is fully cached and the next one exceeds the cap", async () => {
      const cachedDoc = docWith("done", 1);
      const cachedHash = translationHash("done burden", "es");
      const deps = makeDeps({
        fetchBatch: vi.fn(async () => ({
          docs: [cachedDoc, docWith("big", 3)],
          hasMore: true,
        })),
        getCachedHashes: vi.fn(async () => new Set([cachedHash])),
      });
      const result = await advanceTranslationCron(deps, { maxItemsPerRun: 2 });

      expect(result.cursor.lastDocId).toBe("big");
    });

    it("does not hold the cursor back for strings that failed to translate", async () => {
      const deps = makeDeps({
        fetchBatch: vi.fn(async () => ({ docs: threeDocs, hasMore: true })),
        translateTexts: vi.fn(async () => [null, null, null]),
      });
      const result = await advanceTranslationCron(deps, { maxItemsPerRun: 4 });

      // p1 and p2 were fully queued (4 strings) even though they all failed.
      expect(result.failedCount).toBe(4);
      expect(result.cursor.lastDocId).toBe("p2");
    });
  });
});
