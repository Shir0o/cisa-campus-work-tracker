import React, { createContext, useContext, useEffect, useState } from "react";
import { AppLanguage, saveUserPreferences, subscribeUserPreferences } from "../lib/userPreferences";
import { useAuth } from "./AuthProvider";

interface LanguageContextType {
  language: AppLanguage;
  setLanguage: (lang: AppLanguage) => void;
  isSpanish: boolean;
}

const STORAGE_KEY = "cisa_language";

const LanguageContext = createContext<LanguageContextType | null>(null);

export function LanguageProvider({
  children,
  defaultLanguage = "en",
}: {
  children: React.ReactNode;
  defaultLanguage?: AppLanguage;
}) {
  let effectiveUserId: string | null = null;
  try {
    const auth = useAuth();
    effectiveUserId = auth.effectiveUserId;
  } catch {
    // AuthProvider not in tree (e.g. standalone test)
  }
  const [language, setLanguageState] = useState<AppLanguage>(() => {
    if (typeof window !== "undefined" && window.localStorage) {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved === "en" || saved === "es") {
        return saved;
      }
    }
    return defaultLanguage;
  });

  // Sync with Firestore user preferences if authenticated
  useEffect(() => {
    if (!effectiveUserId) return;

    const unsubscribe = subscribeUserPreferences(effectiveUserId, (prefs) => {
      if (prefs.language && (prefs.language === "en" || prefs.language === "es")) {
        setLanguageState(prefs.language);
        if (typeof window !== "undefined") {
          localStorage.setItem(STORAGE_KEY, prefs.language);
        }
      }
    });

    return unsubscribe;
  }, [effectiveUserId]);

  const setLanguage = React.useCallback((lang: AppLanguage) => {
    setLanguageState(lang);
    if (typeof window !== "undefined" && window.localStorage) {
      localStorage.setItem(STORAGE_KEY, lang);
    }
    if (effectiveUserId) {
      saveUserPreferences(effectiveUserId, { language: lang });
    }
  }, [effectiveUserId]);

  const value = React.useMemo<LanguageContextType>(
    () => ({
      language,
      setLanguage,
      isSpanish: language === "es",
    }),
    [language, setLanguage],
  );

  return (
    <LanguageContext.Provider value={value}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  const context = useContext(LanguageContext);
  if (!context) {
    return {
      language: "en" as AppLanguage,
      setLanguage: () => {},
      isSpanish: false,
    };
  }
  return context;
}
