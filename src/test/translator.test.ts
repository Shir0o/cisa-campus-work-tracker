import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  translateText,
  translateBatch,
  prefetchTranslations,
  getCachedTranslation,
  setCachedTranslation,
  clearTranslationCache,
  computeTranslationHash,
  subscribeTranslation,
} from "../lib/translator";

describe("translator client", () => {
  beforeEach(() => {
    clearTranslationCache();
    localStorage.clear();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("computes consistent SHA-256 hashes for strings", () => {
    const hash1 = computeTranslationHash("es", "Hello world");
    const hash2 = computeTranslationHash("es", "Hello world");
    const hash3 = computeTranslationHash("es", "  Hello world  ");
    const hashOtherLang = computeTranslationHash("fr", "Hello world");

    expect(hash1).toBe(hash2);
    expect(hash1).toBe(hash3); // Whitespace trimmed
    expect(hash1).not.toBe(hashOtherLang);
    expect(hash1.length).toBe(64);
  });

  it("returns original text immediately when target language is English or text is empty", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    const res1 = await translateText("Hello", "en");
    const res2 = await translateText("   ", "es");
    const res3 = await translateText("", "es");

    expect(res1).toBe("Hello");
    expect(res2).toBe("   ");
    expect(res3).toBe("");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("stores and retrieves translations from in-memory L1 and localStorage L2 cache", () => {
    expect(getCachedTranslation("Prayer for finals", "es")).toBeNull();

    setCachedTranslation("Prayer for finals", "Oración por los exámenes finales", "es");

    expect(getCachedTranslation("Prayer for finals", "es")).toBe("Oración por los exámenes finales");
    expect(getCachedTranslation("  Prayer for finals  ", "es")).toBe("Oración por los exámenes finales");
  });

  it("batches multiple concurrent translation calls into a single API request", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        success: true,
        targetLang: "es",
        translations: [
          { original: "Item 1", translated: "Elemento 1", hash: "h1", cached: false },
          { original: "Item 2", translated: "Elemento 2", hash: "h2", cached: false },
          { original: "Item 3", translated: "Elemento 3", hash: "h3", cached: false },
        ],
      }),
    } as any);

    const [t1, t2, t3] = await Promise.all([
      translateText("Item 1", "es"),
      translateText("Item 2", "es"),
      translateText("Item 3", "es"),
    ]);

    expect(t1).toBe("Elemento 1");
    expect(t2).toBe("Elemento 2");
    expect(t3).toBe("Elemento 3");

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith("/api/translate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ targetLang: "es", texts: ["Item 1", "Item 2", "Item 3"] }),
    });
  });

  it("translateBatch translates an array of strings in one call", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        success: true,
        targetLang: "es",
        translations: [
          { original: "Apple", translated: "Manzana", hash: "h1", cached: false },
          { original: "Banana", translated: "Plátano", hash: "h2", cached: false },
        ],
      }),
    } as any);

    const results = await translateBatch(["Apple", "Banana"], "es");
    expect(results).toEqual(["Manzana", "Plátano"]);
  });

  it("prefetchTranslations warms cache for uncached texts and ignores already cached ones", async () => {
    setCachedTranslation("Already Cached", "Ya en caché", "es");

    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        success: true,
        targetLang: "es",
        translations: [
          { original: "Need Translation", translated: "Necesita traducción", hash: "h1", cached: false },
        ],
      }),
    } as any);

    await prefetchTranslations(["Already Cached", "Need Translation", "", null, undefined], "es");

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith("/api/translate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ targetLang: "es", texts: ["Need Translation"] }),
    });

    expect(getCachedTranslation("Need Translation", "es")).toBe("Necesita traducción");
  });

  it("falls back to original text when API call fails without throwing error", async () => {
    const errSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(globalThis, "fetch").mockRejectedValueOnce(new Error("Network offline"));

    const result = await translateText("Important prayer burden", "es");
    expect(result).toBe("Important prayer burden");
    errSpy.mockRestore();
  });

  it("falls back to original text when API returns non-200 status", async () => {
    const errSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      ok: false,
      status: 500,
      json: async () => ({ error: "Server error" }),
    } as any);

    const result = await translateText("Important prayer burden", "es");
    expect(result).toBe("Important prayer burden");
    errSpy.mockRestore();
  });

  it("handles multi-byte UTF-8 unicode strings in hashing", () => {
    const hash = computeTranslationHash("es", "¡Hola! 🌟 祈祷");
    expect(hash).toBeDefined();
    expect(hash.length).toBe(64);
  });

  it("supports subscribing to translation updates and unsubscribing", () => {
    const callback = vi.fn();
    const hash = computeTranslationHash("es", "Live test text");

    const unsubscribe = subscribeTranslation(hash, callback);
    setCachedTranslation("Live test text", "Texto de prueba en vivo", "es");

    expect(callback).toHaveBeenCalledWith("Texto de prueba en vivo");

    unsubscribe();
    setCachedTranslation("Live test text", "Nuevo texto", "es");
    expect(callback).toHaveBeenCalledTimes(1);
  });

  it("translateBatch returns empty array when given empty array or English target", async () => {
    const emptyRes = await translateBatch([]);
    expect(emptyRes).toEqual([]);

    const enRes = await translateBatch(["Hello", "World"], "en");
    expect(enRes).toEqual(["Hello", "World"]);
  });

  it("handles invalid response format gracefully", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      ok: true,
      json: async () => ({ success: false }),
    } as any);

    const result = await translateText("Invalid payload text", "es");
    expect(result).toBe("Invalid payload text");
    warnSpy.mockRestore();
  });

  it("deduplicates identical in-flight translation requests into a single network call", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        success: true,
        targetLang: "es",
        translations: [
          { original: "Repeated prayer query", translated: "Consulta de oración repetida", hash: "h1", cached: false },
        ],
      }),
    } as any);

    // Trigger multiple simultaneous calls for the exact same uncached text
    const [p1, p2, p3] = await Promise.all([
      translateText("Repeated prayer query", "es"),
      translateText("Repeated prayer query", "es"),
      translateText("Repeated prayer query", "es"),
    ]);

    expect(p1).toBe("Consulta de oración repetida");
    expect(p2).toBe("Consulta de oración repetida");
    expect(p3).toBe("Consulta de oración repetida");

    // Only one network call made and texts array only had 1 element
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith("/api/translate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ targetLang: "es", texts: ["Repeated prayer query"] }),
    });
  });

  it("prefetchTranslations handles empty or already cached array without network request", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    await prefetchTranslations([]);
    await prefetchTranslations(["", "   "]);
    await prefetchTranslations(["Hello"], "en");
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
