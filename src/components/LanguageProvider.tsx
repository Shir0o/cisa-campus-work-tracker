import React, { createContext, useContext, useEffect } from "react";
import type { AppLanguage } from "../lib/userPreferences";
import { t as translateKey } from "../lib/i18n";
import { claimedDocumentTitle } from "../lib/documentTitle";

interface LanguageContextType {
  language: AppLanguage;
  t: (key: string, fallback?: string) => string;
}

const LANGUAGE: AppLanguage = "en";

const t = (key: string, fallback?: string) => translateKey(key, LANGUAGE, fallback);

const LanguageContext = createContext<LanguageContextType | null>(null);

const VALUE: LanguageContextType = { language: LANGUAGE, t };

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  // Keep browser metadata in sync with the English strings.
  useEffect(() => {
    if (typeof document === "undefined") return;

    document.documentElement.lang = LANGUAGE;
    // A route that names its own page (the study readers, #1814/#1838) keeps
    // that name: effects run before this one, so the route's title is already
    // on the document.
    document.title = claimedDocumentTitle() ?? translateKey("meta.title", LANGUAGE);

    let metaDescription = document.querySelector<HTMLMetaElement>('meta[name="description"]');
    if (!metaDescription) {
      metaDescription = document.createElement("meta");
      metaDescription.setAttribute("name", "description");
      document.head.appendChild(metaDescription);
    }
    metaDescription.setAttribute("content", translateKey("meta.description", LANGUAGE));
  }, []);

  return (
    <LanguageContext.Provider value={VALUE}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  return useContext(LanguageContext) ?? VALUE;
}

export function useI18n() {
  const { t, language } = useLanguage();
  return { t, language };
}
