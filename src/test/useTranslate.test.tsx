import { describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { useTranslate, useTranslateMarkdown } from "../hooks/useTranslate";
import { Translate, OriginalToggle } from "../components/Translate";
import { LanguageProvider, useLanguage, useI18n } from "../components/LanguageProvider";
import * as translator from "../lib/translator";

// The reading translation runs toward English only: Spanish written by the
// team is read in English. English text passes through untouched.
const SPANISH = "Oración por mi familia";
const ENGLISH = "Prayer for my family";

function TestTranslateComponent({ text }: { text: string }) {
  const { translatedText, isPending } = useTranslate(text);
  return (
    <div>
      <span data-testid="pending">{isPending ? "loading" : "done"}</span>
      <span data-testid="translated">{translatedText}</span>
    </div>
  );
}

function TestI18nComponent() {
  const { t, language } = useI18n();
  return (
    <div>
      <span data-testid="i18n-lang">{language}</span>
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
        targetLang: "en",
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

  it("returns original text synchronously when it is already English", () => {
    render(
      <LanguageProvider>
        <TestTranslateComponent text="Welcome to Campus" />
      </LanguageProvider>
    );

    expect(screen.getByTestId("pending").textContent).toBe("done");
    expect(screen.getByTestId("translated").textContent).toBe("Welcome to Campus");
  });

  it("translates a Spanish prayer burden toward English for the reader", async () => {
    const translateSpy = vi.spyOn(translator, "translateText").mockResolvedValueOnce(ENGLISH);

    render(
      <LanguageProvider>
        <TestTranslateComponent text={SPANISH} />
      </LanguageProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId("translated").textContent).toBe(ENGLISH);
      expect(screen.getByTestId("pending").textContent).toBe("done");
    });
    expect(translateSpy).toHaveBeenCalledWith(SPANISH, "en");
  });

  it("returns cached translation instantly without loading state", () => {
    translator.setCachedTranslation(SPANISH, ENGLISH, "en");

    render(
      <LanguageProvider>
        <TestTranslateComponent text={SPANISH} />
      </LanguageProvider>
    );

    expect(screen.getByTestId("pending").textContent).toBe("done");
    expect(screen.getByTestId("translated").textContent).toBe(ENGLISH);
  });

  it("Translate component renders translated text inside specified element", async () => {
    translator.setCachedTranslation("Compañerismo de oración", "Prayer fellowship", "en");

    render(
      <LanguageProvider>
        <Translate text="Compañerismo de oración" as="h1" className="text-xl font-bold" data-testid="title" />
      </LanguageProvider>
    );

    const titleEl = screen.getByTestId("title");
    expect(titleEl.tagName.toLowerCase()).toBe("h1");
    expect(titleEl.textContent).toBe("Prayer fellowship");
  });

  it("Translate component supports children as string content and number content", async () => {
    render(
      <LanguageProvider>
        <Translate as="div" data-testid="settings-label">Settings</Translate>
        <Translate as="div" data-testid="number-label">{42}</Translate>
      </LanguageProvider>
    );

    const el = screen.getByTestId("settings-label");
    expect(el.tagName.toLowerCase()).toBe("div");
    expect(el.textContent).toBe("Settings");

    const numEl = screen.getByTestId("number-label");
    expect(numEl.textContent).toBe("42");
  });

  it("handles empty or null text gracefully", () => {
    render(
      <LanguageProvider>
        <TestTranslateComponent text="" />
      </LanguageProvider>
    );

    expect(screen.getByTestId("pending").textContent).toBe("done");
    expect(screen.getByTestId("translated").textContent).toBe("");
  });

  it("respects enabled: false option", () => {
    function DisabledTranslateComponent() {
      const { translatedText, isPending } = useTranslate(SPANISH, { enabled: false });
      return (
        <div>
          <span data-testid="pending">{isPending ? "loading" : "done"}</span>
          <span data-testid="translated">{translatedText}</span>
        </div>
      );
    }

    render(
      <LanguageProvider>
        <DisabledTranslateComponent />
      </LanguageProvider>
    );

    expect(screen.getByTestId("pending").textContent).toBe("done");
    expect(screen.getByTestId("translated").textContent).toBe(SPANISH);
  });

  it("supports showOriginalToggle and toggles back and forth", () => {
    translator.setCachedTranslation(SPANISH, ENGLISH, "en");

    render(
      <LanguageProvider>
        <Translate text={SPANISH} showOriginalToggle data-testid="ugc-text" />
      </LanguageProvider>
    );

    expect(screen.getByTestId("ugc-text").textContent).toContain(ENGLISH);
    const toggleBtn = screen.getByRole("button", { name: "Show original" });
    expect(toggleBtn).toBeInTheDocument();

    fireEvent.click(toggleBtn);
    expect(screen.getByTestId("ugc-text").textContent).toContain(SPANISH);
    expect(screen.getByRole("button", { name: "Show translation" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Show translation" }));
    expect(screen.getByTestId("ugc-text").textContent).toContain(ENGLISH);
  });

  it("renders standalone OriginalToggle button and handles clicks", () => {
    const onToggle = vi.fn();
    const { rerender } = render(<OriginalToggle showingOriginal={false} onToggle={onToggle} />);

    fireEvent.click(screen.getByRole("button", { name: "Show original" }));
    expect(onToggle).toHaveBeenCalledTimes(1);

    rerender(<OriginalToggle showingOriginal={true} onToggle={onToggle} />);
    expect(screen.getByRole("button", { name: "Show translation" })).toBeInTheDocument();
  });

  it("useI18n hook provides translation helper and the English language", () => {
    render(
      <LanguageProvider>
        <TestI18nComponent />
      </LanguageProvider>
    );

    expect(screen.getByTestId("i18n-lang").textContent).toBe("en");
    expect(screen.getByTestId("i18n-save").textContent).toBe("Save");
    expect(screen.getByTestId("i18n-custom").textContent).toBe("Fallback Text");
  });

  it("updates translation when subscriber callback fires", async () => {
    vi.spyOn(translator, "translateText").mockImplementationOnce(() => new Promise(() => {}));

    render(
      <LanguageProvider>
        <TestTranslateComponent text="Actualización tardía" />
      </LanguageProvider>
    );

    expect(screen.getByTestId("pending").textContent).toBe("loading");

    translator.setCachedTranslation("Actualización tardía", "Late update", "en");

    await waitFor(() => {
      expect(screen.getByTestId("translated").textContent).toBe("Late update");
      expect(screen.getByTestId("pending").textContent).toBe("done");
    });
  });

  it("falls back to original text when translateText rejects", async () => {
    vi.spyOn(translator, "translateText").mockRejectedValueOnce(new Error("Fail"));

    render(
      <LanguageProvider>
        <TestTranslateComponent text="Elemento con error de traducción" />
      </LanguageProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId("translated").textContent).toBe("Elemento con error de traducción");
      expect(screen.getByTestId("pending").textContent).toBe("done");
    });
  });

  it("useLanguage outside LanguageProvider is English", () => {
    function FallbackConsumer() {
      const { language, t } = useLanguage();
      return (
        <div>
          <span data-testid="current-lang">{language}</span>
          <span data-testid="t-out">{t("actions.save", "Fallback")}</span>
        </div>
      );
    }

    render(<FallbackConsumer />);
    expect(screen.getByTestId("current-lang").textContent).toBe("en");
    expect(screen.getByTestId("t-out").textContent).toBe("Save");
  });

  it("Translate component applies loading transition class while pending translation", async () => {
    vi.spyOn(translator, "translateText").mockImplementationOnce(() => new Promise(() => {}));

    render(
      <LanguageProvider>
        <Translate text="Oración fresca en espera para hoy" data-testid="pending-translate" />
      </LanguageProvider>
    );

    const el = screen.getByTestId("pending-translate");
    expect(el.className).toContain("animate-pulse");
    expect(el.className).toContain("opacity-70");
  });
});

