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
  it("extracts translatable fields from prayer document", () => {
    const prayerDoc = {
      title: "Health for brother",
      description: "Needs strength this week",
      updateNotes: "Feeling better",
      answeredNotes: "Fully healed",
      spanishNote: "Dios es bueno",
    };
    const texts = extractTranslatableTexts("prayers", prayerDoc);
    expect(texts).toContain("Health for brother");
    expect(texts).toContain("Needs strength this week");
    expect(texts).toContain("Feeling better");
    expect(texts).toContain("Fully healed");
    expect(texts).not.toContain("Dios es bueno"); // Spanish skipped
  });

  it("extracts translatable fields from contact doc", () => {
    const contactDoc = {
      name: "John Doe",
      notes: "Met at outreach table",
      nextSteps: "Follow up next Tuesday",
    };
    const texts = extractTranslatableTexts("contacts", contactDoc);
    expect(texts).toContain("Met at outreach table");
    expect(texts).toContain("Follow up next Tuesday");
  });

  it("extracts translatable fields from interaction doc", () => {
    const interactionDoc = {
      content: "Shared the gospel at student union",
      location: "Student Union",
    };
    const texts = extractTranslatableTexts("interactions", interactionDoc);
    expect(texts).toContain("Shared the gospel at student union");
  });

  it("extracts translatable fields from todo doc", () => {
    const todoDoc = {
      title: "Bring bibles to campus",
      description: "Box of 20 English New Testaments",
    };
    const texts = extractTranslatableTexts("todos", todoDoc);
    expect(texts).toContain("Bring bibles to campus");
    expect(texts).toContain("Box of 20 English New Testaments");
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
          { id: "p1", data: { title: "Pray for finals", description: "Exam week" } },
          { id: "p2", data: { title: "Pray for fellowship", description: "Friday dinner" } },
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
