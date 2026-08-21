import React, { useState, useEffect } from 'react';
import { Text, type TextProps } from 'react-native';
import { useLanguage } from '../lib/LanguageProvider';
import {
  getCachedTranslation,
  translateText,
  subscribeTranslation,
  computeTranslationHash,
  type AppLanguage,
} from '../lib/translator';

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

  const rawText = text ?? '';
  const isEn = targetLang === 'en' || !enabled || !rawText.trim();

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

export interface TranslateProps extends TextProps {
  text?: string | null;
  children?: React.ReactNode;
  targetLang?: AppLanguage;
  enabled?: boolean;
}

export function Translate({
  text,
  children,
  targetLang,
  enabled = true,
  style,
  ...rest
}: TranslateProps) {
  const content =
    text !== undefined
      ? text
      : typeof children === 'string' || typeof children === 'number'
        ? String(children)
        : null;

  const { translatedText } = useTranslate(content, { targetLang, enabled });

  return (
    <Text style={style} {...rest}>
      {translatedText}
    </Text>
  );
}
