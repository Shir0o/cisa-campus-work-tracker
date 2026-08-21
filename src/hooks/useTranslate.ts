import { useState, useEffect } from "react";
import { useLanguage } from "../components/LanguageProvider";
import {
  getCachedTranslation,
  translateText,
  subscribeTranslation,
  computeTranslationHash,
} from "../lib/translator";
import type { AppLanguage } from "../lib/userPreferences";

export interface UseTranslateOptions {
  targetLang?: AppLanguage;
  enabled?: boolean;
}

export function useTranslate(
  text: string | null | undefined,
  options?: UseTranslateOptions,
) {
  const { language } = useLanguage();
  const targetLang = options?.targetLang ?? language;
  const enabled = options?.enabled ?? true;

  const rawText = text ?? "";
  const isEn = targetLang === "en" || !enabled || !rawText.trim();

  // Initial sync check against L1/L2 cache
  const cached = isEn ? rawText : getCachedTranslation(rawText, targetLang);
  const [translatedText, setTranslatedText] = useState<string>(cached ?? rawText);
  const [isPending, setIsPending] = useState<boolean>(!isEn && cached === null);

  useEffect(() => {
    if (isEn) {
      setTranslatedText(rawText);
      setIsPending(false);
      return;
    }

    const currentCached = getCachedTranslation(rawText, targetLang);
    if (currentCached !== null) {
      setTranslatedText(currentCached);
      setIsPending(false);
      return;
    }

    setIsPending(true);
    let isMounted = true;

    const hash = computeTranslationHash(targetLang, rawText);
    const unsubscribe = subscribeTranslation(hash, (newTranslation) => {
      if (isMounted) {
        setTranslatedText(newTranslation);
        setIsPending(false);
      }
    });

    translateText(rawText, targetLang)
      .then((res) => {
        if (isMounted) {
          setTranslatedText(res);
          setIsPending(false);
        }
      })
      .catch(() => {
        if (isMounted) {
          setTranslatedText(rawText);
          setIsPending(false);
        }
      });

    return () => {
      isMounted = false;
      unsubscribe();
    };
  }, [rawText, targetLang, isEn]);

  return {
    translatedText,
    isPending,
    isCached: !isPending,
    originalText: rawText,
  };
}
