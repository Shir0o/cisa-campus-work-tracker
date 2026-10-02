import React from "react";
import { MessageSquare } from "lucide-react";
import { useLanguage } from "../LanguageProvider";

export default function ContactReachPrompt({
  name,
  onAccept,
  onDismiss,
}: {
  name: string;
  onAccept: () => void;
  onDismiss: () => void;
}) {
  const { t } = useLanguage();

  return (
    <div className="cd-reach-prompt flex items-center gap-3 px-5 py-3 bg-primary-container text-on-primary-container border-b border-outline-variant/40">
      <button
        type="button"
        onClick={onAccept}
        className="flex-1 inline-flex items-center justify-center gap-2 min-h-[44px] rounded-full bg-primary text-on-primary font-semibold px-4 text-sm"
      >
        <MessageSquare className="w-4 h-4" />
        {t('modals.contactDetails.messaged_prompt').replace('{name}', name)}
      </button>
      <button
        type="button"
        onClick={onDismiss}
        className="text-sm font-semibold text-on-surface-variant hover:text-on-surface transition-colors shrink-0"
      >
        {t('modals.contactDetails.messaged_prompt_dismiss')}
      </button>
    </div>
  );
}
