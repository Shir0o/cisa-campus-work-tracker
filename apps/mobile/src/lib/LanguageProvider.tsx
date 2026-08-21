import React, { createContext, useContext, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuth } from './AuthProvider';
import type { AppLanguage } from './translator';

interface LanguageContextType {
  language: AppLanguage;
  setLanguage: (lang: AppLanguage) => void;
  isSpanish: boolean;
}

const STORAGE_KEY = 'cisa_language';

const LanguageContext = createContext<LanguageContextType | null>(null);

export function LanguageProvider({
  children,
  defaultLanguage = 'en',
}: {
  children: React.ReactNode;
  defaultLanguage?: AppLanguage;
}) {
  let effectiveUserId: string | null = null;
  try {
    const auth = useAuth();
    effectiveUserId = auth.effectiveUserId;
  } catch {
    // AuthProvider not in tree
  }

  const [language, setLanguageState] = useState<AppLanguage>(defaultLanguage);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY).then((saved) => {
      if (saved === 'en' || saved === 'es') {
        setLanguageState(saved);
      }
    }).catch(() => {});
  }, []);

  // Sync with Firestore user preferences if authenticated
  useEffect(() => {
    if (!effectiveUserId) return;

    let unsubscribe = () => {};
    import('./data/userPreferences').then(({ subscribeUserPreferences }) => {
      unsubscribe = subscribeUserPreferences(effectiveUserId!, (prefs) => {
        if (prefs.language && (prefs.language === 'en' || prefs.language === 'es')) {
          setLanguageState(prefs.language);
          AsyncStorage.setItem(STORAGE_KEY, prefs.language).catch(() => {});
        }
      });
    }).catch(() => {});

    return () => {
      unsubscribe();
    };
  }, [effectiveUserId]);

  const setLanguage = React.useCallback((lang: AppLanguage) => {
    setLanguageState(lang);
    AsyncStorage.setItem(STORAGE_KEY, lang).catch(() => {});
    if (effectiveUserId) {
      import('./data/userPreferences').then(({ saveUserPreferences }) => {
        saveUserPreferences(effectiveUserId!, { language: lang }).catch(() => {});
      }).catch(() => {});
    }
  }, [effectiveUserId]);

  const value = React.useMemo<LanguageContextType>(
    () => ({
      language,
      setLanguage,
      isSpanish: language === 'es',
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
      language: 'en' as AppLanguage,
      setLanguage: () => {},
      isSpanish: false,
    };
  }
  return context;
}
