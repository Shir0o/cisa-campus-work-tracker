import React from "react";
import { X } from "lucide-react";
import { useLanguage } from "../LanguageProvider";

export default function AboutSheet({
  open,
  name,
  onClose,
  children,
}: {
  open: boolean;
  name: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const { t } = useLanguage();
  if (!open) return null;

  const title = t('modals.contactDetails.about_person').replace('{name}', name);

  return (
    <div
      className="fixed inset-0 z-[90] flex justify-end bg-black/40"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-label={title}
        className="w-full max-w-md h-full overflow-y-auto bg-surface border-l border-outline-variant shadow-xl p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-serif text-lg font-semibold text-on-surface">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label={t('modals.contactDetails.close')}
            title={t('modals.contactDetails.close')}
            className="w-9 h-9 rounded-full hover:bg-surface-container-high text-on-surface-variant flex items-center justify-center transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
