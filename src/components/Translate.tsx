import React from "react";
import { useTranslate } from "../hooks/useTranslate";
import type { AppLanguage } from "../lib/userPreferences";

export interface TranslateProps extends React.HTMLAttributes<HTMLElement> {
  text: string | null | undefined;
  as?: React.ElementType;
  targetLang?: AppLanguage;
  enabled?: boolean;
  children?: never;
}

export function Translate({
  text,
  as: Component = "span",
  targetLang,
  enabled = true,
  className,
  ...rest
}: TranslateProps) {
  const { translatedText } = useTranslate(text, { targetLang, enabled });
  return <Component className={className} {...rest}>{translatedText}</Component>;
}