describe("useTranslateMarkdown", () => {
  const SEC1 = "# Uno\n\nOración por mi familia esta semana.";
  const SEC2 = "# Dos\n\nEl estudio bíblico fue muy bueno esta mañana.";
  const SEC1_EN = "# One\n\nPrayer for my family this week.";
  const SEC2_EN = "# Two\n\nThe Bible study was very good this morning.";
  const MD = `${SEC1}\n\n${SEC2}`;
  const EN_MD = `${SEC1_EN}\n\n${SEC2_EN}`;

  beforeEach(() => {
    localStorage.clear();
    translator.clearTranslationCache();
    vi.restoreAllMocks();
  });

  it("returns English markdown as is, without hitting the API", () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    render(
      <LanguageProvider>
        <TestMarkdownComponent text={EN_MD} />
      </LanguageProvider>
    );

    expect(screen.getByTestId("md-translated").textContent).toBe(EN_MD);
    expect(screen.getByTestId("md-pending").textContent).toBe("done");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("joins cached translations instantly when every section is cached", async () => {
    translator.setCachedTranslation(SEC1, SEC1_EN, "en");
    translator.setCachedTranslation(SEC2, SEC2_EN, "en");
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    render(
      <LanguageProvider>
        <TestMarkdownComponent text={MD} />
      </LanguageProvider>
    );

    expect(screen.getByTestId("md-translated").textContent).toBe(EN_MD);
    expect(screen.getByTestId("md-pending").textContent).toBe("done");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("sends only the uncached sections to the API and mixes in cached ones", async () => {
    translator.setCachedTranslation(SEC1, SEC1_EN, "en");
    const fetchSpy = mockFetchTranslations([{ original: SEC2, translated: SEC2_EN }]);

    render(
      <LanguageProvider>
        <TestMarkdownComponent text={MD} />
      </LanguageProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId("md-translated").textContent).toBe(EN_MD);
      expect(screen.getByTestId("md-pending").textContent).toBe("done");
    });

    const call = fetchSpy.mock.calls.find((c) => String(c[0]).includes("/api/translate"));
    const body = JSON.parse(String((call?.[1] as any)?.body));
    expect(body.texts).toEqual([SEC2]);
  });

  it("falls back to original per-section when the API fails", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("Offline"));

    render(
      <LanguageProvider>
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
      <LanguageProvider>
        <TestMarkdownComponent text={MD} />
      </LanguageProvider>
    );

    expect(screen.getByTestId("md-pending").textContent).toBe("loading");

    translator.setCachedTranslation(SEC1, SEC1_EN, "en");

    await waitFor(() => {
      expect(screen.getByTestId("md-translated").textContent).toBe(`${SEC1_EN}\n\n${SEC2}`);
      expect(screen.getByTestId("md-pending").textContent).toBe("loading");
    });
  });

  it("retains markdown structure including checklists, bold, and subheadings across translations", async () => {
    const complexMd = "# Agenda\n\n- [ ] Tarea 1 (@Mei)\n- [x] Tarea 2\n\n**Aviso importante**\n\n> Línea de cita";
    const complexEn = "# Agenda\n\n- [ ] Task 1 (@Mei)\n- [x] Task 2\n\n**Important notice**\n\n> Quote line";
    translator.setCachedTranslation(complexMd, complexEn, "en");

    render(
      <LanguageProvider>
        <TestMarkdownComponent text={complexMd} />
      </LanguageProvider>
    );

    expect(screen.getByTestId("md-translated").textContent).toBe(complexEn);
    expect(screen.getByTestId("md-translated").textContent).toContain("- [ ] Task 1 (@Mei)");
    expect(screen.getByTestId("md-translated").textContent).toContain("**Important notice**");
  });
});
