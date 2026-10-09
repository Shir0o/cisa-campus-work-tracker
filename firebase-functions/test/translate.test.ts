import { describe, it, expect, vi } from "vitest";
import {
  isAlreadySpanish,
  translationHash,
  extractTranslatableTexts,
  advanceTranslationCron,
  type TranslationCursor,
  type TranslationCronDeps,
} from "../src/translate";

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
    // Same text trimmed gives identical hash
    expect(translationHash("  Hello world  ", "es")).toBe(hash);
  });
});

describe("extractTranslatableTexts", () => {
  it("extracts the real stored prayer fields (burden, answer, archiveReason)", () => {
    const prayerDoc = {
      burden: "Health for brother",
      status: "answered",
      answer: "Fully healed",
      archiveReason: "Answered and closed",
      spanishNote: "Dios es bueno",
    };
    const texts = extractTranslatableTexts("prayers", prayerDoc);
    expect(texts).toContain("Health for brother");
    expect(texts).toContain("Fully healed");
    expect(texts).toContain("Answered and closed");
    expect(texts).not.toContain("Dios es bueno"); // Spanish skipped
  });

  it("ignores the retired prayer fields that are not stored", () => {
    const prayerDoc = {
      title: "Health for brother",
      description: "Needs strength this week",
      updateNotes: "Feeling better",
      answeredNotes: "Fully healed",
    };
    expect(extractTranslatableTexts("prayers", prayerDoc)).toEqual([]);
  });

  it("extracts the real stored contact fields (notes, spiritualBackground, prayerRequest)", () => {
    const contactDoc = {
      name: "John Doe",
      notes: "Met at outreach table",
      spiritualBackground: "Grew up Catholic",
      prayerRequest: "Please pray for my family",
    };
    const texts = extractTranslatableTexts("contacts", contactDoc);
    expect(texts).toContain("Met at outreach table");
    expect(texts).toContain("Grew up Catholic");
    expect(texts).toContain("Please pray for my family");
  });

  it("ignores the retired contact fields that are not stored", () => {
    const contactDoc = {
      nextSteps: "Follow up next Tuesday",
      spiritualCondition: "Curious",
    };
    expect(extractTranslatableTexts("contacts", contactDoc)).toEqual([]);
  });

  it("extracts the real stored interaction field (content)", () => {
    const interactionDoc = {
      content: "Shared the gospel at student union",
      location: "Student Union",
    };
    const texts = extractTranslatableTexts("interactions", interactionDoc);
    expect(texts).toContain("Shared the gospel at student union");
    expect(texts).not.toContain("Student Union");
  });

  it("ignores the retired interaction summary field", () => {
    expect(extractTranslatableTexts("interactions", { summary: "Short recap" })).toEqual([]);
  });

  it("extracts the real stored todo field (title)", () => {
    const todoDoc = {
      title: "Bring bibles to campus",
      description: "Box of 20 English New Testaments",
    };
    const texts = extractTranslatableTexts("todos", todoDoc);
    expect(texts).toContain("Bring bibles to campus");
    expect(texts).not.toContain("Box of 20 English New Testaments");
  });

  it("extracts translatable fields from coordinationNotes doc", () => {
    const noteDoc = {
      title: "Welcome Week Logistics",
      content: "Schedule for tabling and flyer distribution",
    };
    const texts = extractTranslatableTexts("coordinationNotes", noteDoc);
    expect(texts).toContain("Welcome Week Logistics");
    expect(texts).toContain("Schedule for tabling and flyer distribution");
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
      translateTexts: vi.fn(async (texts: string[]) => texts.map((t) => `[es] ${t}`)),
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
      },
      {
        hash: expect.any(String),
        originalText: "Pray for fellowship",
        translatedText: "[es] c",
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
});
