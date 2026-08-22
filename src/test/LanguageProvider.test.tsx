import { describe, it, expect, beforeEach } from "vitest";
import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { LanguageProvider, useLanguage } from "../components/LanguageProvider";

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

describe("LanguageProvider browser metadata", () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.lang = "en";
    document.title = "";
    document.querySelector('meta[name="description"]')?.remove();
    document.querySelector('link[rel="manifest"]')?.remove();
  });

  it("updates html lang, title, description, and manifest for Spanish", () => {
    render(
      <LanguageProvider defaultLanguage="es">
        <TestLanguageSwitcher />
      </LanguageProvider>,
    );

    expect(document.documentElement.lang).toBe("es");
    expect(document.title).toBe("CISA Campus Work Tracker");
    expect(document.querySelector('meta[name="description"]')?.getAttribute("content")).toContain(
      "Gestión colaborativa de contactos",
    );
    expect(document.querySelector('link[rel="manifest"]')?.getAttribute("href")).toBe(
      "/manifest-es.json",
    );
  });

  it("switches metadata back to English when language changes", () => {
    render(
      <LanguageProvider defaultLanguage="es">
        <TestLanguageSwitcher />
      </LanguageProvider>,
    );

    fireEvent.click(screen.getByText("Switch EN"));

    expect(document.documentElement.lang).toBe("en");
    expect(document.title).toBe("CISA Campus Work Tracker");
    expect(document.querySelector('meta[name="description"]')?.getAttribute("content")).toBe(
      "Collaborative campus ministry contact management, outreach planning, and journey tracking.",
    );
    expect(document.querySelector('link[rel="manifest"]')?.getAttribute("href")).toBe(
      "/manifest.json",
    );
  });

  it("creates a description meta tag when none exists", () => {
    render(
      <LanguageProvider defaultLanguage="en">
        <TestLanguageSwitcher />
      </LanguageProvider>,
    );

    const meta = document.querySelector('meta[name="description"]');
    expect(meta).not.toBeNull();
    expect(meta?.getAttribute("content")).toContain("Collaborative campus ministry");
  });
});
