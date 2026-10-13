import React from "react";
import { useLanguage } from "../LanguageProvider";

export default function ContactEditFooter({
  onCancel,
  loading,
}: {
  onCancel: () => void;
  loading: boolean;
}) {
  const { t } = useLanguage();

  return (
    <div className="cd-page-foot">
      <div className="flex gap-3 w-full sm:w-auto ml-auto">
        <button
          type="button"
          onClick={onCancel}
          className="flex-1 sm:flex-none px-6 h-10 rounded-full font-semibold text-on-surface-variant hover:bg-surface-variant text-sm transition-colors"
        >
          Cancel
        </button>
        <button
          form="edit-contact-form"
          type="submit"
          disabled={loading}
          className="flex-[2] sm:flex-none px-8 h-10 rounded-full bg-primary text-on-primary font-semibold hover: active:scale-[0.98] transition-all flex items-center justify-center gap-2 text-sm disabled:opacity-70"
        >
          {loading ? (
            <span className="animate-pulse">{t("modals.contactDetails.saving")}</span>
          ) : (
            t("modals.contactDetails.save_changes")
          )}
        </button>
      </div>
    </div>
  );
}
