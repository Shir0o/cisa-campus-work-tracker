import { describe, it, expect, beforeEach } from "vitest";
import React from "react";
import { render, screen } from "@testing-library/react";
import { LanguageProvider, useLanguage } from "../components/LanguageProvider";

function ShowLanguage() {
  const { language, t } = useLanguage();
  return (
    <div>
      <span data-testid="current-lang">{language}</span>
      <span data-testid="nav-my-day">{t("nav.my_day")}</span>
    </div>
  );
}

describe("LanguageProvider (English only)", () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.lang = "en";
    document.title = "";
    document.querySelector('meta[name="description"]')?.remove();
    document.querySelector('link[rel="manifest"]')?.remove();
  });

  it("falls back to English when a stored preference is Spanish", () => {
    localStorage.setItem("cisa_language", "es");
    render(
      <LanguageProvider>
        <ShowLanguage />
      </LanguageProvider>,
    );

    expect(screen.getByTestId("current-lang").textContent).toBe("en");
    expect(screen.getByTestId("nav-my-day").textContent).toBe("My Day");
    expect(document.documentElement.lang).toBe("en");
    expect(document.querySelector('link[rel="manifest"]')?.getAttribute("href") ?? "/manifest.json").toBe(
      "/manifest.json",
    );
  });

  it("sets html lang, title and description in English", () => {
    render(
      <LanguageProvider>
        <ShowLanguage />
      </LanguageProvider>,
    );

    expect(document.documentElement.lang).toBe("en");
    expect(document.title).toBe("CISA Campus Work Tracker");
    expect(document.querySelector('meta[name="description"]')?.getAttribute("content")).toBe(
      "Collaborative campus ministry contact management, outreach planning, and journey tracking.",
    );
  });
});
