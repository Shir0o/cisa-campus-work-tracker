import React, { useState, useEffect } from 'react';
import { Text, type TextProps } from 'react-native';
import { useLanguage } from '../lib/LanguageProvider';
import { splitMarkdownByH1, joinMarkdownSections } from '@cisa/core';
import {
  getCachedTranslation,
  getAsyncCachedTranslation,
  setCachedTranslation,
  translateText,
  translateBatch,
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

    setIsPending(true);
    let isMounted = true;
    let unsubscribe = () => {};

    const startTranslation = () => {
      const hash = computeTranslationHash(targetLang, rawText);
      unsubscribe = subscribeTranslation(hash, (newTranslation) => {
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
    };

    getAsyncCachedTranslation(rawText, targetLang)
      .then((asyncCached) => {
        if (!isMounted) return;
        if (asyncCached !== null) {
          setTranslatedText(asyncCached);
          setIsPending(false);
          return;
        }
        startTranslation();
      })
      .catch(() => {
        if (isMounted) startTranslation();
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

// Markdown-aware variant for long board pages. The doc is split into "# "
// sections and each section is translated independently with its own cache
// hash, so an edit to one section only re-translates that section — unchanged
// sections reuse their cached translation (see translateMarkdown).
export function useTranslateMarkdown(
  text: string | null | undefined,
  options?: UseTranslateOptions,
) {
  const { language } = useLanguage();
  const targetLang = options?.targetLang ?? language;
  const enabled = options?.enabled ?? true;

  const rawText = text ?? '';
  const isEn = targetLang === 'en' || !enabled || !rawText.trim();

  const split = () => (isEn ? [rawText] : splitMarkdownByH1(rawText));
  const join = (parts: string[]) => (isEn ? rawText : joinMarkdownSections(parts));

  const initial = split().map((s) => getCachedTranslation(s, targetLang) ?? s);
  const [translatedSections, setTranslatedSections] = useState<string[]>(initial);
  const [isPending, setIsPending] = useState<boolean>(
    !isEn && split().some((s) => getCachedTranslation(s, targetLang) === null),
  );

  useEffect(() => {
    if (isEn) {
      setTranslatedSections([rawText]);
      setIsPending(false);
      return;
    }

    let mounted = true;
    const secs = splitMarkdownByH1(rawText);
    const unsubscribes: Array<() => void> = [];

    const refresh = () => {
      if (!mounted) return;
      setTranslatedSections(secs.map((s) => getCachedTranslation(s, targetLang) ?? s));
      setIsPending(secs.some((s) => getCachedTranslation(s, targetLang) === null));
    };

    const start = () => {
      if (!mounted) return;
      const missing = secs.filter((s) => getCachedTranslation(s, targetLang) === null);
      missing.forEach((s) =>
        unsubscribes.push(subscribeTranslation(computeTranslationHash(targetLang, s), refresh)),
      );
      if (missing.length > 0) {
        translateBatch(missing, targetLang)
          .then((results) => {
            if (!mounted) return;
            missing.forEach((s, i) => setCachedTranslation(s, results[i], targetLang));
            refresh();
          })
          .catch(() => {
            if (!mounted) return;
            setTranslatedSections(secs.map((s) => getCachedTranslation(s, targetLang) ?? s));
            setIsPending(false);
          });
      }
      refresh();
    };

    const l1Missing = secs.filter((s) => getCachedTranslation(s, targetLang) === null);
    if (l1Missing.length === 0) {
      start();
    } else {
      // Warm L2 (AsyncStorage) so sections cached on a previous launch are
      // reused instead of being re-sent to the API.
      Promise.all(l1Missing.map((s) => getAsyncCachedTranslation(s, targetLang).then((t) => ({ s, t }))))
        .then((hits) => {
          if (!mounted) return;
          hits.forEach(({ s, t }) => {
            if (t) setCachedTranslation(s, t, targetLang);
          });
          refresh();
          start();
        })
        .catch(() => {
          if (mounted) start();
        });
    }

    return () => {
      mounted = false;
      unsubscribes.forEach((u) => u());
    };
  }, [rawText, targetLang, isEn]);

  return {
    translatedText: join(translatedSections),
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
