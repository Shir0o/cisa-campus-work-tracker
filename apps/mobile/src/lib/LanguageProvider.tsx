import React, { createContext, useContext } from 'react';
import { translate } from './i18n';

export type TranslateFunction = (key: string, fallback?: string) => string;

interface LanguageContextType {
  language: 'en';
  t: TranslateFunction;
}

const LANGUAGE = 'en' as const;

const t: TranslateFunction = (key, fallback) => translate(key, LANGUAGE, fallback);

const VALUE: LanguageContextType = { language: LANGUAGE, t };

const LanguageContext = createContext<LanguageContextType>(VALUE);

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  return <LanguageContext.Provider value={VALUE}>{children}</LanguageContext.Provider>;
}

export function useLanguage() {
  return useContext(LanguageContext);
}
