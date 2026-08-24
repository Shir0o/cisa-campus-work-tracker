import { describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { useTranslate, useTranslateMarkdown } from "../hooks/useTranslate";
import { Translate, OriginalToggle } from "../components/Translate";
import { LanguageToggle } from "../components/LanguageToggle";
import { LanguageProvider, useLanguage, useI18n } from "../components/LanguageProvider";
import * as translator from "../lib/translator";

function TestTranslateComponent({ text }: { text: string }) {
  const { translatedText, isPending } = useTranslate(text);
  return (
    <div>
      <span data-testid="pending">{isPending ? "loading" : "done"}</span>
      <span data-testid="translated">{translatedText}</span>
    </div>
  );
}

function TestLanguageSwitcher() {
  const { language, setLanguage } = useLanguage();
  return (
    <div>
      <span data-testid="current-lang">{language}</span>
      <button onClick={() => setLanguage("es")}>Switch ES</button>
      <button onClick={() => setLanguage("en")}>Switch EN</button>
    </div>
  );
}

function TestI18nComponent() {
  const { t, language, isSpanish } = useI18n();
  return (
    <div>
      <span data-testid="i18n-lang">{language}</span>
      <span data-testid="i18n-is-spanish">{isSpanish ? "yes" : "no"}</span>
      <span data-testid="i18n-save">{t("actions.save")}</span>
      <span data-testid="i18n-custom">{t("non.existent", "Fallback Text")}</span>
    </div>
  );
}

function TestMarkdownComponent({ text }: { text: string }) {
  const { translatedText, isPending } = useTranslateMarkdown(text);
  return (
    <div>
      <span data-testid="md-pending">{isPending ? "loading" : "done"}</span>
      <span data-testid="md-translated">{translatedText}</span>
    </div>
  );
}

function mockFetchTranslations(translations: Array<{ original: string; translated: string }>) {
  const map = new Map(translations.map((t) => [t.original, t.translated]));
  return vi.spyOn(globalThis, "fetch").mockImplementation(async (_url, init) => {
    const body = JSON.parse(String((init as RequestInit)?.body));
    const texts = body.texts as string[];
    return {
      ok: true,
      json: async () => ({
        success: true,
        targetLang: "es",
        translations: texts.map((t) => ({
          original: t,
          translated: map.get(t) ?? t,
          hash: "h",
          cached: false,
        })),
      }),
    } as any;
  });
}

describe("useTranslate and Translate component", () => {
  beforeEach(() => {
    localStorage.clear();
    translator.clearTranslationCache();
    vi.restoreAllMocks();
  });

  it("returns original text synchronously when language is English", () => {
    render(
      <LanguageProvider defaultLanguage="en">
        <TestTranslateComponent text="Welcome to Campus" />
      </LanguageProvider>
    );

    expect(screen.getByTestId("pending").textContent).toBe("done");
    expect(screen.getByTestId("translated").textContent).toBe("Welcome to Campus");
  });

  it("returns cached translation instantly without loading state", () => {
    translator.setCachedTranslation("Welcome to Campus", "Bienvenido al Campus", "es");

    render(
      <LanguageProvider defaultLanguage="es">
        <TestTranslateComponent text="Welcome to Campus" />
      </LanguageProvider>
    );

    expect(screen.getByTestId("pending").textContent).toBe("done");
    expect(screen.getByTestId("translated").textContent).toBe("Bienvenido al Campus");
  });

  it("fetches and renders translation when not cached", async () => {
    vi.spyOn(translator, "translateText").mockResolvedValueOnce("Bienvenido al Campus");

    render(
      <LanguageProvider defaultLanguage="es">
        <TestTranslateComponent text="Welcome to Campus" />
      </LanguageProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId("translated").textContent).toBe("Bienvenido al Campus");
    });
  });

  it("Translate component renders translated text inside specified element", async () => {
    translator.setCachedTranslation("Fellowship", "Compañerismo", "es");

    render(
      <LanguageProvider defaultLanguage="es">
        <Translate text="Fellowship" as="h1" className="text-xl font-bold" data-testid="title" />
      </LanguageProvider>
    );

    const titleEl = screen.getByTestId("title");
    expect(titleEl.tagName.toLowerCase()).toBe("h1");
    expect(titleEl.textContent).toBe("Compañerismo");
  });

  it("Translate component supports children as string content and number content", async () => {
    translator.setCachedTranslation("Settings", "Ajustes", "es");

    render(
      <LanguageProvider defaultLanguage="es">
        <Translate as="div" data-testid="settings-label">Settings</Translate>
        <Translate as="div" data-testid="number-label">{42}</Translate>
      </LanguageProvider>
    );

    const el = screen.getByTestId("settings-label");
    expect(el.tagName.toLowerCase()).toBe("div");
    expect(el.textContent).toBe("Ajustes");

    const numEl = screen.getByTestId("number-label");
    expect(numEl.textContent).toBe("42");
  });

  it("handles empty or null text gracefully", () => {
    render(
      <LanguageProvider defaultLanguage="es">
        <TestTranslateComponent text="" />
      </LanguageProvider>
    );

    expect(screen.getByTestId("pending").textContent).toBe("done");
    expect(screen.getByTestId("translated").textContent).toBe("");
  });

  it("respects enabled: false option", () => {
    function DisabledTranslateComponent() {
      const { translatedText, isPending } = useTranslate("Active item", { enabled: false });
      return (
        <div>
          <span data-testid="pending">{isPending ? "loading" : "done"}</span>
          <span data-testid="translated">{translatedText}</span>
        </div>
      );
    }

    render(
      <LanguageProvider defaultLanguage="es">
        <DisabledTranslateComponent />
      </LanguageProvider>
    );

    expect(screen.getByTestId("pending").textContent).toBe("done");
    expect(screen.getByTestId("translated").textContent).toBe("Active item");
  });

  it("supports showOriginalToggle and toggles back and forth", () => {
    translator.setCachedTranslation("Original Prayer Note", "Nota de oración original", "es");

    render(
      <LanguageProvider defaultLanguage="es">
        <Translate text="Original Prayer Note" showOriginalToggle data-testid="ugc-text" />
      </LanguageProvider>
    );

    expect(screen.getByTestId("ugc-text").textContent).toContain("Nota de oración original");
    const toggleBtn = screen.getByRole("button", { name: "Ver original" });
    expect(toggleBtn).toBeInTheDocument();

    fireEvent.click(toggleBtn);
    expect(screen.getByTestId("ugc-text").textContent).toContain("Original Prayer Note");
    expect(screen.getByRole("button", { name: "Ver traducción" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Ver traducción" }));
    expect(screen.getByTestId("ugc-text").textContent).toContain("Nota de oración original");
  });

  it("renders standalone OriginalToggle button and handles clicks", () => {
    const onToggle = vi.fn();
    const { rerender } = render(
      <LanguageProvider defaultLanguage="es">
        <OriginalToggle showingOriginal={false} onToggle={onToggle} />
      </LanguageProvider>
    );

    const btn = screen.getByRole("button", { name: "Ver original" });
    fireEvent.click(btn);
    expect(onToggle).toHaveBeenCalledTimes(1);

    rerender(
      <LanguageProvider defaultLanguage="es">
        <OriginalToggle showingOriginal={true} onToggle={onToggle} />
      </LanguageProvider>
    );
    expect(screen.getByRole("button", { name: "Ver traducción" })).toBeInTheDocument();
  });

  it("OriginalToggle formats in English when targetLang is English", () => {
    const onToggle = vi.fn();
    render(
      <LanguageProvider defaultLanguage="en">
        <OriginalToggle showingOriginal={false} onToggle={onToggle} targetLang="en" />
      </LanguageProvider>
    );

    expect(screen.getByRole("button", { name: "Show original" })).toBeInTheDocument();
  });

  it("useI18n hook provides translation helper and active language status", () => {
    render(
      <LanguageProvider defaultLanguage="es">
        <TestI18nComponent />
      </LanguageProvider>
    );

    expect(screen.getByTestId("i18n-lang").textContent).toBe("es");
    expect(screen.getByTestId("i18n-is-spanish").textContent).toBe("yes");
    expect(screen.getByTestId("i18n-save").textContent).toBe("Guardar");
    expect(screen.getByTestId("i18n-custom").textContent).toBe("Fallback Text");
  });

  it("updates translation when subscriber callback fires", async () => {
    let pendingPromise: Promise<string>;
    vi.spyOn(translator, "translateText").mockImplementationOnce(() => {
      pendingPromise = new Promise(() => {}); // never resolves
      return pendingPromise;
    });

    render(
      <LanguageProvider defaultLanguage="es">
        <TestTranslateComponent text="Late update" />
      </LanguageProvider>
    );

    expect(screen.getByTestId("pending").textContent).toBe("loading");

    const hash = translator.computeTranslationHash("es", "Late update");
    translator.setCachedTranslation("Late update", "Actualización tardía", "es");

    await waitFor(() => {
      expect(screen.getByTestId("translated").textContent).toBe("Actualización tardía");
      expect(screen.getByTestId("pending").textContent).toBe("done");
    });
  });

  it("falls back to original text when translateText rejects", async () => {
    vi.spyOn(translator, "translateText").mockRejectedValueOnce(new Error("Fail"));

    render(
      <LanguageProvider defaultLanguage="es">
        <TestTranslateComponent text="Error fallback item" />
      </LanguageProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId("translated").textContent).toBe("Error fallback item");
      expect(screen.getByTestId("pending").textContent).toBe("done");
    });
  });

  it("falls back to English when useLanguage is used outside LanguageProvider", () => {
    render(<TestLanguageSwitcher />);
    expect(screen.getByTestId("current-lang").textContent).toBe("en");
  });

  it("LanguageProvider provides language state and persists selection", () => {
    render(
      <LanguageProvider defaultLanguage="en">
        <TestLanguageSwitcher />
      </LanguageProvider>
    );

    expect(screen.getByTestId("current-lang").textContent).toBe("en");
    fireEvent.click(screen.getByText("Switch ES"));
    expect(screen.getByTestId("current-lang").textContent).toBe("es");
    expect(localStorage.getItem("cisa_language")).toBe("es");
  });

  it("LanguageToggle switches language on click", () => {
    render(
      <LanguageProvider defaultLanguage="en">
        <LanguageToggle />
      </LanguageProvider>
    );

    const esButton = screen.getByRole("button", { name: "ES" });
    fireEvent.click(esButton);
    expect(localStorage.getItem("cisa_language")).toBe("es");

    // Clicking ES again when already ES
    fireEvent.click(esButton);
    expect(localStorage.getItem("cisa_language")).toBe("es");

    const enButton = screen.getByRole("button", { name: "EN" });
    fireEvent.click(enButton);
    expect(localStorage.getItem("cisa_language")).toBe("en");

    // Clicking EN again when already EN
    fireEvent.click(enButton);
    expect(localStorage.getItem("cisa_language")).toBe("en");
  });

  it("useLanguage fallback returns no-op functions when used outside Provider", () => {
    function FallbackConsumer() {
      const { setLanguage, t, isSpanish } = useLanguage();
      return (
        <div>
          <button onClick={() => setLanguage("es")}>Set Lang</button>
          <span data-testid="t-out">{t("actions.save", "Fallback")}</span>
          <span data-testid="spanish">{isSpanish ? "yes" : "no"}</span>
        </div>
      );
    }

    render(<FallbackConsumer />);
    expect(screen.getByTestId("spanish").textContent).toBe("no");
    expect(screen.getByTestId("t-out").textContent).toBe("Save");
    fireEvent.click(screen.getByText("Set Lang"));
  });

  it("Translate component applies loading transition class while pending translation", async () => {
    vi.spyOn(translator, "translateText").mockImplementationOnce(() => new Promise(() => {}));

    render(
      <LanguageProvider defaultLanguage="es">
        <Translate text="Fresh text waiting" data-testid="pending-translate" />
      </LanguageProvider>
    );

    const el = screen.getByTestId("pending-translate");
    expect(el.className).toContain("animate-pulse");
    expect(el.className).toContain("opacity-70");
  });
});

