import React from "react";
import { useTranslate } from "../hooks/useTranslate";
import type { AppLanguage } from "../lib/userPreferences";

export interface TranslateProps extends React.HTMLAttributes<HTMLElement> {
  text?: string | null;
  children?: React.ReactNode;
  as?: React.ElementType;
  targetLang?: AppLanguage;
  enabled?: boolean;
}

export function Translate({
  text,
  children,
  as: Component = "span",
  targetLang,
  enabled = true,
  className,
  ...rest
}: TranslateProps) {
  const content = text !== undefined ? text : (typeof children === "string" || typeof children === "number" ? String(children) : null);
  const { translatedText } = useTranslate(content, { targetLang, enabled });
  return <Component className={className} {...rest}>{translatedText}</Component>;
}
