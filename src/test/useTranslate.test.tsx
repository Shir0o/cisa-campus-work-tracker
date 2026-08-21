import { describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { useTranslate } from "../hooks/useTranslate";
import { Translate } from "../components/Translate";
import { LanguageToggle } from "../components/LanguageToggle";
import { LanguageProvider, useLanguage } from "../components/LanguageProvider";
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

  it("Translate component supports children as string content", async () => {
    translator.setCachedTranslation("Settings", "Ajustes", "es");

    render(
      <LanguageProvider defaultLanguage="es">
        <Translate as="div" data-testid="settings-label">Settings</Translate>
      </LanguageProvider>
    );

    const el = screen.getByTestId("settings-label");
    expect(el.tagName.toLowerCase()).toBe("div");
    expect(el.textContent).toBe("Ajustes");
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
  });
});