describe("useTranslateMarkdown", () => {
  const MD = "# One\n\nHello.\n\n# Two\n\nWorld.";
  const ES_MD = "# Uno\n\nHola.\n\n# Dos\n\nMundo.";
  const SEC1 = "# One\n\nHello.";
  const SEC2 = "# Two\n\nWorld.";
  const SEC1_ES = "# Uno\n\nHola.";
  const SEC2_ES = "# Dos\n\nMundo.";

  beforeEach(() => {
    localStorage.clear();
    translator.clearTranslationCache();
    vi.restoreAllMocks();
  });

  it("returns original markdown when language is English, without hitting the API", () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    render(
      <LanguageProvider defaultLanguage="en">
        <TestMarkdownComponent text={MD} />
      </LanguageProvider>
    );

    expect(screen.getByTestId("md-translated").textContent).toBe(MD);
    expect(screen.getByTestId("md-pending").textContent).toBe("done");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("joins cached translations instantly when every section is cached", async () => {
    translator.setCachedTranslation(SEC1, SEC1_ES, "es");
    translator.setCachedTranslation(SEC2, SEC2_ES, "es");
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    render(
      <LanguageProvider defaultLanguage="es">
        <TestMarkdownComponent text={MD} />
      </LanguageProvider>
    );

    expect(screen.getByTestId("md-translated").textContent).toBe(ES_MD);
    expect(screen.getByTestId("md-pending").textContent).toBe("done");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("sends only the uncached sections to the API and mixes in cached ones", async () => {
    translator.setCachedTranslation(SEC1, SEC1_ES, "es");
    const fetchSpy = mockFetchTranslations([{ original: SEC2, translated: SEC2_ES }]);

    render(
      <LanguageProvider defaultLanguage="es">
        <TestMarkdownComponent text={MD} />
      </LanguageProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId("md-translated").textContent).toBe(ES_MD);
      expect(screen.getByTestId("md-pending").textContent).toBe("done");
    });

    const call = fetchSpy.mock.calls.find((c) => String(c[0]).includes("/api/translate"));
    const body = JSON.parse(String((call?.[1] as any)?.body));
    expect(body.texts).toEqual([SEC2]);
  });

  it("falls back to original per-section when the API fails", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("Offline"));

    render(
      <LanguageProvider defaultLanguage="es">
        <TestMarkdownComponent text={MD} />
      </LanguageProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId("md-translated").textContent).toBe(MD);
      expect(screen.getByTestId("md-pending").textContent).toBe("done");
    });
  });

  it("updates progressively as a section translation lands via subscriber", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(() => new Promise(() => {}));

    render(
      <LanguageProvider defaultLanguage="es">
        <TestMarkdownComponent text={MD} />
      </LanguageProvider>
    );

    expect(screen.getByTestId("md-pending").textContent).toBe("loading");

    translator.setCachedTranslation(SEC1, SEC1_ES, "es");

    await waitFor(() => {
      expect(screen.getByTestId("md-translated").textContent).toBe(`${SEC1_ES}\n\n${SEC2}`);
      expect(screen.getByTestId("md-pending").textContent).toBe("loading");
    });
  });
});
